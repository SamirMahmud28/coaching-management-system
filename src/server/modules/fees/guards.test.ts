import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDb } from "../../core/testing/db";
import {
  courses,
  feeCharges,
  feeGenerationRuns,
  feeItems,
  feePaymentAllocations,
  feePayments,
  feeRefunds,
  feeWaivers,
  students,
  tenants,
} from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { createLogin } from "../auth/credentials";

// The database itself refuses to rewrite financial history (migration 0006_fees_guards).

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;

beforeEach(async () => {
  await reset();
});
afterAll(async () => {
  await close();
});

async function setUp() {
  const [tenant] = await testDb.insert(tenants).values({ name: "Fee Guard", subdomain: "fee-guard", status: "ACTIVE" }).returning();
  const user = await createLogin(db, { tenantId: tenant.id, name: "Cashier", email: "c@fg.test", password: "SomePass1" });
  const studentLogin = await createLogin(db, { tenantId: tenant.id, name: "S", username: "S-1", password: "SomePass1" });
  const [course] = await testDb.insert(courses).values({ tenantId: tenant.id, name: "HSC", code: "HSC" }).returning();
  const [student] = await testDb
    .insert(students)
    .values({ tenantId: tenant.id, userId: studentLogin.id, studentCode: "S-1", fullName: "S", gender: "MALE", guardianName: "G", guardianRelation: "FATHER", guardianPhone: "01711000111", admissionDate: "2026-01-01" })
    .returning();
  const [item] = await testDb.insert(feeItems).values({ tenantId: tenant.id, courseId: course.id, kind: "MONTHLY", name: "Tuition", amount: "2000.00" }).returning();
  const [run] = await testDb.insert(feeGenerationRuns).values({ tenantId: tenant.id, feeItemId: item.id, period: "2026-06", createdCount: 1, skipped: {}, totalAmount: "2000.00" }).returning();
  const charge = (period = "2026-06") =>
    testDb
      .insert(feeCharges)
      .values({ tenantId: tenant.id, studentId: student.id, courseId: course.id, feeItemId: item.id, generationRunId: run.id, source: "GENERATED", title: `Tuition ${period}`, period, amount: "2000.00", dueDate: `${period}-10` })
      .returning()
      .then((r) => r[0]);
  /** A payment of `amount` with allocations of `parts`, in one transaction. */
  const pay = (receiptNo: number, amount: string, parts: { chargeId: string; amount: string }[]) =>
    testDb.transaction(async (tx) => {
      const [payment] = await tx
        .insert(feePayments)
        .values({ tenantId: tenant.id, studentId: student.id, receiptNo, receiptLabel: `R-${receiptNo}`, paidOn: "2026-06-05", method: "CASH", amount, receivedBy: user.id, idempotencyKey: randomUUID() })
        .returning();
      if (parts.length) await tx.insert(feePaymentAllocations).values(parts.map((p) => ({ tenantId: tenant.id, paymentId: payment.id, ...p })));
      return payment;
    });
  return { tenant, user, student, item, run, charge, pay };
}

/** Refused by a guard trigger (Drizzle wraps the PostgreSQL error in `cause`). */
async function expectRefused(attempt: Promise<unknown>, reason: RegExp = /never|stays/) {
  const err = await attempt.then(() => null, (e: unknown) => e as { message: string; cause?: { message?: string } });
  expect(err, "the write was refused").not.toBeNull();
  expect(err!.cause?.message ?? err!.message).toMatch(reason);
}

describe("fee charges", () => {
  it("can't be deleted or have their money changed, but can be cancelled once", async () => {
    const s = await setUp();
    const charge = await s.charge();
    await expect(testDb.delete(feeCharges).where(eq(feeCharges.id, charge.id))).rejects.toThrow();
    await expect(testDb.update(feeCharges).set({ amount: "1.00" }).where(eq(feeCharges.id, charge.id))).rejects.toThrow();
    await expect(testDb.update(feeCharges).set({ dueDate: "2026-07-01" }).where(eq(feeCharges.id, charge.id))).rejects.toThrow();
    await testDb.update(feeCharges).set({ status: "CANCELLED", cancelReason: "Wrong month", cancelledAt: new Date() }).where(eq(feeCharges.id, charge.id));
    await expect(testDb.update(feeCharges).set({ status: "ACTIVE", cancelReason: null, cancelledAt: null }).where(eq(feeCharges.id, charge.id))).rejects.toThrow();
  });

  it("allow one active charge per student, fee item and month", async () => {
    const s = await setUp();
    const first = await s.charge("2026-06");
    await expect(s.charge("2026-06")).rejects.toThrow();
    await s.charge("2026-07");
    await testDb.update(feeCharges).set({ status: "CANCELLED", cancelReason: "Wrong", cancelledAt: new Date() }).where(eq(feeCharges.id, first.id));
    await expect(s.charge("2026-06")).resolves.toBeTruthy(); // a cancelled month can be charged again
  });
});

