import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../core/testing/db";
import { setModules } from "../../core/testing/modules";
import { auditLogs, feePayments, tenants, userRoles } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import { INSTITUTE_OWNER_ROLE } from "../../core/rbac/catalog";
import { todayInDhaka } from "@/lib/dates";
import * as academic from "../academic/service";
import { createLogin } from "../auth/credentials";
import { preparePrint } from "../documents/pipeline";
import { seedBaselineRoles } from "../rbac/service";
import * as students from "../students/service";
import { addFine, cancelCharge, confirmGeneration, listStudentCharges } from "./charges";
import { myFees } from "./ledger";
import { addRefund, addWaiver, collectPayment, listStudentPayments, voidPayment } from "./payments";
import { feeReceiptDocument, type FeeReceiptRecord } from "./receipt-document";
import { createFeeItem, saveFeeSettings } from "./setup";

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
const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

async function setUp() {
  const [tenant] = await testDb.insert(tenants).values({ name: "Pay", subdomain: "pay", status: "ACTIVE" }).returning();
  await setModules(db, tenant.id, ["fees"]);
  const roleIds = await seedBaselineRoles(db, tenant.id);
  const owner = await createLogin(db, { tenantId: tenant.id, name: "Farhana Akter", email: "o@pay.test", password: "OwnerPass1" });
  await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: owner.id, roleId: roleIds[INSTITUTE_OWNER_ROLE] });
  const actor = { tenantId: tenant.id, userId: owner.id };
  const hsc = await academic.createCourse(db, actor, { name: "HSC 2026 Science", code: "HSC", dueDay: 10 });
  const morning = await academic.createBatch(db, actor, hsc.id, { name: "Morning" });
  const tuition = await createFeeItem(db, actor, { courseId: hsc.id, kind: "MONTHLY", name: "Tuition", amount: "2000" });
  const exam = await createFeeItem(db, actor, { courseId: hsc.id, kind: "ONE_TIME", name: "Exam fee", amount: "500" });
  const admit = async (fullName: string) =>
    (
      await students.admitStudent(db, actor, {
        fullName, gender: "FEMALE", guardianName: "G", guardianRelation: "MOTHER", guardianPhone: "01711000111", admissionDate: "2026-01-01", batchIds: [morning.id], temporaryPassword: "Student123",
      })
    ).student;
  const anika = await admit("Anika");
  const bushra = await admit("Bushra");
  await confirmGeneration(db, actor, { feeItemId: tuition.id, period: "2026-06" });
  await confirmGeneration(db, actor, { feeItemId: tuition.id, period: "2026-07" });
  await confirmGeneration(db, actor, { feeItemId: exam.id });
  const chargesOf = async (studentId: string) => {
    const all = await listStudentCharges(db, tenant.id, studentId);
    return { june: all.find((c) => c.period === "2026-06")!, july: all.find((c) => c.period === "2026-07")!, exam: all.find((c) => c.period === "ONCE")! };
  };
  const pay = (studentId: string, chargeIds: string[], extra: Partial<Parameters<typeof collectPayment>[3]> = {}) =>
    collectPayment(db, actor, studentId, { chargeIds, method: "CASH", idempotencyKey: randomUUID(), ...extra });
  return { tenant, owner, actor, anika, bushra, chargesOf, pay };
}

