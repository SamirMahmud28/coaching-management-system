import { and, asc, eq, sql } from "drizzle-orm";
import { batchMemberships, batches, courses, feeItems, feeSettings, studentFeeAmounts, students } from "../../core/db/schema";
import { getInTenant } from "../../core/db/tenant-scope";
import { inTransaction } from "../../core/db/transaction";
import type { DbOrTx } from "../../core/db/types";
import { ConflictError, InUseError, ValidationError, mapDatabaseError } from "../../core/errors";
import { fromPoisha, isAmountText, toPoisha } from "@/lib/money";
import { audit } from "../audit/service";
import "./references";

// Fee setup (Fees F2): a course's fee items (D28), a student's own amounts (D29) and the receipt prefix (D38).

export interface Actor {
  tenantId: string;
  userId: string;
}

export type FeeItemKind = "ADMISSION" | "MONTHLY" | "ONE_TIME";
export const FEE_ITEM_KINDS: readonly FeeItemKind[] = ["ADMISSION", "MONTHLY", "ONE_TIME"];

const UNIQUE = {
  fee_items_course_name_lower_idx: { code: "CONFLICT_FEE_ITEM_NAME", field: "name", message: "This course already has a fee with this name." },
};

const record = (tx: DbOrTx, actor: Actor, action: string, resourceType: string, resourceId: string, values: { oldValue?: Record<string, unknown> | null; newValue?: Record<string, unknown> | null } = {}) =>
  audit.record(tx, { tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action, resourceType, resourceId, ...values });

/** A taka amount as sent ("2000", "2000.50") → the stored text ("2000.00"). `allowZero` for a student's own amount. */
export function cleanAmount(value: string, field = "amount", allowZero = false): string {
  const text = String(value).trim();
  if (!isAmountText(text)) throw new ValidationError("VALIDATION_AMOUNT", "Enter an amount in taka, with at most two decimals.", { field });
  const poisha = toPoisha(text);
  if (poisha === 0 && !allowZero) throw new ValidationError("VALIDATION_AMOUNT", "The amount must be more than zero.", { field });
  return fromPoisha(poisha);
}

function cleanText(value: string | null | undefined, max: number, field: string, label: string, required: boolean): string | null {
  const text = value?.trim() || null;
  if (!text && required) throw new ValidationError("VALIDATION_REQUIRED", `${label} is required.`, { field });
  if (text && text.length > max) throw new ValidationError("VALIDATION_TEXT", `${label} can be at most ${max} characters.`, { field });
  return text;
}

// ---------------------------------------------------------------------------
// Fee items
// ---------------------------------------------------------------------------

export async function listFeeItems(db: DbOrTx, tenantId: string, params: { courseId?: string; status?: "ACTIVE" | "ARCHIVED" } = {}) {
  return db
    .select({
      id: feeItems.id,
      courseId: feeItems.courseId,
      courseName: courses.name,
      courseCode: courses.code,
      courseDueDay: courses.dueDay,
      kind: feeItems.kind,
      name: feeItems.name,
      amount: feeItems.amount,
      status: feeItems.status,
    })
    .from(feeItems)
    .innerJoin(courses, and(eq(courses.tenantId, feeItems.tenantId), eq(courses.id, feeItems.courseId)))
    .where(and(eq(feeItems.tenantId, tenantId), params.courseId ? eq(feeItems.courseId, params.courseId) : undefined, params.status ? eq(feeItems.status, params.status) : undefined))
    .orderBy(asc(courses.name), sql`case ${feeItems.kind} when 'ADMISSION' then 0 when 'MONTHLY' then 1 else 2 end`, asc(feeItems.name));
}

export async function createFeeItem(db: DbOrTx, actor: Actor, input: { courseId: string; kind: FeeItemKind; name: string; amount: string }) {
  if (!FEE_ITEM_KINDS.includes(input.kind)) throw new ValidationError("VALIDATION_FEE_KIND", "Choose admission, monthly or one-time.", { field: "kind" });
  const name = cleanText(input.name, 100, "name", "The name", true)!;
  const amount = cleanAmount(input.amount);
  return inTransaction(db, async (tx) => {
    const course = await getInTenant(tx, courses, actor.tenantId, input.courseId, "COURSE");
    if (course.status !== "ACTIVE") throw new ConflictError("CONFLICT_COURSE_ARCHIVED", "This course is archived.", { field: "courseId" });
    const [row] = await tx
      .insert(feeItems)
      .values({ tenantId: actor.tenantId, courseId: course.id, kind: input.kind, name, amount, createdBy: actor.userId, updatedBy: actor.userId })
      .returning()
      .catch((err) => {
        throw mapDatabaseError(err, { entity: "FEE_ITEM", operation: "write", unique: UNIQUE }) ?? err;
      });
    await record(tx, actor, "FEE_ITEM_CREATED", "FEE_ITEM", row.id, { newValue: { course: course.code, kind: input.kind, name, amount } });
    return row;
  });
}

