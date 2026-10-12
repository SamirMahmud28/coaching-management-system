import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { feeCharges, feePaymentAllocations, feePayments, feeReceiptCounters, feeRefunds, feeWaivers, students, users } from "../../core/db/schema";
import { getInTenant } from "../../core/db/tenant-scope";
import { inTransaction } from "../../core/db/transaction";
import type { DbOrTx } from "../../core/db/types";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError, findPgError } from "../../core/errors";
import { isCalendarDate, todayInDhaka } from "@/lib/dates";
import { fromPoisha, percentOf, sumPoisha, toPoisha } from "@/lib/money";
import { audit } from "../audit/service";
import { chargeView, chargeViewsByIds, type ChargeView } from "./ledger";
import { cleanAmount, getFeeSettings, receiptLabel, type Actor } from "./setup";

// Collection (D31, D32, D38, D39, D72), voids (D35), waivers (D33, D74) and refunds (D36, D37, D73).

const isUniqueViolation = (err: unknown, constraint: string) => {
  const pg = findPgError(err);
  return pg?.code === "23505" && pg.constraint_name === constraint;
};

export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CHEQUE", "BKASH", "NAGAD", "ROCKET", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const record = (tx: DbOrTx, actor: Actor, action: string, studentId: string, newValue: Record<string, unknown>) =>
  audit.record(tx, { tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action, resourceType: "STUDENT", resourceId: studentId, newValue });

function text(value: string | null | undefined, max: number, field: string, label: string, required: boolean): string | null {
  const t = value?.trim() || null;
  if (!t && required) throw new ValidationError("VALIDATION_REQUIRED", `${label} is required.`, { field });
  if (t && t.length > max) throw new ValidationError("VALIDATION_TEXT", `${label} can be at most ${max} characters.`, { field });
  return t;
}

/** A method from the fixed list, with a reference for everything but cash (D39, D73). */
function methodAndReference(method: string, reference: string | null | undefined) {
  if (!PAYMENT_METHODS.includes(method as PaymentMethod)) throw new ValidationError("VALIDATION_METHOD", "Choose a payment method.", { field: "method" });
  const ref = text(reference, 100, "reference", "The reference", method !== "CASH");
  return { method: method as PaymentMethod, reference: ref };
}

/** A date received or refunded: a real date, today or earlier (D72). */
function pastOrToday(value: string | null | undefined, field: string): string {
  const date = value?.trim() || todayInDhaka();
  if (!isCalendarDate(date)) throw new ValidationError("VALIDATION_DATE", "Enter a valid date.", { field });
  if (date > todayInDhaka()) throw new ValidationError("VALIDATION_DATE_FUTURE", "The date can't be in the future.", { field });
  return date;
}

/** Locks the charges against a concurrent payment or waiver, then reads them. */
async function lockCharges(tx: DbOrTx, tenantId: string, ids: string[]): Promise<ChargeView[]> {
  await tx.execute(sql`select id from fee_charges where tenant_id = ${tenantId} and id in ${ids} for update`);
  return chargeViewsByIds(tx, tenantId, ids);
}

const assertDue = (c: ChargeView) => {
  if (c.state === "PAID") throw new ConflictError("CONFLICT_CHARGE_PAID", `${c.title} is already paid.`, { chargeId: c.id });
  if (c.state === "CANCELLED") throw new ConflictError("CONFLICT_CHARGE_CANCELLED", `${c.title} is cancelled.`, { chargeId: c.id });
  if (c.state === "WAIVED") throw new ConflictError("CONFLICT_CHARGE_WAIVED", `${c.title} is fully waived; there is nothing to pay.`, { chargeId: c.id });
};

