import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { courses, feeCharges } from "../../core/db/schema";
import type { DbOrTx } from "../../core/db/types";
import { fromPoisha, toPoisha } from "@/lib/money";
import { todayInDhaka } from "@/lib/dates";

/**
 * A charge as the fee screens see it. Its state is derived, never stored: cancelled; paid (settled by a valid payment);
 * waived (waivers took it to zero); or due (overdue once its due date has passed). Voiding a payment makes its charges
 * due again (D35); a refund never does (D37).
 */
export type ChargeState = "DUE" | "PAID" | "WAIVED" | "CANCELLED";

// Subqueries on the outer "fee_charges" row (table-qualified by hand: Drizzle renders bare columns in a single-table select).
const waived = sql<string>`(select coalesce(sum(w.amount), 0)::text from fee_waivers w where w.tenant_id = "fee_charges"."tenant_id" and w.charge_id = "fee_charges"."id")`;
const paidBy = sql<{ payment_id: string; receipt_label: string; paid_on: string; amount: string } | null>`(
  select json_build_object('payment_id', p.id, 'receipt_label', p.receipt_label, 'paid_on', p.paid_on, 'amount', a.amount::text)
  from fee_payment_allocations a join fee_payments p on p.tenant_id = a.tenant_id and p.id = a.payment_id
  where a.tenant_id = "fee_charges"."tenant_id" and a.charge_id = "fee_charges"."id" and p.status = 'VALID'
  limit 1)`;
const refunded = sql<string>`(select coalesce(sum(r.amount), 0)::text from fee_refunds r where r.tenant_id = "fee_charges"."tenant_id" and r.charge_id = "fee_charges"."id")`;

export interface ChargeView {
  id: string;
  studentId: string;
  courseId: string | null;
  courseName: string | null;
  feeItemId: string | null;
  generationRunId: string | null;
  source: "GENERATED" | "FINE";
  title: string;
  period: string | null;
  amount: string;
  waived: string;
  /** What is (or was) owed after waivers: amount − waived. */
  net: string;
  dueDate: string;
  note: string | null;
  state: ChargeState;
  overdue: boolean;
  paidBy: { paymentId: string; receiptLabel: string; paidOn: string; amount: string } | null;
  refunded: string;
  cancelReason: string | null;
  createdAt: Date;
}

/** Charges matching `where` (always include the tenant condition), newest due first unless `order` says otherwise. */
export async function chargeViews(db: DbOrTx, where: SQL, order: "dueAsc" | "dueDesc" = "dueDesc"): Promise<ChargeView[]> {
  const rows = await db
    .select({
      id: feeCharges.id,
      studentId: feeCharges.studentId,
      courseId: feeCharges.courseId,
      courseName: courses.name,
      feeItemId: feeCharges.feeItemId,
      generationRunId: feeCharges.generationRunId,
      source: feeCharges.source,
      title: feeCharges.title,
      period: feeCharges.period,
      amount: feeCharges.amount,
      dueDate: feeCharges.dueDate,
      note: feeCharges.note,
      status: feeCharges.status,
      cancelReason: feeCharges.cancelReason,
      createdAt: feeCharges.createdAt,
      waived,
      paidBy,
      refunded,
    })
    .from(feeCharges)
    .leftJoin(courses, and(eq(courses.tenantId, feeCharges.tenantId), eq(courses.id, feeCharges.courseId)))
    .where(where)
    .orderBy(order === "dueAsc" ? asc(feeCharges.dueDate) : desc(feeCharges.dueDate), asc(feeCharges.title), asc(feeCharges.id));
  const today = todayInDhaka();
  return rows.map((r) => {
    const netPoisha = toPoisha(r.amount) - toPoisha(r.waived);
    const state: ChargeState = r.status === "CANCELLED" ? "CANCELLED" : r.paidBy ? "PAID" : netPoisha <= 0 ? "WAIVED" : "DUE";
    return {
      id: r.id,
      studentId: r.studentId,
      courseId: r.courseId,
      courseName: r.courseName,
      feeItemId: r.feeItemId,
      generationRunId: r.generationRunId,
      source: r.source,
      title: r.title,
      period: r.period,
      amount: r.amount,
      waived: fromPoisha(toPoisha(r.waived)),
      net: fromPoisha(Math.max(0, netPoisha)),
      dueDate: r.dueDate,
      note: r.note,
      state,
      overdue: state === "DUE" && r.dueDate < today,
      paidBy: r.paidBy ? { paymentId: r.paidBy.payment_id, receiptLabel: r.paidBy.receipt_label, paidOn: r.paidBy.paid_on, amount: r.paidBy.amount } : null,
      refunded: fromPoisha(toPoisha(r.refunded)),
      cancelReason: r.cancelReason,
      createdAt: r.createdAt,
    };
  });
}

export async function chargeView(db: DbOrTx, tenantId: string, id: string): Promise<ChargeView | null> {
  const [row] = await chargeViews(db, and(eq(feeCharges.tenantId, tenantId), eq(feeCharges.id, id))!);
  return row ?? null;
}

export async function chargeViewsByIds(db: DbOrTx, tenantId: string, ids: string[]): Promise<ChargeView[]> {
  if (!ids.length) return [];
  return chargeViews(db, and(eq(feeCharges.tenantId, tenantId), inArray(feeCharges.id, ids))!, "dueAsc");
}
