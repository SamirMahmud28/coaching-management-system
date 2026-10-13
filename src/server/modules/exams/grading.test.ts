import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../core/testing/db";
import { auditLogs, tenants } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import { createLogin } from "../auth/credentials";
import { getGradeScale, resetGradeScale, saveGradeScale } from "./grading";
import { DEFAULT_GRADE_SCALE } from "./result-engine";

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;

beforeEach(async () => {
  await reset();
  await seedPlatformCatalog(testDb);
});
afterAll(async () => {
  await close();
});

async function setUp(sub: string) {
  const [tenant] = await testDb.insert(tenants).values({ name: sub, subdomain: sub, status: "ACTIVE" }).returning();
  const owner = await createLogin(db, { tenantId: tenant.id, name: "Owner", email: `o@${sub}.test`, password: "OwnerPass1" });
  return { tenantId: tenant.id, userId: owner.id };
}

describe("the grading scale (D102)", () => {
  it("is the BD 5.0 scale until the institute saves its own, and can go back to it", async () => {
    const a = await setUp("grade-a");
    const b = await setUp("grade-b");
    expect(await getGradeScale(db, a.tenantId)).toEqual({ bands: [...DEFAULT_GRADE_SCALE], isDefault: true });

    const own = [{ grade: "A+", minPercent: 85, gradePoint: 5 }, { grade: "A", minPercent: 70, gradePoint: 4 }, { grade: " F ", minPercent: 0, gradePoint: 0 }];
    await saveGradeScale(db, a, own);
    expect(await getGradeScale(db, a.tenantId)).toMatchObject({ isDefault: false, bands: [{ grade: "A+", minPercent: 85 }, { grade: "A" }, { grade: "F" }] });
    // Another institute is untouched.
    expect((await getGradeScale(db, b.tenantId)).isDefault).toBe(true);

    await resetGradeScale(db, a);
    expect((await getGradeScale(db, a.tenantId)).isDefault).toBe(true);
    const actions = (await testDb.select().from(auditLogs).where(eq(auditLogs.tenantId, a.tenantId))).map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(["GRADE_SCALE_SAVED", "GRADE_SCALE_RESET"]));
  });

  it("refuses a scale that would leave marks without a grade", async () => {
    const a = await setUp("grade-c");
    await expect(saveGradeScale(db, a, [{ grade: "P", minPercent: 40, gradePoint: 1 }, { grade: "F", minPercent: 10, gradePoint: 0 }])).rejects.toMatchObject({ code: "VALIDATION_GRADE_SCALE" });
  });
});