describe("collecting payments (D31, D32, D38, D39, D72)", () => {
  it("records whole charges at their remaining amount, with the next receipt number", async () => {
    const s = await setUp();
    await saveFeeSettings(db, s.actor, { receiptPrefix: "KC" });
    const c = await s.chargesOf(s.anika.id);
    await addWaiver(db, s.actor, c.exam.id, { kind: "FIXED", value: "100", reason: "Sibling" });
    const first = await s.pay(s.anika.id, [c.june.id, c.exam.id], { method: "BKASH", reference: "TX9A1", paidOn: yesterday, remarks: "Paid by father" });
    expect(first.repeated).toBe(false);
    expect(first.payment).toMatchObject({ receiptNo: 1, receiptLabel: "KC-000001", amount: "2400.00", method: "BKASH", reference: "TX9A1", paidOn: yesterday, status: "VALID", receivedByName: "Farhana Akter" });
    // By due date, then title (both fell due today: June's was generated after its due day).
    expect(first.payment.lines.map((l) => [l.title, l.amount])).toEqual([
      ["Exam fee", "400.00"],
      ["Tuition — June 2026", "2000.00"],
    ]);
    const second = await s.pay(s.bushra.id, [(await s.chargesOf(s.bushra.id)).june.id]);
    expect(second.payment.receiptLabel).toBe("KC-000002");
    expect((await s.chargesOf(s.anika.id)).june).toMatchObject({ state: "PAID", paidBy: { receiptLabel: "KC-000001" } });
    const [entry] = await testDb.select().from(auditLogs).where(eq(auditLogs.action, "FEE_PAYMENT_RECORDED"));
    expect(entry.newValue).toMatchObject({ receipt: "KC-000001", amount: "2400.00" });
  });

  it("refuses bad input, other students' charges, and charges that aren't due", async () => {
    const s = await setUp();
    const c = await s.chargesOf(s.anika.id);
    const b = await s.chargesOf(s.bushra.id);
    await expect(s.pay(s.anika.id, [])).rejects.toMatchObject({ code: "VALIDATION_NO_CHARGES" });
    await expect(s.pay(s.anika.id, [c.june.id], { method: "NAGAD" })).rejects.toMatchObject({ code: "VALIDATION_REQUIRED" }); // reference
    await expect(s.pay(s.anika.id, [c.june.id], { paidOn: tomorrow })).rejects.toMatchObject({ code: "VALIDATION_DATE_FUTURE" });
    await expect(s.pay(s.anika.id, [b.june.id])).rejects.toMatchObject({ code: "NOT_FOUND_FEE_CHARGE" });
    await s.pay(s.anika.id, [c.june.id]);
    await expect(s.pay(s.anika.id, [c.june.id])).rejects.toMatchObject({ code: "CONFLICT_CHARGE_PAID" });
    await addWaiver(db, s.actor, c.exam.id, { kind: "PERCENT", value: "100", reason: "Scholarship" });
    await expect(s.pay(s.anika.id, [c.exam.id])).rejects.toMatchObject({ code: "CONFLICT_CHARGE_WAIVED" });
    expect(await testDb.select().from(feePayments)).toHaveLength(1);
  });

  it("records a double-submitted payment once, and never pays a charge twice under concurrency", async () => {
    const s = await setUp();
    const c = await s.chargesOf(s.anika.id);
    const key = randomUUID();
    const [a, b] = await Promise.all([s.pay(s.anika.id, [c.june.id], { idempotencyKey: key }), s.pay(s.anika.id, [c.june.id], { idempotencyKey: key })]);
    expect(a.payment.id).toBe(b.payment.id);
    expect([a.repeated, b.repeated].sort()).toEqual([false, true]);
    const results = await Promise.allSettled([s.pay(s.anika.id, [c.july.id]), s.pay(s.anika.id, [c.july.id])]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "CONFLICT_CHARGE_PAID" });
    expect((await testDb.select().from(feePayments)).map((p) => p.receiptNo).sort()).toEqual([1, 2]);
  });
});

describe("voids (D35)", () => {
  it("make the charges due again, keep the receipt number used, and need a reason", async () => {
    const s = await setUp();
    const c = await s.chargesOf(s.anika.id);
    const { payment } = await s.pay(s.anika.id, [c.june.id]);
    await expect(voidPayment(db, s.actor, payment.id, { reason: "" })).rejects.toMatchObject({ code: "VALIDATION_REQUIRED" });
    expect(await voidPayment(db, s.actor, payment.id, { reason: "Wrong student" })).toMatchObject({ status: "VOID", voidReason: "Wrong student" });
    await expect(voidPayment(db, s.actor, payment.id, { reason: "Again" })).rejects.toMatchObject({ code: "CONFLICT_PAYMENT_VOID" });
    expect((await s.chargesOf(s.anika.id)).june.state).toBe("DUE");
    const again = await s.pay(s.anika.id, [c.june.id]);
    expect(again.payment.receiptNo).toBe(2); // 1 is never reused
    expect((await listStudentPayments(db, s.tenant.id, s.anika.id)).map((p) => [p.receiptNo, p.status])).toEqual([
      [2, "VALID"],
      [1, "VOID"],
    ]);
  });
});

