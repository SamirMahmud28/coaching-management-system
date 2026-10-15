import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { batchMemberships, batches, courses, feeCharges, feeGenerationRuns, feeItems, studentFeeAmounts, students } from "../../core/db/schema";
import { getInTenant } from "../../core/db/tenant-scope";
import { inTransaction } from "../../core/db/transaction";
import type { DbOrTx } from "../../core/db/types";
import { ConflictError, ValidationError, mapDatabaseError } from "../../core/errors";
import { isCalendarDate, todayInDhaka } from "@/lib/dates";
import { fromPoisha, sumPoisha, toPoisha } from "@/lib/money";
import { audit } from "../audit/service";
import { chargeView, chargeViews } from "./ledger";
import { cleanAmount, type Actor } from "./setup";

// Charge generation, manual fines and cancellation.

export type SkipReason = "ON_HOLD" | "COMPLETED" | "LEFT" | "NOT_IN_COURSE" | "JOINED_LATER" | "ALREADY_CHARGED" | "ZERO_AMOUNT" | "EXCLUDED";

const record = (tx: DbOrTx, actor: Actor, action: string, resourceType: string, resourceId: string, newValue: Record<string, unknown>) =>
  audit.record(tx, { tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action, resourceType, resourceId, newValue });

function reasonText(value: string | null | undefined, field = "reason"): string {
  const text = value?.trim() ?? "";
  if (!text) throw new ValidationError("VALIDATION_REQUIRED", "A reason is required.", { field });
  if (text.length > 300) throw new ValidationError("VALIDATION_TEXT", "The reason can be at most 300 characters.", { field });
  return text;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-06" → first and last day, and "June 2026". */
export function monthOf(period: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new ValidationError("VALIDATION_PERIOD", "Pick a month.", { field: "period" });
  const [y, m] = period.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { first: `${period}-01`, last: `${period}-${String(lastDay).padStart(2, "0")}`, lastDay, label: `${MONTHS[m - 1]} ${y}` };
}

/**
 * A monthly charge is due on the course's due day of that month (31 = the last day); one generated after that day is
 * due on the generation date. A one-time charge is due on the generation date.
 */
export function dueDateFor(kind: string, dueDay: number | null, period: string, today: string): string {
  if (kind !== "MONTHLY") return today;
  const month = monthOf(period);
  const day = Math.min(dueDay === 31 ? month.lastDay : dueDay!, month.lastDay);
  const due = `${period}-${String(day).padStart(2, "0")}`;
  return due < today ? today : due;
}

export interface PreviewRow {
  studentId: string;
  studentCode: string;
  fullName: string;
  amount: string;
  /** The student's own amount is used instead of the fee item's. */
  ownAmount: boolean;
}

export interface Preview {
  feeItem: { id: string; name: string; kind: string; amount: string; courseId: string; courseName: string };
  period: string;
  periodLabel: string;
  dueDate: string;
  toCharge: PreviewRow[];
  skipped: { studentId: string; studentCode: string; fullName: string; reason: SkipReason }[];
  total: string;
}

/** Who a generation would charge and who it skips, with why. Nothing is written. */
export async function previewGeneration(db: DbOrTx, tenantId: string, input: { feeItemId: string; period?: string | null }): Promise<Preview> {
  const item = await getInTenant(db, feeItems, tenantId, input.feeItemId, "FEE_ITEM");
  if (item.status !== "ACTIVE") throw new ConflictError("CONFLICT_FEE_ITEM_ARCHIVED", "This fee is archived. Restore it first.");
  const course = await getInTenant(db, courses, tenantId, item.courseId, "COURSE");
  const monthly = item.kind === "MONTHLY";
  const period = monthly ? (input.period ?? "") : "ONCE";
  const month = monthly ? monthOf(period) : null;
  if (monthly && course.dueDay === null) {
    throw new ValidationError("VALIDATION_DUE_DAY_MISSING", `Set ${course.name}'s monthly due day first (Courses & batches → Edit course).`, { field: "period" });
  }
  const today = todayInDhaka();

  // Everyone with a membership in the course that matters for this period: current members, and — for a month — anyone
  // whose membership overlapped it (so Completed and Left students show as skipped rather than vanishing).
  const rows = await db
    .select({
      studentId: students.id,
      studentCode: students.studentCode,
      fullName: students.fullName,
      studentStatus: students.status,
      membershipStatus: batchMemberships.status,
      startedOn: batchMemberships.startedOn,
      endedOn: batchMemberships.endedOn,
    })
    .from(batchMemberships)
    .innerJoin(batches, and(eq(batches.tenantId, batchMemberships.tenantId), eq(batches.id, batchMemberships.batchId)))
    .innerJoin(students, and(eq(students.tenantId, batchMemberships.tenantId), eq(students.id, batchMemberships.studentId)))
    .where(
      and(
        eq(batchMemberships.tenantId, tenantId),
        eq(batches.courseId, course.id),
        month
          ? sql`(${batchMemberships.status} = 'ACTIVE' or (${batchMemberships.startedOn} <= ${month.last} and ${batchMemberships.endedOn} >= ${month.first}))`
          : eq(batchMemberships.status, "ACTIVE"),
      ),
    );
  const byStudent = new Map<string, { code: string; name: string; status: string; activeSince: string | null }>();
  for (const r of rows) {
    const s = byStudent.get(r.studentId) ?? { code: r.studentCode, name: r.fullName, status: r.studentStatus, activeSince: null };
    if (r.membershipStatus === "ACTIVE" && (!s.activeSince || r.startedOn < s.activeSince)) s.activeSince = r.startedOn;
    byStudent.set(r.studentId, s);
  }
  const ids = [...byStudent.keys()];
  const [charged, own] = ids.length
    ? await Promise.all([
        db
          .select({ studentId: feeCharges.studentId })
          .from(feeCharges)
          .where(and(eq(feeCharges.tenantId, tenantId), eq(feeCharges.feeItemId, item.id), eq(feeCharges.period, period), eq(feeCharges.status, "ACTIVE"), inArray(feeCharges.studentId, ids))),
        db
          .select({ studentId: studentFeeAmounts.studentId, amount: studentFeeAmounts.amount })
          .from(studentFeeAmounts)
          .where(and(eq(studentFeeAmounts.tenantId, tenantId), eq(studentFeeAmounts.feeItemId, item.id), inArray(studentFeeAmounts.studentId, ids))),
      ])
    : [[], []];
  const alreadyCharged = new Set(charged.map((c) => c.studentId));
  const ownAmount = new Map(own.map((o) => [o.studentId, o.amount]));

  const toCharge: PreviewRow[] = [];
  const skipped: Preview["skipped"] = [];
  for (const [studentId, s] of byStudent) {
    const who = { studentId, studentCode: s.code, fullName: s.name };
    const amount = ownAmount.get(studentId) ?? item.amount;
    let reason: SkipReason | null = null;
    if (s.status === "ON_HOLD") reason = "ON_HOLD";
    else if (s.status === "COMPLETED") reason = "COMPLETED";
    else if (s.status === "LEFT") reason = "LEFT";
    else if (!s.activeSince) reason = "NOT_IN_COURSE";
    else if (month && s.activeSince > month.last) reason = "JOINED_LATER";
    else if (alreadyCharged.has(studentId)) reason = "ALREADY_CHARGED";
    else if (toPoisha(amount) === 0) reason = "ZERO_AMOUNT";
    if (reason) skipped.push({ ...who, reason });
    else toCharge.push({ ...who, amount, ownAmount: ownAmount.has(studentId) });
  }
  const byName = (a: { fullName: string }, b: { fullName: string }) => a.fullName.localeCompare(b.fullName);
  toCharge.sort(byName);
  skipped.sort(byName);
  return {
    feeItem: { id: item.id, name: item.name, kind: item.kind, amount: item.amount, courseId: course.id, courseName: course.name },
    period,
    periodLabel: month ? month.label : "One-time",
    dueDate: dueDateFor(item.kind, course.dueDay, period, today),
    toCharge,
    skipped,
    total: fromPoisha(sumPoisha(toCharge.map((r) => toPoisha(r.amount)))),
  };
}

export interface ConfirmInput {
  feeItemId: string;
  period?: string | null;
  /** Students the Admin unticked. */
  exclude?: string[];
  /** Lower amounts for this run only, e.g. a mid-month joiner. */
  amounts?: { studentId: string; amount: string }[];
}

/** Charges everyone the preview would, minus unticked students, in one transaction; duplicates are refused. */
export async function confirmGeneration(db: DbOrTx, actor: Actor, input: ConfirmInput) {
  return inTransaction(db, async (tx) => {
    const preview = await previewGeneration(tx, actor.tenantId, input);
    const exclude = new Set(input.exclude ?? []);
    const lowered = new Map<string, string>();
    for (const a of input.amounts ?? []) {
      const row = preview.toCharge.find((r) => r.studentId === a.studentId);
      if (!row) continue;
      const amount = cleanAmount(a.amount, "amounts");
      if (toPoisha(amount) > toPoisha(row.amount)) {
        throw new ValidationError("VALIDATION_AMOUNT_RAISED", `${row.fullName}'s amount can only be lowered here (it is ${row.amount}).`, { field: "amounts" });
      }
      lowered.set(a.studentId, amount);
    }
    const charging = preview.toCharge.filter((r) => !exclude.has(r.studentId)).map((r) => ({ ...r, amount: lowered.get(r.studentId) ?? r.amount }));
    if (!charging.length) throw new ValidationError("VALIDATION_NOTHING_TO_CHARGE", "Nobody would be charged.");

    const skippedCounts: Record<string, number> = {};
    for (const s of preview.skipped) skippedCounts[s.reason] = (skippedCounts[s.reason] ?? 0) + 1;
    const excludedCount = preview.toCharge.length - charging.length;
    if (excludedCount) skippedCounts.EXCLUDED = excludedCount;
    const total = fromPoisha(sumPoisha(charging.map((r) => toPoisha(r.amount))));

    const [run] = await tx
      .insert(feeGenerationRuns)
      .values({ tenantId: actor.tenantId, feeItemId: preview.feeItem.id, period: preview.period, createdCount: charging.length, skipped: skippedCounts, totalAmount: total, createdBy: actor.userId })
      .returning();
    const title = preview.period === "ONCE" ? preview.feeItem.name : `${preview.feeItem.name} — ${preview.periodLabel}`;
    await tx
      .insert(feeCharges)
      .values(
        charging.map((r) => ({
          tenantId: actor.tenantId, studentId: r.studentId, courseId: preview.feeItem.courseId, feeItemId: preview.feeItem.id, generationRunId: run.id,
          source: "GENERATED" as const, title, period: preview.period, amount: r.amount, dueDate: preview.dueDate, createdBy: actor.userId,
        })),
      )
      .catch((err) => {
        // Someone generated the same fee and period at the same moment: the unique indexes keep it to one charge.
        throw mapDatabaseError(err, {
          entity: "FEE_CHARGE",
          operation: "write",
          unique: {
            fee_charges_active_month_idx: { code: "CONFLICT_ALREADY_CHARGED", field: "period", message: "Some of these students were just charged. Preview again." },
            fee_charges_active_once_idx: { code: "CONFLICT_ALREADY_CHARGED", field: "period", message: "Some of these students were just charged. Preview again." },
          },
        }) ?? err;
      });
    await record(tx, actor, "FEE_CHARGES_GENERATED", "FEE_GENERATION_RUN", run.id, {
      feeItem: preview.feeItem.name, course: preview.feeItem.courseName, period: preview.period, charged: charging.length, skipped: skippedCounts, total,
    });
    return { id: run.id, period: preview.period, periodLabel: preview.periodLabel, createdCount: charging.length, skipped: skippedCounts, total, dueDate: preview.dueDate };
  });
}

/** A manual fine on a student, with a reason; due on the given date or today. */
export async function addFine(db: DbOrTx, actor: Actor, studentId: string, input: { amount: string; reason: string; dueDate?: string | null; courseId?: string | null }) {
  const amount = cleanAmount(input.amount);
  const reason = reasonText(input.reason);
  const dueDate = input.dueDate?.trim() || todayInDhaka();
  if (!isCalendarDate(dueDate)) throw new ValidationError("VALIDATION_DATE", "Enter a valid date.", { field: "dueDate" });
  return inTransaction(db, async (tx) => {
    await getInTenant(tx, students, actor.tenantId, studentId, "STUDENT");
    if (input.courseId) await getInTenant(tx, courses, actor.tenantId, input.courseId, "COURSE");
    const [charge] = await tx
      .insert(feeCharges)
      .values({ tenantId: actor.tenantId, studentId, courseId: input.courseId ?? null, source: "FINE", title: "Fine", amount, dueDate, note: reason, createdBy: actor.userId })
      .returning();
    await record(tx, actor, "FEE_FINE_ADDED", "STUDENT", studentId, { chargeId: charge.id, amount, reason, dueDate });
    return chargeView(tx, actor.tenantId, charge.id);
  });
}

async function cancelOne(tx: DbOrTx, actor: Actor, chargeId: string, reason: string) {
  const charge = await chargeView(tx, actor.tenantId, chargeId);
  if (!charge || charge.state === "CANCELLED") return false;
  if (charge.state === "PAID") return false;
  await tx
    .update(feeCharges)
    .set({ status: "CANCELLED", cancelReason: reason, cancelledAt: new Date(), cancelledBy: actor.userId })
    .where(and(eq(feeCharges.tenantId, actor.tenantId), eq(feeCharges.id, chargeId)));
  return true;
}

/** Cancels an unpaid charge with a reason. A paid charge needs its payment voided first. */
export async function cancelCharge(db: DbOrTx, actor: Actor, chargeId: string, input: { reason: string }) {
  const reason = reasonText(input.reason);
  return inTransaction(db, async (tx) => {
    await getInTenant(tx, feeCharges, actor.tenantId, chargeId, "FEE_CHARGE");
    const charge = (await chargeView(tx, actor.tenantId, chargeId))!;
    if (charge.state === "CANCELLED") throw new ConflictError("CONFLICT_CHARGE_CANCELLED", "This charge is already cancelled.");
    if (charge.state === "PAID") throw new ConflictError("CONFLICT_CHARGE_PAID", "This charge is paid. Void its payment first, then cancel it.");
    await cancelOne(tx, actor, chargeId, reason);
    await record(tx, actor, "FEE_CHARGE_CANCELLED", "STUDENT", charge.studentId, { chargeId, title: charge.title, amount: charge.amount, reason });
    return chargeView(tx, actor.tenantId, chargeId);
  });
}

/** Cancels every unpaid charge of a generation run; paid ones are kept and counted. */
export async function cancelRun(db: DbOrTx, actor: Actor, runId: string, input: { reason: string }) {
  const reason = reasonText(input.reason);
  return inTransaction(db, async (tx) => {
    const run = await getInTenant(tx, feeGenerationRuns, actor.tenantId, runId, "FEE_GENERATION_RUN");
    const ids = await tx
      .select({ id: feeCharges.id })
      .from(feeCharges)
      .where(and(eq(feeCharges.tenantId, actor.tenantId), eq(feeCharges.generationRunId, run.id), eq(feeCharges.status, "ACTIVE")));
    let cancelled = 0;
    for (const { id } of ids) if (await cancelOne(tx, actor, id, reason)) cancelled++;
    const keptPaid = ids.length - cancelled;
    await record(tx, actor, "FEE_RUN_CANCELLED", "FEE_GENERATION_RUN", run.id, { cancelled, keptPaid, reason });
    return { cancelled, keptPaid };
  });
}

/** Recent generation runs with how many of their charges are still active. */
export async function listRuns(db: DbOrTx, tenantId: string, params: { feeItemId?: string; limit?: number } = {}) {
  return db
    .select({
      id: feeGenerationRuns.id,
      feeItemId: feeItems.id,
      feeItemName: feeItems.name,
      courseName: courses.name,
      period: feeGenerationRuns.period,
      createdCount: feeGenerationRuns.createdCount,
      skipped: feeGenerationRuns.skipped,
      totalAmount: feeGenerationRuns.totalAmount,
      createdAt: feeGenerationRuns.createdAt,
      activeCount: sql<number>`(select count(*)::int from fee_charges c where c.tenant_id = ${feeGenerationRuns.tenantId} and c.generation_run_id = ${feeGenerationRuns.id} and c.status = 'ACTIVE')`,
    })
    .from(feeGenerationRuns)
    .innerJoin(feeItems, and(eq(feeItems.tenantId, feeGenerationRuns.tenantId), eq(feeItems.id, feeGenerationRuns.feeItemId)))
    .innerJoin(courses, and(eq(courses.tenantId, feeItems.tenantId), eq(courses.id, feeItems.courseId)))
    .where(and(eq(feeGenerationRuns.tenantId, tenantId), params.feeItemId ? eq(feeGenerationRuns.feeItemId, params.feeItemId) : undefined))
    .orderBy(desc(feeGenerationRuns.createdAt), asc(feeItems.name))
    .limit(Math.min(200, params.limit ?? 50));
}

/** Every charge of a student, newest due first, with its derived state. */
export async function listStudentCharges(db: DbOrTx, tenantId: string, studentId: string) {
  await getInTenant(db, students, tenantId, studentId, "STUDENT");
  return chargeViews(db, and(eq(feeCharges.tenantId, tenantId), eq(feeCharges.studentId, studentId))!);
}