describe("fee payments", () => {
  it("must be split across charges exactly, and the split never changes", async () => {
    const s = await setUp();
    const charge = await s.charge();
    await expectRefused(s.pay(1, "2000.00", [{ chargeId: charge.id, amount: "1500.00" }]), /must add up/);
    await expectRefused(s.pay(2, "2000.00", []), /must add up/);
    const payment = await s.pay(3, "2000.00", [{ chargeId: charge.id, amount: "2000.00" }]);
    await expectRefused(testDb.update(feePaymentAllocations).set({ amount: "1.00" }).where(eq(feePaymentAllocations.paymentId, payment.id)));
    await expectRefused(testDb.delete(feePaymentAllocations).where(eq(feePaymentAllocations.paymentId, payment.id)));
  });

  it("can't be deleted or edited, and are voided at most once", async () => {
    const s = await setUp();
    const charge = await s.charge();
    const payment = await s.pay(1, "2000.00", [{ chargeId: charge.id, amount: "2000.00" }]);
    await expect(testDb.delete(feePayments).where(eq(feePayments.id, payment.id))).rejects.toThrow();
    await expect(testDb.update(feePayments).set({ amount: "1.00" }).where(eq(feePayments.id, payment.id))).rejects.toThrow();
    await expect(testDb.update(feePayments).set({ receiptLabel: "X-1" }).where(eq(feePayments.id, payment.id))).rejects.toThrow();
    await testDb.update(feePayments).set({ status: "VOID", voidReason: "Wrong student", voidedAt: new Date(), voidedBy: s.user.id }).where(eq(feePayments.id, payment.id));
    await expect(testDb.update(feePayments).set({ status: "VALID", voidReason: null, voidedAt: null, voidedBy: null }).where(eq(feePayments.id, payment.id))).rejects.toThrow();
  });

  it("need a reference for every method but cash, and receipt numbers and idempotency keys are unique", async () => {
    const s = await setUp();
    const charge = await s.charge();
    const insert = (values: Partial<typeof feePayments.$inferInsert>) =>
      testDb.transaction(async (tx) => {
        const [p] = await tx
          .insert(feePayments)
          .values({ tenantId: s.tenant.id, studentId: s.student.id, receiptNo: 9, receiptLabel: "R-9", paidOn: "2026-06-05", method: "CASH", amount: "2000.00", receivedBy: s.user.id, idempotencyKey: randomUUID(), ...values })
          .returning();
        await tx.insert(feePaymentAllocations).values({ tenantId: s.tenant.id, paymentId: p.id, chargeId: charge.id, amount: "2000.00" });
      });
    await expect(insert({ method: "BKASH" })).rejects.toThrow();
    await insert({ method: "BKASH", reference: "TX123" });
    await expect(insert({ receiptNo: 9 })).rejects.toThrow(); // same receipt number
  });
});

describe("other fee history", () => {
  it("generation runs, waivers and refunds never change", async () => {
    const s = await setUp();
    const charge = await s.charge();
    const payment = await s.pay(1, "2000.00", [{ chargeId: charge.id, amount: "2000.00" }]);
    const [waiver] = await testDb.insert(feeWaivers).values({ tenantId: s.tenant.id, chargeId: charge.id, kind: "FIXED", value: "100.00", amount: "100.00", reason: "Sibling" }).returning();
    const [refund] = await testDb
      .insert(feeRefunds)
      .values({ tenantId: s.tenant.id, chargeId: charge.id, paymentId: payment.id, amount: "500.00", method: "CASH", reason: "Left early", refundedOn: "2026-06-20", createdBy: s.user.id })
      .returning();
    for (const attempt of [
      testDb.update(feeGenerationRuns).set({ createdCount: 5 }).where(eq(feeGenerationRuns.id, s.run.id)),
      testDb.delete(feeGenerationRuns).where(eq(feeGenerationRuns.id, s.run.id)),
      testDb.update(feeWaivers).set({ amount: "1.00" }).where(eq(feeWaivers.id, waiver.id)),
      testDb.delete(feeWaivers).where(eq(feeWaivers.id, waiver.id)),
      testDb.update(feeRefunds).set({ amount: "1.00" }).where(eq(feeRefunds.id, refund.id)),
      testDb.delete(feeRefunds).where(eq(feeRefunds.id, refund.id)),
    ]) {
      await expectRefused(attempt);
    }
    // A percent waiver can't exceed 100%.
    await expect(testDb.insert(feeWaivers).values({ tenantId: s.tenant.id, chargeId: charge.id, kind: "PERCENT", value: "150.00", amount: "1.00", reason: "x" })).rejects.toThrow();
    expect((await testDb.execute(sql`select count(*)::int as n from fee_waivers`))[0]).toEqual({ n: 1 });
  });
});