describe("waivers (D33, D74) and refunds (D36, D37, D73)", () => {
  it("waive unpaid charges by amount or percent, several times, never below zero", async () => {
    const s = await setUp();
    const c = await s.chargesOf(s.anika.id);
    expect(await addWaiver(db, s.actor, c.june.id, { kind: "PERCENT", value: "25", reason: "Sibling" })).toMatchObject({ waived: "500.00", net: "1500.00", state: "DUE" });
    await expect(addWaiver(db, s.actor, c.june.id, { kind: "FIXED", value: "1600", reason: "Too much" })).rejects.toMatchObject({ code: "VALIDATION_WAIVER_TOO_LARGE" });
    await expect(addWaiver(db, s.actor, c.june.id, { kind: "PERCENT", value: "120", reason: "x" })).rejects.toMatchObject({ code: "VALIDATION_PERCENT" });
    await expect(addWaiver(db, s.actor, c.june.id, { kind: "FIXED", value: "100", reason: "" })).rejects.toMatchObject({ code: "VALIDATION_REQUIRED" });
    expect(await addWaiver(db, s.actor, c.june.id, { kind: "FIXED", value: "1500", reason: "Hardship" })).toMatchObject({ net: "0.00", state: "WAIVED" });
    await s.pay(s.anika.id, [c.july.id]);
    await expect(addWaiver(db, s.actor, c.july.id, { kind: "FIXED", value: "100", reason: "Late" })).rejects.toMatchObject({ code: "CONFLICT_CHARGE_PAID" });
  });

  it("refund up to what was paid, keeping the charge settled, and block voiding that payment", async () => {
    const s = await setUp();
    const c = await s.chargesOf(s.anika.id);
    await expect(addRefund(db, s.actor, c.june.id, { amount: "100", method: "CASH", reason: "x" })).rejects.toMatchObject({ code: "CONFLICT_CHARGE_NOT_PAID" });
    const { payment } = await s.pay(s.anika.id, [c.june.id, c.exam.id]);
    await expect(addRefund(db, s.actor, c.june.id, { amount: "100", method: "BKASH", reason: "x" })).rejects.toMatchObject({ code: "VALIDATION_REQUIRED" });
    expect(await addRefund(db, s.actor, c.june.id, { amount: "1500", method: "BKASH", reference: "RF1", reason: "Left after a week" })).toMatchObject({ state: "PAID", refunded: "1500.00" });
    await expect(addRefund(db, s.actor, c.june.id, { amount: "600", method: "CASH", reason: "More" })).rejects.toMatchObject({ code: "VALIDATION_REFUND_TOO_LARGE" });
    expect(await addRefund(db, s.actor, c.june.id, { amount: "500", method: "CASH", reason: "Rest" })).toMatchObject({ refunded: "2000.00" });
    await expect(voidPayment(db, s.actor, payment.id, { reason: "Wrong" })).rejects.toMatchObject({ code: "CONFLICT_PAYMENT_REFUNDED" });
    expect((await listStudentPayments(db, s.tenant.id, s.anika.id))[0].refunds.map((r) => r.amount)).toEqual(["1500.00", "500.00"]);
  });
});

