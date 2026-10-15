import { and, asc, eq, gte, inArray, lte, sql, type Column, type SQL } from "drizzle-orm";
import { batchMemberships, batches, courses, feeCharges, feePaymentAllocations, feePayments, feeRefunds, students } from "../../core/db/schema";
import { getInTenant } from "../../core/db/tenant-scope";
import type { DbOrTx } from "../../core/db/types";
import { ValidationError } from "../../core/errors";
import { isCalendarDate, todayInDhaka } from "@/lib/dates";
import { fromPoisha, sumPoisha, toPoisha } from "@/lib/money";
import { chargeViews } from "./ledger";
import type { PaymentMethod } from "./payments";

// Fee reports: collections, dues (current and former students) and refunds.

export interface ReportFilter {
  courseId?: string;
  batchId?: string;
}

export interface DateRange {
  from: string;
  to: string;
}

export function cleanRange(from: string | undefined, to: string | undefined): DateRange {
  const today = todayInDhaka();
  const range = { from: from ?? `${today.slice(0, 7)}-01`, to: to ?? today };
  if (!isCalendarDate(range.from) || !isCalendarDate(range.to)) throw new ValidationError("VALIDATION_DATE", "Enter valid dates.", { field: "from" });
  if (range.from > range.to) throw new ValidationError("VALIDATION_DATE_RANGE", "The start date is after the end date.", { field: "from" });
  return range;
}

/** The course a filter narrows charges to: the course itself, or the batch's course. */
async function scopeOf(db: DbOrTx, tenantId: string, filter: ReportFilter) {
  if (filter.batchId) {
    const batch = await getInTenant(db, batches, tenantId, filter.batchId, "BATCH");
    if (filter.courseId && filter.courseId !== batch.courseId) throw new ValidationError("VALIDATION_FILTER", "That batch isn't in the chosen course.", { field: "batchId" });
    return { courseId: batch.courseId, batchId: batch.id };
  }
  if (filter.courseId) await getInTenant(db, courses, tenantId, filter.courseId, "COURSE");
  return { courseId: filter.courseId ?? null, batchId: null };
}

