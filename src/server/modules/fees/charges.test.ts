import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../core/testing/db";
import { auditLogs, feePaymentAllocations, feePayments, tenants, userRoles } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import { INSTITUTE_OWNER_ROLE } from "../../core/rbac/catalog";
import { todayInDhaka } from "@/lib/dates";
import * as academic from "../academic/service";
import { createLogin } from "../auth/credentials";
import { seedBaselineRoles } from "../rbac/service";
import * as students from "../students/service";
import { addFine, cancelCharge, cancelRun, confirmGeneration, dueDateFor, listStudentCharges, monthOf, previewGeneration } from "./charges";
import { createFeeItem, setStudentFeeAmount } from "./setup";

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;

beforeEach(async () => {
  await reset();
  await seedPlatformCatalog(testDb);
});
afterAll(async () => {
  await close();
});

const today = todayInDhaka();

async function setUp() {
  const [tenant] = await testDb.insert(tenants).values({ name: "Charges", subdomain: "charges", status: "ACTIVE" }).returning();
  const roleIds = await seedBaselineRoles(db, tenant.id);
  const owner = await createLogin(db, { tenantId: tenant.id, name: "Owner", email: "o@charges.test", password: "OwnerPass1" });
  await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: owner.id, roleId: roleIds[INSTITUTE_OWNER_ROLE] });
  const actor = { tenantId: tenant.id, userId: owner.id };
  const hsc = await academic.createCourse(db, actor, { name: "HSC", code: "HSC", dueDay: 10 });
  const ict = await academic.createCourse(db, actor, { name: "ICT", code: "ICT", dueDay: 5 });
  const morning = await academic.createBatch(db, actor, hsc.id, { name: "Morning" });
  const ictBatch = await academic.createBatch(db, actor, ict.id, { name: "Weekend" });
  const tuition = await createFeeItem(db, actor, { courseId: hsc.id, kind: "MONTHLY", name: "Tuition", amount: "2000" });
  const admission = await createFeeItem(db, actor, { courseId: hsc.id, kind: "ADMISSION", name: "Admission", amount: "1500" });
  const admit = async (fullName: string, admissionDate: string, batchIds = [morning.id]) =>
    (
      await students.admitStudent(db, actor, {
        fullName, gender: "FEMALE", guardianName: "G", guardianRelation: "MOTHER", guardianPhone: "01711000111", admissionDate, batchIds, temporaryPassword: "Student123",
      })
    ).student;
  /** Records a payment for whole charges straight in the database (collection itself arrives in F4). */
  const pay = (studentId: string, charges: { id: string; amount: string }[], receiptNo: number) =>
    testDb.transaction(async (tx) => {
      const total = charges.reduce((sum, c) => sum + Number(c.amount), 0).toFixed(2);
      const [p] = await tx
        .insert(feePayments)
        .values({ tenantId: tenant.id, studentId, receiptNo, receiptLabel: `R-${receiptNo}`, paidOn: today, method: "CASH", amount: total, receivedBy: owner.id, idempotencyKey: randomUUID() })
        .returning();
      await tx.insert(feePaymentAllocations).values(charges.map((c) => ({ tenantId: tenant.id, paymentId: p.id, chargeId: c.id, amount: c.amount })));
    });
  return { tenant, actor, hsc, ict, morning, ictBatch, tuition, admission, admit, pay };
}

describe("due dates (D44)", () => {
  it("fall on the course's due day of the month, or the generation date once that has passed", () => {
    expect(monthOf("2028-02")).toMatchObject({ first: "2028-02-01", last: "2028-02-29", label: "February 2028" });
    expect(dueDateFor("MONTHLY", 10, "2099-06", "2026-10-12")).toBe("2099-06-10");
    expect(dueDateFor("MONTHLY", 31, "2099-06", "2026-10-12")).toBe("2099-06-30");
    expect(dueDateFor("MONTHLY", 31, "2099-02", "2026-10-12")).toBe("2099-02-28");
    expect(dueDateFor("MONTHLY", 10, "2026-06", "2026-10-12")).toBe("2026-10-12"); // generated late
    expect(dueDateFor("ONE_TIME", 10, "ONCE", "2026-10-12")).toBe("2026-10-12");
    expect(() => monthOf("2026-13")).toThrow();
  });
});

