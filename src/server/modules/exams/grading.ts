import { eq } from "drizzle-orm";
import { gradeScales } from "../../core/db/schema";
import { inTransaction } from "../../core/db/transaction";
import type { DbOrTx } from "../../core/db/types";
import { ValidationError } from "../../core/errors";
import { audit } from "../audit/service";
import { DEFAULT_GRADE_SCALE, sortScale, validateGradeScale, type GradeBand } from "./result-engine";

// The institute's grading scale (D102): the BD 5.0 scale until it saves its own. A change applies to draft exams and
// exams published later; a published exam keeps the scale it was published with (D112, `exams.published_scale`).

export interface Actor {
  tenantId: string;
  userId: string;
}

const clean = (bands: readonly GradeBand[]): GradeBand[] =>
  sortScale(bands.map((b) => ({ grade: String(b.grade ?? "").trim(), minPercent: Number(b.minPercent), gradePoint: Number(b.gradePoint) })));

export async function getGradeScale(db: DbOrTx, tenantId: string): Promise<{ bands: GradeBand[]; isDefault: boolean }> {
  const [row] = await db.select().from(gradeScales).where(eq(gradeScales.tenantId, tenantId));
  if (!row) return { bands: sortScale(DEFAULT_GRADE_SCALE), isDefault: true };
  return { bands: sortScale(row.bands as GradeBand[]), isDefault: false };
}

/** Saves the institute's own scale, after the same checks as the EMS (every mark gets one grade; F is the only 0). */
export async function saveGradeScale(db: DbOrTx, actor: Actor, input: readonly GradeBand[]) {
  const bands = clean(input);
  const problem = validateGradeScale(bands);
  if (problem) throw new ValidationError("VALIDATION_GRADE_SCALE", problem, { field: "bands" });
  return inTransaction(db, async (tx) => {
    const before = await getGradeScale(tx, actor.tenantId);
    await tx
      .insert(gradeScales)
      .values({ tenantId: actor.tenantId, bands, updatedBy: actor.userId })
      .onConflictDoUpdate({ target: gradeScales.tenantId, set: { bands, updatedAt: new Date(), updatedBy: actor.userId } });
    await audit.record(tx, {
      tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action: "GRADE_SCALE_SAVED", resourceType: "GRADE_SCALE", resourceId: actor.tenantId,
      oldValue: { bands: before.bands, isDefault: before.isDefault }, newValue: { bands },
    });
    return { bands, isDefault: false };
  });
}

/** Goes back to the BD 5.0 default. */
export async function resetGradeScale(db: DbOrTx, actor: Actor) {
  return inTransaction(db, async (tx) => {
    const before = await getGradeScale(tx, actor.tenantId);
    if (before.isDefault) return before;
    await tx.delete(gradeScales).where(eq(gradeScales.tenantId, actor.tenantId));
    await audit.record(tx, {
      tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action: "GRADE_SCALE_RESET", resourceType: "GRADE_SCALE", resourceId: actor.tenantId,
      oldValue: { bands: before.bands }, newValue: { bands: sortScale(DEFAULT_GRADE_SCALE), isDefault: true },
    });
    return { bands: sortScale(DEFAULT_GRADE_SCALE), isDefault: true };
  });
}