/** Students with a membership in the batch: one overlapping the range, or (without a range) a current one. */
function inBatch(tenantId: string, batchId: string, studentColumn: SQL | Column, range?: DateRange) {
  const overlap = range
    ? sql`m.started_on <= ${range.to} and (m.ended_on is null or m.ended_on >= ${range.from})`
    : sql`m.status = 'ACTIVE'`;
  return sql`exists (select 1 from ${batchMemberships} m where m.tenant_id = ${tenantId} and m.batch_id = ${batchId} and m.student_id = ${studentColumn} and ${overlap})`;
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export async function collectionReport(db: DbOrTx, tenantId: string, range: DateRange, filter: ReportFilter = {}) {
  const scope = await scopeOf(db, tenantId, filter);
  const lines = await db
    .select({
      paymentId: feePayments.id,
      receiptLabel: feePayments.receiptLabel,
      receiptNo: feePayments.receiptNo,
      paidOn: feePayments.paidOn,
      method: feePayments.method,
      status: feePayments.status,
      voidReason: feePayments.voidReason,
      voidedAt: feePayments.voidedAt,
      studentName: students.fullName,
      studentCode: students.studentCode,
      amount: feePaymentAllocations.amount,
    })
    .from(feePaymentAllocations)
    .innerJoin(feePayments, and(eq(feePayments.tenantId, feePaymentAllocations.tenantId), eq(feePayments.id, feePaymentAllocations.paymentId)))
    .innerJoin(feeCharges, and(eq(feeCharges.tenantId, feePaymentAllocations.tenantId), eq(feeCharges.id, feePaymentAllocations.chargeId)))
    .innerJoin(students, and(eq(students.tenantId, feePayments.tenantId), eq(students.id, feePayments.studentId)))
    .where(
      and(
        eq(feePaymentAllocations.tenantId, tenantId),
        gte(feePayments.paidOn, range.from),
        lte(feePayments.paidOn, range.to),
        scope.courseId ? eq(feeCharges.courseId, scope.courseId) : undefined,
        scope.batchId ? inBatch(tenantId, scope.batchId, feePayments.studentId, range) : undefined,
      ),
    )
    .orderBy(asc(feePayments.paidOn), asc(feePayments.receiptNo));

  // One row per payment, for the part of it inside the filter.
  const byPayment = new Map<string, (typeof lines)[number] & { poisha: number }>();
  for (const l of lines) {
    const row = byPayment.get(l.paymentId);
    if (row) row.poisha += toPoisha(l.amount);
    else byPayment.set(l.paymentId, { ...l, poisha: toPoisha(l.amount) });
  }
  const all = [...byPayment.values()];
  const valid = all.filter((p) => p.status === "VALID");
  const voided = all.filter((p) => p.status === "VOID");
  // A list, not an object keyed by method: JSON keys are snake-cased on the way out, and method names must survive.
  const methodTotals = new Map<PaymentMethod, number>();
  for (const p of valid) methodTotals.set(p.method, (methodTotals.get(p.method) ?? 0) + p.poisha);
  const byMethod = [...methodTotals.entries()].map(([method, poisha]) => ({ method, amount: fromPoisha(poisha) }));
  const refunds = await refundsReport(db, tenantId, range, filter);
  const collected = sumPoisha(valid.map((p) => p.poisha));
  return {
    range,
    payments: valid.map((p) => ({ paymentId: p.paymentId, receiptLabel: p.receiptLabel, paidOn: p.paidOn, studentName: p.studentName, studentCode: p.studentCode, method: p.method, amount: fromPoisha(p.poisha) })),
    byMethod,
    collected: fromPoisha(collected),
    refunded: refunds.total,
    net: fromPoisha(collected - toPoisha(refunds.total)),
    voided: voided.map((p) => ({
      paymentId: p.paymentId, receiptLabel: p.receiptLabel, paidOn: p.paidOn, studentName: p.studentName, studentCode: p.studentCode, amount: fromPoisha(p.poisha),
      voidReason: p.voidReason, voidedOn: p.voidedAt ? p.voidedAt.toISOString().slice(0, 10) : null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

export async function refundsReport(db: DbOrTx, tenantId: string, range: DateRange, filter: ReportFilter = {}) {
  const scope = await scopeOf(db, tenantId, filter);
  const rows = await db
    .select({
      id: feeRefunds.id,
      refundedOn: feeRefunds.refundedOn,
      amount: feeRefunds.amount,
      method: feeRefunds.method,
      reference: feeRefunds.reference,
      reason: feeRefunds.reason,
      chargeTitle: feeCharges.title,
      receiptLabel: feePayments.receiptLabel,
      studentName: students.fullName,
      studentCode: students.studentCode,
    })
    .from(feeRefunds)
    .innerJoin(feeCharges, and(eq(feeCharges.tenantId, feeRefunds.tenantId), eq(feeCharges.id, feeRefunds.chargeId)))
    .innerJoin(feePayments, and(eq(feePayments.tenantId, feeRefunds.tenantId), eq(feePayments.id, feeRefunds.paymentId)))
    .innerJoin(students, and(eq(students.tenantId, feeCharges.tenantId), eq(students.id, feeCharges.studentId)))
    .where(
      and(
        eq(feeRefunds.tenantId, tenantId),
        gte(feeRefunds.refundedOn, range.from),
        lte(feeRefunds.refundedOn, range.to),
        scope.courseId ? eq(feeCharges.courseId, scope.courseId) : undefined,
        scope.batchId ? inBatch(tenantId, scope.batchId, feeCharges.studentId, range) : undefined,
      ),
    )
    .orderBy(asc(feeRefunds.refundedOn), asc(students.fullName));
  return { range, refunds: rows, total: fromPoisha(sumPoisha(rows.map((r) => toPoisha(r.amount)))) };
}

// ---------------------------------------------------------------------------
// Dues
// ---------------------------------------------------------------------------

/**
 * Unpaid charges as of today, one line per student, most overdue first. `former` switches from current students
 * (Active, On Hold) to former ones (Completed, Left), whose dues outlive them. Guardian mobiles only `withContacts`.
 */
export async function duesReport(db: DbOrTx, tenantId: string, filter: ReportFilter & { former?: boolean; withContacts?: boolean } = {}) {
  const scope = await scopeOf(db, tenantId, filter);
  const statuses = filter.former ? (["COMPLETED", "LEFT"] as const) : (["ACTIVE", "ON_HOLD"] as const);
  const candidates = await db
    .select({ id: students.id, name: students.fullName, code: students.studentCode, status: students.status, guardianPhone: students.guardianPhone })
    .from(students)
    .where(and(eq(students.tenantId, tenantId), inArray(students.status, [...statuses]), scope.batchId ? inBatch(tenantId, scope.batchId, sql`"students"."id"`) : undefined));
  if (!candidates.length) return { rows: [], totalDue: "0.00", totalOverdue: "0.00", former: !!filter.former };
  const views = await chargeViews(
    db,
    and(
      eq(feeCharges.tenantId, tenantId),
      eq(feeCharges.status, "ACTIVE"),
      inArray(feeCharges.studentId, candidates.map((c) => c.id)),
      scope.courseId ? eq(feeCharges.courseId, scope.courseId) : undefined,
    )!,
    "dueAsc",
  );
  const due = views.filter((v) => v.state === "DUE");
  const rows = candidates
    .map((s) => {
      const mine = due.filter((v) => v.studentId === s.id);
      return {
        studentId: s.id,
        studentName: s.name,
        studentCode: s.code,
        status: s.status,
        guardianPhone: filter.withContacts ? s.guardianPhone : null,
        unpaidCount: mine.length,
        totalDue: fromPoisha(sumPoisha(mine.map((v) => toPoisha(v.net)))),
        overdue: fromPoisha(sumPoisha(mine.filter((v) => v.overdue).map((v) => toPoisha(v.net)))),
        oldestDue: mine[0]?.dueDate ?? null,
      };
    })
    .filter((r) => r.unpaidCount > 0)
    .sort((a, b) => toPoisha(b.overdue) - toPoisha(a.overdue) || (a.oldestDue ?? "").localeCompare(b.oldestDue ?? "") || a.studentName.localeCompare(b.studentName));
  return {
    rows,
    totalDue: fromPoisha(sumPoisha(rows.map((r) => toPoisha(r.totalDue)))),
    totalOverdue: fromPoisha(sumPoisha(rows.map((r) => toPoisha(r.overdue)))),
    former: !!filter.former,
  };
}