describe("the receipt (D69, D71)", () => {
  it("prints the stored payment with amount in words, course and batch; reprints never create a payment", async () => {
    const s = await setUp();
    const c = await s.chargesOf(s.anika.id);
    const { payment } = await s.pay(s.anika.id, [c.june.id, c.exam.id], { method: "CHEQUE", reference: "CHQ-77" });
    const viewer = { tenantId: s.tenant.id, userId: s.owner.id, permissions: new Set(["fees.view"]), activeModules: ["core", "fees"] as never };
    const job = await preparePrint(db, viewer, feeReceiptDocument as never, { payment: payment.id });
    const r = job.records[0].data as FeeReceiptRecord;
    expect(r).toMatchObject({
      receiptLabel: "R-000001", amount: "2500.00", amountInWords: "Two thousand five hundred taka only", method: "CHEQUE", reference: "CHQ-77",
      receivedBy: "Farhana Akter", status: "VALID", student: { name: "Anika" }, programme: "HSC 2026 Science · Morning",
    });
    await preparePrint(db, viewer, feeReceiptDocument as never, { payment: payment.id });
    expect(await testDb.select().from(feePayments)).toHaveLength(1);
    expect(await testDb.select().from(auditLogs).where(eq(auditLogs.action, "DOCUMENT_PRINTED"))).toHaveLength(2);

    await voidPayment(db, s.actor, payment.id, { reason: "Cheque bounced" });
    const voided = (await preparePrint(db, viewer, feeReceiptDocument as never, { payment: payment.id })).records[0].data as FeeReceiptRecord;
    expect(voided).toMatchObject({ status: "VOID", voidReason: "Cheque bounced", voidedOn: today });
  });

  it("lets a student print only their own receipts", async () => {
    const s = await setUp();
    const { payment } = await s.pay(s.anika.id, [(await s.chargesOf(s.anika.id)).june.id]);
    const as = (userId: string) => preparePrint(db, { tenantId: s.tenant.id, userId, permissions: new Set(["fees.self.view"]), activeModules: ["core", "fees"] as never }, feeReceiptDocument as never, { payment: payment.id });
    expect((await as(s.anika.userId)).records).toHaveLength(1);
    expect((await as(s.bushra.userId)).records).toHaveLength(0);
    await expect(preparePrint(db, { tenantId: s.tenant.id, userId: s.anika.userId, permissions: new Set(["fees.self.view"]), activeModules: ["core"] as never }, feeReceiptDocument as never, { payment: payment.id })).rejects.toMatchObject({ code: "NOT_FOUND_DOCUMENT_TYPE" });
  });
});

describe("fines are paid like any charge", () => {
  it("collects a fine", async () => {
    const s = await setUp();
    const fine = await addFine(db, s.actor, s.anika.id, { amount: "50", reason: "Late" });
    expect((await s.pay(s.anika.id, [fine!.id])).payment.amount).toBe("50.00");
  });
});

describe("the student's own fees (D27, D79)", () => {
  it("shows what they owe, overdue first, and what they paid with receipts; hides cancelled charges and voided payments", async () => {
    const s = await setUp();
    const c = await s.chargesOf(s.anika.id);
    const fine = await addFine(db, s.actor, s.anika.id, { amount: "50", reason: "Late return of library book", dueDate: "2026-01-15" });
    await addWaiver(db, s.actor, c.june.id, { kind: "FIXED", value: "500", reason: "Sibling" });
    const { payment: june } = await s.pay(s.anika.id, [c.june.id]);
    await addRefund(db, s.actor, c.june.id, { amount: "200", method: "CASH", reason: "Illness" });
    const { payment: wrong } = await s.pay(s.anika.id, [c.july.id]);
    await voidPayment(db, s.actor, wrong.id, { reason: "Bounced cheque" });
    await cancelCharge(db, s.actor, c.exam.id, { reason: "Exam postponed" });

    const mine = await myFees(db, s.tenant.id, s.anika.userId);
    expect(mine.due.map((d) => [d.title, d.net, d.overdue, d.reason])).toEqual([
      ["Fine", "50.00", true, "Late return of library book"],
      ["Tuition — July 2026", "2000.00", false, null],
    ]);
    expect(mine.paid).toEqual([expect.objectContaining({ title: "Tuition — June 2026", waived: "500.00", net: "1500.00", refunded: "200.00", receipt: expect.objectContaining({ paymentId: june.id }) })]);
    expect(mine.totalDue).toBe("2050.00");
    const text = JSON.stringify(mine);
    expect(text).not.toMatch(/Exam fee|Exam postponed|Bounced cheque|Sibling|Illness/);
    expect(fine).toBeTruthy();

    expect((await myFees(db, s.tenant.id, s.bushra.userId)).due.map((d) => d.title)).not.toContain("Fine");
    await expect(myFees(db, s.tenant.id, s.owner.id)).rejects.toMatchObject({ code: "NOT_FOUND_STUDENT" });
  });
});