describe("monthly generation (D30, D40, D65, D67, D68)", () => {
  it("charges current students who joined by month end and lists everyone skipped, with why", async () => {
    const s = await setUp();
    const anika = await s.admit("Anika", "2026-05-01");
    const bushra = await s.admit("Bushra", "2026-05-01");
    await students.setStudentStatus(db, s.actor, bushra.id, { status: "ON_HOLD" });
    const chaity = await s.admit("Chaity", "2026-05-01");
    await students.setStudentStatus(db, s.actor, chaity.id, { status: "COMPLETED" });
    await s.admit("Dina", "2026-07-02"); // joins after June
    const esha = await s.admit("Esha", "2026-05-01");
    await setStudentFeeAmount(db, s.actor, esha.id, { feeItemId: s.tuition.id, amount: "1800", reason: "Sibling" });
    const farah = await s.admit("Farah", "2026-05-01");
    await setStudentFeeAmount(db, s.actor, farah.id, { feeItemId: s.tuition.id, amount: "0", reason: "Scholarship" });
    const gita = await s.admit("Gita", "2026-05-01");
    await students.endMembership(db, s.actor, gita.memberships[0].id, { status: "LEFT", endedOn: "2026-06-15" });
    await s.admit("Hena", "2026-05-01", [s.ictBatch.id]); // another course entirely

    const preview = await previewGeneration(db, s.tenant.id, { feeItemId: s.tuition.id, period: "2026-06" });
    expect(preview.toCharge.map((r) => [r.fullName, r.amount, r.ownAmount])).toEqual([
      ["Anika", "2000.00", false],
      ["Esha", "1800.00", true],
    ]);
    expect(preview.skipped.map((r) => [r.fullName, r.reason])).toEqual([
      ["Bushra", "ON_HOLD"],
      ["Chaity", "COMPLETED"],
      ["Dina", "JOINED_LATER"],
      ["Farah", "ZERO_AMOUNT"],
      ["Gita", "NOT_IN_COURSE"],
    ]);
    expect(preview).toMatchObject({ periodLabel: "June 2026", total: "3800.00", dueDate: today }); // June 10 has passed

    const run = await confirmGeneration(db, s.actor, { feeItemId: s.tuition.id, period: "2026-06" });
    expect(run).toMatchObject({ createdCount: 2, total: "3800.00", skipped: { ON_HOLD: 1, COMPLETED: 1, JOINED_LATER: 1, ZERO_AMOUNT: 1, NOT_IN_COURSE: 1 } });
    const [charge] = await listStudentCharges(db, s.tenant.id, anika.id);
    expect(charge).toMatchObject({ title: "Tuition — June 2026", amount: "2000.00", net: "2000.00", state: "DUE", period: "2026-06", source: "GENERATED" });
    const [entry] = await testDb.select().from(auditLogs).where(eq(auditLogs.action, "FEE_CHARGES_GENERATED"));
    expect(entry.newValue).toMatchObject({ feeItem: "Tuition", period: "2026-06", charged: 2, total: "3800.00" });

    // Generating June again charges nobody new.
    const again = await previewGeneration(db, s.tenant.id, { feeItemId: s.tuition.id, period: "2026-06" });
    expect(again.toCharge).toEqual([]);
    expect(again.skipped.filter((r) => r.reason === "ALREADY_CHARGED").map((r) => r.fullName)).toEqual(["Anika", "Esha"]);
    await expect(confirmGeneration(db, s.actor, { feeItemId: s.tuition.id, period: "2026-06" })).rejects.toMatchObject({ code: "VALIDATION_NOTHING_TO_CHARGE" });
  });

  it("leaves unticked students out and only lowers amounts in the preview", async () => {
    const s = await setUp();
    const a = await s.admit("Anika", "2026-05-01");
    const b = await s.admit("Bushra", "2026-05-01");
    await expect(
      confirmGeneration(db, s.actor, { feeItemId: s.tuition.id, period: "2099-01", amounts: [{ studentId: a.id, amount: "2500" }] }),
    ).rejects.toMatchObject({ code: "VALIDATION_AMOUNT_RAISED" });
    const run = await confirmGeneration(db, s.actor, { feeItemId: s.tuition.id, period: "2099-01", exclude: [b.id], amounts: [{ studentId: a.id, amount: "1000" }] });
    expect(run).toMatchObject({ createdCount: 1, total: "1000.00", skipped: { EXCLUDED: 1 }, dueDate: "2099-01-10" }); // a future month (D30)
    expect(await listStudentCharges(db, s.tenant.id, b.id)).toEqual([]);
    expect((await previewGeneration(db, s.tenant.id, { feeItemId: s.tuition.id, period: "2099-01" })).toCharge.map((r) => r.fullName)).toEqual(["Bushra"]);
  });

  it("charges each student once even when two generations run at the same moment", async () => {
    const s = await setUp();
    await s.admit("Anika", "2026-05-01");
    await s.admit("Bushra", "2026-05-01");
    const results = await Promise.allSettled([1, 2].map(() => confirmGeneration(db, s.actor, { feeItemId: s.tuition.id, period: "2099-02" })));
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    // Refused either by the unique index (both previews ran first) or by finding nobody left (the first had committed).
    expect(["CONFLICT_ALREADY_CHARGED", "VALIDATION_NOTHING_TO_CHARGE"]).toContain((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason.code);
    const all = await Promise.all((await previewGeneration(db, s.tenant.id, { feeItemId: s.tuition.id, period: "2099-02" })).skipped.map((r) => listStudentCharges(db, s.tenant.id, r.studentId)));
    expect(all.map((charges) => charges.length)).toEqual([1, 1]);
  });

  it("needs the course's due day, and an active fee", async () => {
    const s = await setUp();
    const noDueDay = await academic.createCourse(db, s.actor, { name: "Spoken", code: "SPK" });
    const item = await createFeeItem(db, s.actor, { courseId: noDueDay.id, kind: "MONTHLY", name: "Monthly", amount: "500" });
    await expect(previewGeneration(db, s.tenant.id, { feeItemId: item.id, period: "2026-06" })).rejects.toMatchObject({ code: "VALIDATION_DUE_DAY_MISSING" });
    await expect(previewGeneration(db, s.tenant.id, { feeItemId: s.tuition.id, period: "June" })).rejects.toMatchObject({ code: "VALIDATION_PERIOD" });
  });
});

describe("one-time generation (D62, D67)", () => {
  it("charges each current student once, skipping On Hold, due on the generation date", async () => {
    const s = await setUp();
    const a = await s.admit("Anika", "2026-05-01");
    const b = await s.admit("Bushra", "2026-05-01");
    await students.setStudentStatus(db, s.actor, b.id, { status: "ON_HOLD" });
    const preview = await previewGeneration(db, s.tenant.id, { feeItemId: s.admission.id });
    expect(preview).toMatchObject({ period: "ONCE", periodLabel: "One-time", dueDate: today });
    expect(preview.skipped).toEqual([expect.objectContaining({ fullName: "Bushra", reason: "ON_HOLD" })]);
    await confirmGeneration(db, s.actor, { feeItemId: s.admission.id });
    expect((await listStudentCharges(db, s.tenant.id, a.id))[0]).toMatchObject({ title: "Admission", period: "ONCE", dueDate: today });
    expect((await previewGeneration(db, s.tenant.id, { feeItemId: s.admission.id })).skipped.map((r) => r.reason).sort()).toEqual(["ALREADY_CHARGED", "ON_HOLD"]);
  });
});

describe("fines and cancelling (D34, D43)", () => {
  it("adds a manual fine with a reason, due today unless a date is given", async () => {
    const s = await setUp();
    const a = await s.admit("Anika", "2026-05-01");
    await expect(addFine(db, s.actor, a.id, { amount: "100", reason: " " })).rejects.toMatchObject({ code: "VALIDATION_REQUIRED" });
    const fine = await addFine(db, s.actor, a.id, { amount: "100", reason: "Lost library book" });
    expect(fine).toMatchObject({ source: "FINE", title: "Fine", amount: "100.00", note: "Lost library book", dueDate: today, state: "DUE" });
  });

  it("cancels an unpaid charge with a reason, never a paid one, and a run's unpaid charges at once", async () => {
    const s = await setUp();
    const a = await s.admit("Anika", "2026-05-01");
    const b = await s.admit("Bushra", "2026-05-01");
    const c = await s.admit("Chaity", "2026-05-01");
    const run = await confirmGeneration(db, s.actor, { feeItemId: s.tuition.id, period: "2026-06" });
    const [aCharge] = await listStudentCharges(db, s.tenant.id, a.id);
    const [bCharge] = await listStudentCharges(db, s.tenant.id, b.id);
    await s.pay(b.id, [{ id: bCharge.id, amount: "2000.00" }], 1);

    expect((await listStudentCharges(db, s.tenant.id, b.id))[0]).toMatchObject({ state: "PAID", paidBy: { receiptLabel: "R-1" } });
    await expect(cancelCharge(db, s.actor, bCharge.id, { reason: "Wrong" })).rejects.toMatchObject({ code: "CONFLICT_CHARGE_PAID" });
    await expect(cancelCharge(db, s.actor, aCharge.id, { reason: "" })).rejects.toMatchObject({ code: "VALIDATION_REQUIRED" });
    expect(await cancelCharge(db, s.actor, aCharge.id, { reason: "Joined the ICT course instead" })).toMatchObject({ state: "CANCELLED", cancelReason: "Joined the ICT course instead" });
    await expect(cancelCharge(db, s.actor, aCharge.id, { reason: "Again" })).rejects.toMatchObject({ code: "CONFLICT_CHARGE_CANCELLED" });

    expect(await cancelRun(db, s.actor, run.id, { reason: "Wrong month" })).toEqual({ cancelled: 1, keptPaid: 1 }); // Chaity's; Bushra's is paid
    expect((await listStudentCharges(db, s.tenant.id, c.id))[0].state).toBe("CANCELLED");
    // A cancelled month can be generated again.
    expect((await previewGeneration(db, s.tenant.id, { feeItemId: s.tuition.id, period: "2026-06" })).toCharge.map((r) => r.fullName)).toEqual(["Anika", "Chaity"]);
  });
});