/** Name and amount. A new amount applies to charges generated from now on; existing charges keep theirs. */
export async function updateFeeItem(db: DbOrTx, actor: Actor, id: string, input: { name?: string; amount?: string }) {
  return inTransaction(db, async (tx) => {
    const existing = await getInTenant(tx, feeItems, actor.tenantId, id, "FEE_ITEM");
    const name = input.name === undefined ? existing.name : cleanText(input.name, 100, "name", "The name", true)!;
    const amount = input.amount === undefined ? existing.amount : cleanAmount(input.amount);
    const [row] = await tx
      .update(feeItems)
      .set({ name, amount, updatedAt: new Date(), updatedBy: actor.userId })
      .where(and(eq(feeItems.tenantId, actor.tenantId), eq(feeItems.id, id)))
      .returning()
      .catch((err) => {
        throw mapDatabaseError(err, { entity: "FEE_ITEM", operation: "write", unique: UNIQUE }) ?? err;
      });
    await record(tx, actor, "FEE_ITEM_UPDATED", "FEE_ITEM", id, { oldValue: { name: existing.name, amount: existing.amount }, newValue: { name, amount } });
    return row;
  });
}

/** Archived items can't be generated; their charges stay as they are. */
export async function setFeeItemStatus(db: DbOrTx, actor: Actor, id: string, status: "ACTIVE" | "ARCHIVED") {
  return inTransaction(db, async (tx) => {
    const existing = await getInTenant(tx, feeItems, actor.tenantId, id, "FEE_ITEM");
    if (existing.status === status) return existing;
    const [row] = await tx.update(feeItems).set({ status, updatedAt: new Date(), updatedBy: actor.userId }).where(and(eq(feeItems.tenantId, actor.tenantId), eq(feeItems.id, id))).returning();
    await record(tx, actor, status === "ARCHIVED" ? "FEE_ITEM_ARCHIVED" : "FEE_ITEM_RESTORED", "FEE_ITEM", id);
    return row;
  });
}

/** Only an item that has never been charged and has no student amounts can be deleted; otherwise archive it. */
export async function deleteFeeItem(db: DbOrTx, actor: Actor, id: string) {
  return inTransaction(db, async (tx) => {
    const existing = await getInTenant(tx, feeItems, actor.tenantId, id, "FEE_ITEM");
    const [counts] = await tx
      .select({
        charges: sql<number>`(select count(*)::int from fee_charges c where c.tenant_id = ${actor.tenantId} and c.fee_item_id = ${id})`,
        amounts: sql<number>`(select count(*)::int from student_fee_amounts a where a.tenant_id = ${actor.tenantId} and a.fee_item_id = ${id})`,
      })
      .from(sql`(select 1) as one`);
    const references = [...(counts.charges ? [{ type: "FEE_CHARGE", count: counts.charges }] : []), ...(counts.amounts ? [{ type: "STUDENT_FEE_AMOUNT", count: counts.amounts }] : [])];
    if (references.length) throw new InUseError("FEE_ITEM", references);
    // The generation runs of an item that was never charged can't exist (a run always charges someone or isn't saved).
    await tx.delete(feeItems).where(and(eq(feeItems.tenantId, actor.tenantId), eq(feeItems.id, id)));
    await record(tx, actor, "FEE_ITEM_DELETED", "FEE_ITEM", id, { oldValue: { name: existing.name, amount: existing.amount } });
  });
}

// ---------------------------------------------------------------------------
// A student's own amounts (D29)
// ---------------------------------------------------------------------------

/**
 * The active fee items of every course the student is currently in, each with the course amount and the student's own
 * amount if one is set.
 */
export async function listStudentFeeAmounts(db: DbOrTx, tenantId: string, studentId: string) {
  await getInTenant(db, students, tenantId, studentId, "STUDENT");
  const inCourse = sql`exists (select 1 from ${batchMemberships} m join ${batches} b on b.tenant_id = m.tenant_id and b.id = m.batch_id
    where m.tenant_id = ${tenantId} and m.student_id = ${studentId} and m.status = 'ACTIVE' and b.course_id = ${feeItems.courseId})`;
  return db
    .select({
      feeItemId: feeItems.id,
      courseName: courses.name,
      kind: feeItems.kind,
      name: feeItems.name,
      courseAmount: feeItems.amount,
      id: studentFeeAmounts.id,
      amount: studentFeeAmounts.amount,
      reason: studentFeeAmounts.reason,
    })
    .from(feeItems)
    .innerJoin(courses, and(eq(courses.tenantId, feeItems.tenantId), eq(courses.id, feeItems.courseId)))
    .leftJoin(studentFeeAmounts, and(eq(studentFeeAmounts.tenantId, feeItems.tenantId), eq(studentFeeAmounts.feeItemId, feeItems.id), eq(studentFeeAmounts.studentId, studentId)))
    .where(and(eq(feeItems.tenantId, tenantId), eq(feeItems.status, "ACTIVE"), inCourse))
    .orderBy(asc(courses.name), asc(feeItems.name));
}