function cleanWaiver(w: { chargeId?: string; kind: string; value: string; reason: string }, field: string) {
  if (w.kind !== "FIXED" && w.kind !== "PERCENT") throw new ValidationError("VALIDATION_WAIVER_KIND", "Choose an amount or a percent.", { field: `${field}.kind` });
  const value = cleanAmount(w.value, `${field}.value`);
  if (w.kind === "PERCENT" && toPoisha(value) > toPoisha("100")) throw new ValidationError("VALIDATION_PERCENT", "A percent can be at most 100.", { field: `${field}.value` });
  const reason = text(w.reason, 300, `${field}.reason`, "A reason", true)!;
  return { chargeId: w.chargeId ?? "", kind: w.kind as "FIXED" | "PERCENT", value, reason };
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

export interface CollectInput {
  chargeIds: string[];
  paidOn?: string | null;
  method: string;
  reference?: string | null;
  remarks?: string | null;
  /** Made by the form when it opens: a repeat (double click, retry) returns the payment already recorded. */
  idempotencyKey: string;
  /** Waivers on ticked charges, saved with the payment (D99); need fees.waive. */
  waivers?: { chargeId: string; kind: "FIXED" | "PERCENT"; value: string; reason: string }[];
  /** Fines added and paid in the same step (D99); need fees.adjust. */
  fines?: { amount: string; reason: string }[];
}

const MAX_EXTRA_ROWS = 20;

/**
 * Records money received for whole due charges (D31, D32) — with any waivers on the ticked charges and any new fines,
 * all saved together or not at all (D99). The amount is what the charges still owe after the waivers, plus the fines;
 * charges a waiver clears completely are settled by it and left out of the payment. One idempotency key per form.
 */
export async function collectPayment(db: DbOrTx, actor: Actor & { permissions?: ReadonlySet<string> }, studentId: string, input: CollectInput) {
  const chargeIds = [...new Set(input.chargeIds)];
  const waivers = (input.waivers ?? []).map((w, i) => cleanWaiver(w, `waivers.${i}`));
  const fines = (input.fines ?? []).map((f, i) => ({ amount: cleanAmount(f.amount, `fines.${i}.amount`), reason: text(f.reason, 300, `fines.${i}.reason`, "Each fine's reason", true)! }));
  // A fine on its own can be collected at the counter; otherwise tick what is being paid.
  if (!chargeIds.length && !fines.length) throw new ValidationError("VALIDATION_NO_CHARGES", "Choose the charges being paid.", { field: "chargeIds" });
  const { method, reference } = methodAndReference(input.method, input.reference);
  const paidOn = pastOrToday(input.paidOn, "paidOn");
  const remarks = text(input.remarks, 500, "remarks", "Remarks", false);
  if (waivers.length > MAX_EXTRA_ROWS || fines.length > MAX_EXTRA_ROWS) throw new ValidationError("VALIDATION_TOO_MANY", "Add at most 20 waivers and 20 fines at a time.");
  if (waivers.length && !actor.permissions?.has("fees.waive")) throw new ForbiddenError();
  if (fines.length && !actor.permissions?.has("fees.adjust")) throw new ForbiddenError();
  for (const w of waivers) if (!chargeIds.includes(w.chargeId)) throw new ValidationError("VALIDATION_WAIVER_CHARGE", "A waiver can only be on a ticked charge.", { field: "waivers" });

  const existingFor = async (tx: DbOrTx) => {
    const [row] = await tx.select().from(feePayments).where(and(eq(feePayments.tenantId, actor.tenantId), eq(feePayments.idempotencyKey, input.idempotencyKey)));
    if (row && row.studentId !== studentId) throw new ConflictError("CONFLICT_IDEMPOTENCY_KEY", "This form was already used for another student. Reload and try again.");
    return row ?? null;
  };

  try {
    return await inTransaction(db, async (tx) => {
      await getInTenant(tx, students, actor.tenantId, studentId, "STUDENT");
      let charges = chargeIds.length ? await lockCharges(tx, actor.tenantId, chargeIds) : [];
      // A repeat of a payment that went through (double click, retry): return it rather than refusing paid charges.
      // Its waivers and fines were saved with it, so nothing is applied twice.
      const repeat = await existingFor(tx);
      if (repeat) return { payment: await getPayment(tx, actor.tenantId, repeat.id), repeated: true };
      if (charges.length !== chargeIds.length || charges.some((c) => c.studentId !== studentId)) throw new NotFoundError("FEE_CHARGE");
      charges.forEach(assertDue);

      // Waivers first (D33, D74): each off the charge's amount, never below zero across all of them.
      const owed = new Map(charges.map((c) => [c.id, toPoisha(c.net)]));
      for (const w of waivers) {
        const charge = charges.find((c) => c.id === w.chargeId)!;
        const off = w.kind === "FIXED" ? toPoisha(w.value) : percentOf(toPoisha(charge.amount), w.value);
        if (off <= 0) throw new ValidationError("VALIDATION_AMOUNT", "A waiver comes to nothing.", { field: "waivers" });
        if (off > owed.get(charge.id)!) {
          throw new ValidationError("VALIDATION_WAIVER_TOO_LARGE", `The waivers on ${charge.title} come to more than it owes (${charge.net}).`, { field: "waivers", chargeId: charge.id });
        }
        owed.set(charge.id, owed.get(charge.id)! - off);
        await tx.insert(feeWaivers).values({ tenantId: actor.tenantId, chargeId: charge.id, kind: w.kind, value: w.value, amount: fromPoisha(off), reason: w.reason, createdBy: actor.userId });
        await record(tx, actor, "FEE_WAIVER_ADDED", studentId, { chargeId: charge.id, title: charge.title, kind: w.kind, value: w.value, amount: fromPoisha(off), reason: w.reason, withPayment: true });
      }
      // Fines (D34), due on the payment date and paid with it.
      const fineIds: string[] = [];
      for (const f of fines) {
        const [fine] = await tx
          .insert(feeCharges)
          .values({ tenantId: actor.tenantId, studentId, courseId: null, source: "FINE", title: "Fine", amount: f.amount, dueDate: paidOn, note: f.reason, createdBy: actor.userId })
          .returning({ id: feeCharges.id });
        fineIds.push(fine.id);
        await audit.record(tx, {
          tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action: "FEE_FINE_ADDED", resourceType: "STUDENT", resourceId: studentId,
          newValue: { chargeId: fine.id, amount: f.amount, reason: f.reason, dueDate: paidOn, withPayment: true },
        });
      }
      if (waivers.length || fineIds.length) charges = await chargeViewsByIds(tx, actor.tenantId, [...chargeIds, ...fineIds]);
      // A charge a waiver cleared is settled by the waiver; the payment covers the rest.
      const paying = charges.filter((c) => toPoisha(c.net) > 0);
      if (!paying.length) throw new ValidationError("VALIDATION_NOTHING_TO_PAY", "The waivers cover everything ticked, so there's nothing to pay. Use Waive on the charge instead.", { field: "waivers" });

      const amount = fromPoisha(sumPoisha(paying.map((c) => toPoisha(c.net))));
      await tx.insert(feeReceiptCounters).values({ tenantId: actor.tenantId, nextValue: 1 }).onConflictDoNothing();
      const [counter] = await tx
        .update(feeReceiptCounters)
        .set({ nextValue: sql`${feeReceiptCounters.nextValue} + 1` })
        .where(eq(feeReceiptCounters.tenantId, actor.tenantId))
        .returning({ value: feeReceiptCounters.nextValue });
      const receiptNo = counter.value - 1;
      const { receiptPrefix } = await getFeeSettings(tx, actor.tenantId);
      const [payment] = await tx
        .insert(feePayments)
        .values({
          tenantId: actor.tenantId, studentId, receiptNo, receiptLabel: receiptLabel(receiptPrefix, receiptNo), paidOn, method, reference, amount, remarks,
          receivedBy: actor.userId, idempotencyKey: input.idempotencyKey,
        })
        .returning();
      await tx.insert(feePaymentAllocations).values(paying.map((c) => ({ tenantId: actor.tenantId, paymentId: payment.id, chargeId: c.id, amount: c.net })));
      await record(tx, actor, "FEE_PAYMENT_RECORDED", studentId, {
        paymentId: payment.id, receipt: payment.receiptLabel, amount, method, reference, paidOn, charges: paying.map((c) => c.title), waivers: waivers.length, fines: fineIds.length,
      });
      return { payment: await getPayment(tx, actor.tenantId, payment.id), repeated: false };
    });
  } catch (err) {
    // Two requests with the same key at once: the loser finds the winner's payment.
    if (isUniqueViolation(err, "fee_payments_tenant_idempotency_unique")) {
      const repeat = await existingFor(db);
      if (repeat) return { payment: await getPayment(db, actor.tenantId, repeat.id), repeated: true };
    }
    throw err;
  }
}

/** Voids a payment with a reason (D35): its receipt shows VOID, its charges are due again, its number is never reused. */
export async function voidPayment(db: DbOrTx, actor: Actor, paymentId: string, input: { reason: string }) {
  const reason = text(input.reason, 300, "reason", "A reason", true)!;
  return inTransaction(db, async (tx) => {
    const payment = await getInTenant(tx, feePayments, actor.tenantId, paymentId, "FEE_PAYMENT");
    await tx.execute(sql`select id from fee_payments where tenant_id = ${actor.tenantId} and id = ${paymentId} for update`);
    if (payment.status === "VOID") throw new ConflictError("CONFLICT_PAYMENT_VOID", "This payment is already void.");
    const [{ refunds }] = await tx
      .select({ refunds: sql<number>`count(*)::int` })
      .from(feeRefunds)
      .where(and(eq(feeRefunds.tenantId, actor.tenantId), eq(feeRefunds.paymentId, paymentId)));
    // Money was partly given back already; voiding as well would count it twice.
    if (refunds) throw new ConflictError("CONFLICT_PAYMENT_REFUNDED", "This payment has refunds recorded, so it can't be voided.");
    await tx
      .update(feePayments)
      .set({ status: "VOID", voidReason: reason, voidedAt: new Date(), voidedBy: actor.userId })
      .where(and(eq(feePayments.tenantId, actor.tenantId), eq(feePayments.id, paymentId)));
    await record(tx, actor, "FEE_PAYMENT_VOIDED", payment.studentId, { paymentId, receipt: payment.receiptLabel, amount: payment.amount, reason });
    return getPayment(tx, actor.tenantId, paymentId);
  });
}

// ---------------------------------------------------------------------------
// Waivers and refunds
// ---------------------------------------------------------------------------

/** Takes a fixed amount or a percent of the charge off one unpaid charge, with a reason (D33); several may add up (D74). */
export async function addWaiver(db: DbOrTx, actor: Actor, chargeId: string, input: { kind: "FIXED" | "PERCENT"; value: string; reason: string }) {
  const { value, reason } = cleanWaiver(input, "waiver");
  return inTransaction(db, async (tx) => {
    await getInTenant(tx, feeCharges, actor.tenantId, chargeId, "FEE_CHARGE");
    const [charge] = await lockCharges(tx, actor.tenantId, [chargeId]);
    assertDue(charge);
    const off = input.kind === "FIXED" ? toPoisha(value) : percentOf(toPoisha(charge.amount), value);
    if (off <= 0) throw new ValidationError("VALIDATION_AMOUNT", "The waiver comes to nothing.", { field: "value" });
    if (off > toPoisha(charge.net)) {
      throw new ValidationError("VALIDATION_WAIVER_TOO_LARGE", `The waiver (${fromPoisha(off)}) is more than what is still owed (${charge.net}).`, { field: "value" });
    }
    await tx.insert(feeWaivers).values({ tenantId: actor.tenantId, chargeId, kind: input.kind, value, amount: fromPoisha(off), reason, createdBy: actor.userId });
    await record(tx, actor, "FEE_WAIVER_ADDED", charge.studentId, { chargeId, title: charge.title, kind: input.kind, value, amount: fromPoisha(off), reason });
    return chargeView(tx, actor.tenantId, chargeId);
  });
}

/** Gives back up to what was paid for a paid charge (D36, D37); the charge stays settled. */
export async function addRefund(db: DbOrTx, actor: Actor, chargeId: string, input: { amount: string; method: string; reference?: string | null; reason: string; refundedOn?: string | null }) {
  const amount = cleanAmount(input.amount);
  const { method, reference } = methodAndReference(input.method, input.reference);
  const reason = text(input.reason, 300, "reason", "A reason", true)!;
  const refundedOn = pastOrToday(input.refundedOn, "refundedOn");
  return inTransaction(db, async (tx) => {
    await getInTenant(tx, feeCharges, actor.tenantId, chargeId, "FEE_CHARGE");
    const [charge] = await lockCharges(tx, actor.tenantId, [chargeId]);
    if (charge.state !== "PAID" || !charge.paidBy) throw new ConflictError("CONFLICT_CHARGE_NOT_PAID", "Only a paid charge can be refunded.");
    const refundable = toPoisha(charge.paidBy.amount) - toPoisha(charge.refunded);
    if (toPoisha(amount) > refundable) {
      throw new ValidationError("VALIDATION_REFUND_TOO_LARGE", `At most ${fromPoisha(refundable)} can be refunded for this charge.`, { field: "amount" });
    }
    await tx.insert(feeRefunds).values({ tenantId: actor.tenantId, chargeId, paymentId: charge.paidBy.paymentId, amount, method, reference, reason, refundedOn, createdBy: actor.userId });
    await record(tx, actor, "FEE_REFUND_RECORDED", charge.studentId, { chargeId, title: charge.title, receipt: charge.paidBy.receiptLabel, amount, method, reference, reason, refundedOn });
    return chargeView(tx, actor.tenantId, chargeId);
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getPayment(db: DbOrTx, tenantId: string, id: string) {
  const [payment] = await db
    .select({
      id: feePayments.id,
      studentId: feePayments.studentId,
      receiptNo: feePayments.receiptNo,
      receiptLabel: feePayments.receiptLabel,
      paidOn: feePayments.paidOn,
      method: feePayments.method,
      reference: feePayments.reference,
      amount: feePayments.amount,
      remarks: feePayments.remarks,
      status: feePayments.status,
      voidReason: feePayments.voidReason,
      voidedAt: feePayments.voidedAt,
      createdAt: feePayments.createdAt,
      receivedByName: users.name,
    })
    .from(feePayments)
    .leftJoin(users, and(eq(users.tenantId, feePayments.tenantId), eq(users.id, feePayments.receivedBy)))
    .where(and(eq(feePayments.tenantId, tenantId), eq(feePayments.id, id)));
  if (!payment) throw new NotFoundError("FEE_PAYMENT");
  const lines = await db
    .select({ chargeId: feeCharges.id, title: feeCharges.title, amount: feePaymentAllocations.amount })
    .from(feePaymentAllocations)
    .innerJoin(feeCharges, and(eq(feeCharges.tenantId, feePaymentAllocations.tenantId), eq(feeCharges.id, feePaymentAllocations.chargeId)))
    .where(and(eq(feePaymentAllocations.tenantId, tenantId), eq(feePaymentAllocations.paymentId, id)))
    .orderBy(asc(feeCharges.dueDate), asc(feeCharges.title));
  return { ...payment, lines };
}

/** Every receipt in a date range (D99), newest first: the counter's day book, with reprint and void on screen. */
export async function listPayments(db: DbOrTx, tenantId: string, filter: { range: { from: string; to: string }; status?: "VALID" | "VOID" }) {
  const rows = await db
    .select({
      id: feePayments.id,
      receiptLabel: feePayments.receiptLabel,
      paidOn: feePayments.paidOn,
      method: feePayments.method,
      reference: feePayments.reference,
      amount: feePayments.amount,
      status: feePayments.status,
      voidReason: feePayments.voidReason,
      studentId: students.id,
      studentName: students.fullName,
      studentCode: students.studentCode,
      receivedByName: users.name,
      refunds: sql<number>`(select count(*)::int from ${feeRefunds} r where r.tenant_id = "fee_payments"."tenant_id" and r.payment_id = "fee_payments"."id")`,
    })
    .from(feePayments)
    .innerJoin(students, and(eq(students.tenantId, feePayments.tenantId), eq(students.id, feePayments.studentId)))
    .leftJoin(users, and(eq(users.tenantId, feePayments.tenantId), eq(users.id, feePayments.receivedBy)))
    .where(
      and(
        eq(feePayments.tenantId, tenantId),
        sql`${feePayments.paidOn} between ${filter.range.from} and ${filter.range.to}`,
        filter.status ? eq(feePayments.status, filter.status) : undefined,
      ),
    )
    .orderBy(desc(feePayments.paidOn), desc(feePayments.receiptNo));
  const valid = rows.filter((r) => r.status === "VALID");
  return { range: filter.range, total: fromPoisha(sumPoisha(valid.map((r) => toPoisha(r.amount)))), count: valid.length, payments: rows };
}

/** A student's payments, newest first, with what each paid and how much has been refunded. */
export async function listStudentPayments(db: DbOrTx, tenantId: string, studentId: string) {
  await getInTenant(db, students, tenantId, studentId, "STUDENT");
  const rows = await db
    .select({ id: feePayments.id })
    .from(feePayments)
    .where(and(eq(feePayments.tenantId, tenantId), eq(feePayments.studentId, studentId)))
    .orderBy(desc(feePayments.paidOn), desc(feePayments.receiptNo));
  const payments = await Promise.all(rows.map((r) => getPayment(db, tenantId, r.id)));
  const refunds = rows.length
    ? await db
        .select({ paymentId: feeRefunds.paymentId, amount: feeRefunds.amount, method: feeRefunds.method, reason: feeRefunds.reason, refundedOn: feeRefunds.refundedOn })
        .from(feeRefunds)
        .where(and(eq(feeRefunds.tenantId, tenantId), inArray(feeRefunds.paymentId, rows.map((r) => r.id))))
        .orderBy(asc(feeRefunds.refundedOn))
    : [];
  return payments.map((p) => ({
    ...p,
    refunds: refunds.filter((r) => r.paymentId === p.id).map((r) => ({ amount: r.amount, method: r.method, reason: r.reason, refundedOn: r.refundedOn })),
  }));
}