/** Sets (or changes) a student's own amount for a fee item, with a reason; used by generations from now on. */
export async function setStudentFeeAmount(db: DbOrTx, actor: Actor, studentId: string, input: { feeItemId: string; amount: string; reason: string }) {
  const amount = cleanAmount(input.amount, "amount", true);
  const reason = cleanText(input.reason, 300, "reason", "A reason", true)!;
  return inTransaction(db, async (tx) => {
    await getInTenant(tx, students, actor.tenantId, studentId, "STUDENT");
    const item = await getInTenant(tx, feeItems, actor.tenantId, input.feeItemId, "FEE_ITEM");
    const [existing] = await tx
      .select()
      .from(studentFeeAmounts)
      .where(and(eq(studentFeeAmounts.tenantId, actor.tenantId), eq(studentFeeAmounts.studentId, studentId), eq(studentFeeAmounts.feeItemId, item.id)));
    const [row] = await tx
      .insert(studentFeeAmounts)
      .values({ tenantId: actor.tenantId, studentId, feeItemId: item.id, amount, reason, createdBy: actor.userId, updatedBy: actor.userId })
      .onConflictDoUpdate({
        target: [studentFeeAmounts.tenantId, studentFeeAmounts.studentId, studentFeeAmounts.feeItemId],
        set: { amount, reason, updatedAt: new Date(), updatedBy: actor.userId },
      })
      .returning();
    await record(tx, actor, "STUDENT_FEE_AMOUNT_SET", "STUDENT", studentId, {
      oldValue: existing ? { feeItem: item.name, amount: existing.amount, reason: existing.reason } : { feeItem: item.name, amount: item.amount },
      newValue: { feeItem: item.name, amount, reason },
    });
    return row;
  });
}

/** Goes back to the course amount for future generations. */
export async function removeStudentFeeAmount(db: DbOrTx, actor: Actor, id: string) {
  return inTransaction(db, async (tx) => {
    const existing = await getInTenant(tx, studentFeeAmounts, actor.tenantId, id, "STUDENT_FEE_AMOUNT");
    await tx.delete(studentFeeAmounts).where(and(eq(studentFeeAmounts.tenantId, actor.tenantId), eq(studentFeeAmounts.id, id)));
    await record(tx, actor, "STUDENT_FEE_AMOUNT_REMOVED", "STUDENT", existing.studentId, { oldValue: { feeItemId: existing.feeItemId, amount: existing.amount, reason: existing.reason } });
  });
}

// ---------------------------------------------------------------------------
// Receipt prefix (D38)
// ---------------------------------------------------------------------------

export const DEFAULT_RECEIPT_PREFIX = "R";

export async function getFeeSettings(db: DbOrTx, tenantId: string) {
  const [row] = await db.select({ receiptPrefix: feeSettings.receiptPrefix }).from(feeSettings).where(eq(feeSettings.tenantId, tenantId));
  return { receiptPrefix: row?.receiptPrefix ?? DEFAULT_RECEIPT_PREFIX };
}

/** Used by receipts issued from now on; issued receipts keep the label they were printed with. */
export async function saveFeeSettings(db: DbOrTx, actor: Actor, input: { receiptPrefix: string }) {
  const receiptPrefix = input.receiptPrefix.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{0,9}$/.test(receiptPrefix)) {
    throw new ValidationError("VALIDATION_RECEIPT_PREFIX", "Use 1–10 capital letters and digits, starting with a letter (e.g. R or KCR).", { field: "receiptPrefix" });
  }
  return inTransaction(db, async (tx) => {
    const before = await getFeeSettings(tx, actor.tenantId);
    await tx
      .insert(feeSettings)
      .values({ tenantId: actor.tenantId, receiptPrefix, updatedBy: actor.userId })
      .onConflictDoUpdate({ target: feeSettings.tenantId, set: { receiptPrefix, updatedAt: new Date(), updatedBy: actor.userId } });
    await record(tx, actor, "FEE_SETTINGS_UPDATED", "FEE_SETTINGS", actor.tenantId, { oldValue: before, newValue: { receiptPrefix } });
    return { receiptPrefix };
  });
}

/** "R-000123": the prefix and a six-digit running number (D38). */
export const receiptLabel = (prefix: string, receiptNo: number) => `${prefix}-${String(receiptNo).padStart(6, "0")}`;

