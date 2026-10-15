import { and, between, count, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  attendanceClasses,
  attendanceMarks,
  batchSubjectInstructors,
  batchSubjects,
  courses,
  feeCharges,
  feeItems,
  feePaymentAllocations,
  feePayments,
  feeRefunds,
  instructors,
  scheduleSlots,
  students,
  websiteSettings,
} from "../../core/db/schema";
import type { DbOrTx } from "../../core/db/types";
import { ValidationError } from "../../core/errors";
import { addDays, isCalendarDate, todayInDhaka } from "@/lib/dates";
import { fromPoisha, sumPoisha, toPoisha } from "@/lib/money";
import { listLeave } from "../attendance/leave";
import { classesOn, scopedBatchSubjects } from "../attendance/registers";
import { tallyCounts, type AttendanceTally } from "../attendance/tally";
import { isModuleActive } from "../entitlements/service";
import { getResults } from "../exams/results";
import { listExams } from "../exams/setup";
import { chargeViews } from "../fees/ledger";
import { duesReport } from "../fees/reports";
import { getDashboardCounts } from "../portal/service";
import { listChanges, routineClassesOn } from "../routine/service";
import { listEnquiries } from "../website/enquiries";

/**
 * The admin "Today" dashboard: a thin aggregator over the modules' own services, so every number follows the
 * same rule as its page (attendance % = tally, money in poisha, exam readiness = the publish check). Each section is
 * computed only for a viewer holding its permission; permissions are already limited to the institute's active modules.
 */
export interface DashboardViewer {
  tenantId: string;
  userId: string;
  permissions: ReadonlySet<string>;
}

const can = (v: DashboardViewer, ...perms: string[]) => perms.some((p) => v.permissions.has(p));
const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const isMonth = (period: string | null): period is string => !!period && /^\d{4}-\d{2}$/.test(period);

const dhakaTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit", hour12: false });
/** The time now in Bangladesh as HH:MM. */
export const nowInDhaka = (now: Date = new Date()) => dhakaTime.format(now);

// ---------------------------------------------------------------------------------------------------------------------
// Attendance (the same rule as everywhere: tally over TAKEN classes; excused and unmarked count neither way)
// ---------------------------------------------------------------------------------------------------------------------

export type AttendancePeriod = "TODAY" | "WEEK" | "MONTH";

export function periodRange(period: AttendancePeriod, today = todayInDhaka()): { from: string; to: string } {
  if (period === "TODAY") return { from: today, to: today };
  if (period === "WEEK") return { from: addDays(today, -6), to: today };
  return { from: monthStart(today), to: today };
}

/** Effective-status counts per batch over the viewer's batches between two dates. */
async function attendanceByBatch(db: DbOrTx, viewer: DashboardViewer, from: string, to: string) {
  const scope = await scopedBatchSubjects(db, viewer);
  const counts = new Map<string, { present: number; late: number; absent: number; excused: number }>();
  if (!scope.length) return { scope, counts };
  const bsToBatch = new Map(scope.map((s) => [s.id, s.batchId]));
  const effective = sql<string>`case when ${attendanceMarks.leaveId} is not null then 'EXCUSED' else ${attendanceMarks.status}::text end`;
  const rows = await db
    .select({ batchSubjectId: attendanceClasses.batchSubjectId, status: effective, n: count() })
    .from(attendanceMarks)
    .innerJoin(attendanceClasses, and(eq(attendanceClasses.tenantId, attendanceMarks.tenantId), eq(attendanceClasses.id, attendanceMarks.classId)))
    .where(
      and(
        eq(attendanceMarks.tenantId, viewer.tenantId),
        eq(attendanceClasses.state, "TAKEN"),
        between(attendanceClasses.classDate, from, to),
        inArray(attendanceClasses.batchSubjectId, [...bsToBatch.keys()]),
      ),
    )
    .groupBy(attendanceClasses.batchSubjectId, effective);
  for (const r of rows) {
    const batchId = bsToBatch.get(r.batchSubjectId)!;
    const c = counts.get(batchId) ?? { present: 0, late: 0, absent: 0, excused: 0 };
    if (r.status === "PRESENT") c.present += r.n;
    else if (r.status === "LATE") c.late += r.n;
    else if (r.status === "ABSENT") c.absent += r.n;
    else if (r.status === "EXCUSED") c.excused += r.n;
    counts.set(batchId, c);
  }
  return { scope, counts };
}

const sumCounts = (all: Iterable<{ present: number; late: number; absent: number; excused: number }>) => {
  const t = { present: 0, late: 0, absent: 0, excused: 0 };
  for (const c of all) {
    t.present += c.present;
    t.late += c.late;
    t.absent += c.absent;
    t.excused += c.excused;
  }
  return tallyCounts(t);
};

export interface BatchAttendance extends AttendanceTally {
  batchId: string;
  batchName: string;
  courseName: string;
}

/** Attendance by batch for today, the last 7 days or this month, plus the overall figure. */
export async function batchAttendance(db: DbOrTx, viewer: DashboardViewer, period: AttendancePeriod) {
  const range = periodRange(period);
  const { scope, counts } = await attendanceByBatch(db, viewer, range.from, range.to);
  const batches = new Map<string, { batchName: string; courseName: string }>();
  for (const s of scope) if (!batches.has(s.batchId)) batches.set(s.batchId, { batchName: s.batchName, courseName: s.courseName });
  const rows: BatchAttendance[] = [...batches.entries()]
    .map(([batchId, b]) => ({ batchId, ...b, ...tallyCounts(counts.get(batchId) ?? { present: 0, late: 0, absent: 0, excused: 0 }) }))
    .sort((a, b) => a.courseName.localeCompare(b.courseName) || a.batchName.localeCompare(b.batchName));
  return { period, ...range, batches: rows, overall: sumCounts(counts.values()) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Today's classes (the register's view of the day, with who teaches each class)
// ---------------------------------------------------------------------------------------------------------------------

export async function todaysClasses(db: DbOrTx, viewer: DashboardViewer, dateInput?: string) {
  const today = todayInDhaka();
  const date = dateInput ?? today;
  if (!isCalendarDate(date)) throw new ValidationError("VALIDATION_DATE", "Enter a date as YYYY-MM-DD.", { field: "date" });
  const classes = await classesOn(db, viewer, date);
  const ids = [...new Set(classes.map((c) => c.batchSubjectId))];
  // Who teaches: the routine's view (with substitutes) when the module is on, else the subject's assigned instructors.
  const routine = await routineClassesOn(db, viewer.tenantId, date, ids);
  const routineAt = new Map((routine ?? []).map((c) => [`${c.batchSubjectId}|${c.startsAt}`, c]));
  const assigned = new Map<string, string[]>();
  if (!routine && ids.length) {
    const rows = await db
      .select({ batchSubjectId: batchSubjectInstructors.batchSubjectId, name: instructors.fullName })
      .from(batchSubjectInstructors)
      .innerJoin(instructors, and(eq(instructors.tenantId, batchSubjectInstructors.tenantId), eq(instructors.id, batchSubjectInstructors.instructorId)))
      .where(and(eq(batchSubjectInstructors.tenantId, viewer.tenantId), inArray(batchSubjectInstructors.batchSubjectId, ids)));
    for (const r of rows) assigned.set(r.batchSubjectId, [...(assigned.get(r.batchSubjectId) ?? []), r.name]);
  }
  const now = nowInDhaka();
  const rows = classes.map((c) => {
    const r = routineAt.get(`${c.batchSubjectId}|${c.startsAt}`);
    return {
      ...c,
      instructors: r ? r.instructors.map((i) => i.name) : (assigned.get(c.batchSubjectId) ?? []),
      substitute: r?.substituteName ?? null,
      ended: date < today || (date === today && c.endsAt <= now),
    };
  });
  return {
    date,
    today,
    canTake: can(viewer, "attendance.take"),
    counts: {
      total: rows.length,
      taken: rows.filter((c) => c.state === "TAKEN").length,
      notYet: rows.filter((c) => c.state === "NOT_TAKEN" || c.state === "OPEN").length,
      notHeld: rows.filter((c) => c.state === "NOT_HELD").length,
    },
    classes: rows,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Fees (integer poisha; collected = valid allocations by payment date less refunds, as in the collection report)
// ---------------------------------------------------------------------------------------------------------------------

/** Net collected per month (YYYY-MM → poisha) between two dates. */
async function collectedByMonth(db: DbOrTx, tenantId: string, from: string, to: string) {
  const month = sql<string>`to_char(${feePayments.paidOn}, 'YYYY-MM')`;
  const refundMonth = sql<string>`to_char(${feeRefunds.refundedOn}, 'YYYY-MM')`;
  const [paid, refunded] = await Promise.all([
    db
      .select({ month, amount: sql<string>`sum(${feePaymentAllocations.amount})::text` })
      .from(feePaymentAllocations)
      .innerJoin(feePayments, and(eq(feePayments.tenantId, feePaymentAllocations.tenantId), eq(feePayments.id, feePaymentAllocations.paymentId)))
      .where(and(eq(feePaymentAllocations.tenantId, tenantId), eq(feePayments.status, "VALID"), between(feePayments.paidOn, from, to)))
      .groupBy(month),
    db
      .select({ month: refundMonth, amount: sql<string>`sum(${feeRefunds.amount})::text` })
      .from(feeRefunds)
      .where(and(eq(feeRefunds.tenantId, tenantId), between(feeRefunds.refundedOn, from, to)))
      .groupBy(refundMonth),
  ]);
  const out = new Map<string, number>();
  for (const r of paid) out.set(r.month, (out.get(r.month) ?? 0) + toPoisha(r.amount));
  for (const r of refunded) out.set(r.month, (out.get(r.month) ?? 0) - toPoisha(r.amount));
  return out;
}

const total = (m: Map<string, number>) => sumPoisha([...m.values()]);

export interface FeeMonth {
  month: string;
  collected: string;
  billed: string;
  /** Collected ÷ billed, one decimal, or null when nothing was billed. */
  percent: number | null;
  studentsBilled: number;
  studentsPaid: number;
}

/**
 * Each month of a year: what was billed (the month's charges after waivers; one-off charges by their due month) and
 * what was collected, plus how many billed students have settled every charge of that month.
 */
export async function feeMonths(db: DbOrTx, tenantId: string, year: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new ValidationError("VALIDATION_FAILED", "Choose a year.", { field: "year" });
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const charges = await chargeViews(
    db,
    and(
      eq(feeCharges.tenantId, tenantId),
      sql`(${feeCharges.period} like ${`${year}-%`} or ((${feeCharges.period} is null or ${feeCharges.period} !~ '^[0-9]{4}-[0-9]{2}$') and ${feeCharges.dueDate} between ${from} and ${to}))`,
    )!,
    "dueAsc",
  );
  const billed = new Map<string, number>();
  const settledByStudent = new Map<string, Map<string, boolean>>();
  for (const c of charges) {
    if (c.state === "CANCELLED") continue;
    const month = isMonth(c.period) ? c.period : c.dueDate.slice(0, 7);
    billed.set(month, (billed.get(month) ?? 0) + toPoisha(c.net));
    const studentsOfMonth = settledByStudent.get(month) ?? new Map<string, boolean>();
    studentsOfMonth.set(c.studentId, (studentsOfMonth.get(c.studentId) ?? true) && (c.state === "PAID" || c.state === "WAIVED"));
    settledByStudent.set(month, studentsOfMonth);
  }
  const collected = await collectedByMonth(db, tenantId, from, to);
  const months: FeeMonth[] = Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, "0")}`;
    const b = billed.get(month) ?? 0;
    const c = collected.get(month) ?? 0;
    const settled = [...(settledByStudent.get(month)?.values() ?? [])];
    return {
      month,
      billed: fromPoisha(b),
      collected: fromPoisha(c),
      percent: b > 0 ? Math.round((c * 1000) / b) / 10 : null,
      studentsBilled: settled.length,
      studentsPaid: settled.filter(Boolean).length,
    };
  });
  const billedTotal = total(billed);
  const collectedTotal = total(collected);
  return {
    year,
    months,
    totals: {
      billed: fromPoisha(billedTotal),
      collected: fromPoisha(collectedTotal),
      percent: billedTotal > 0 ? Math.round((collectedTotal * 1000) / billedTotal) / 10 : null,
      studentsBilled: new Set(charges.filter((c) => c.state !== "CANCELLED").map((c) => c.studentId)).size,
      studentsPaid: months.reduce((n, m) => n + m.studentsPaid, 0),
      studentMonthsBilled: months.reduce((n, m) => n + m.studentsBilled, 0),
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// KPI summary
// ---------------------------------------------------------------------------------------------------------------------

export async function summary(db: DbOrTx, viewer: DashboardViewer) {
  const today = todayInDhaka();
  const out: {
    students?: { active: number; onHold: number; admittedThisMonth: number };
    attendance?: { today: AttendanceTally; yesterday: number | null };
    fees?: { collectedThisMonth: string; collectedLastMonthToDate: string; billedThisMonth: string };
  } = {};
  const jobs: Promise<void>[] = [];

  if (can(viewer, "students.view")) {
    jobs.push(
      (async () => {
        const [counts, [admitted]] = await Promise.all([
          getDashboardCounts(db, viewer.tenantId),
          db.select({ n: count() }).from(students).where(and(eq(students.tenantId, viewer.tenantId), gte(students.admissionDate, monthStart(today)), lte(students.admissionDate, today))),
        ]);
        out.students = { active: counts.students.active, onHold: counts.students.onHold, admittedThisMonth: admitted.n };
      })(),
    );
  }
  if (can(viewer, "attendance.report.view")) {
    jobs.push(
      (async () => {
        const yesterday = addDays(today, -1);
        const [t, y] = await Promise.all([attendanceByBatch(db, viewer, today, today), attendanceByBatch(db, viewer, yesterday, yesterday)]);
        out.attendance = { today: sumCounts(t.counts.values()), yesterday: sumCounts(y.counts.values()).percentage };
      })(),
    );
  }
  if (can(viewer, "fees.report.view")) {
    jobs.push(
      (async () => {
        const thisMonth = monthStart(today);
        const lastMonth = monthStart(addDays(thisMonth, -1));
        // The same number of days into last month, capped at its end.
        const day = Number(today.slice(8, 10));
        const lastMonthEnd = addDays(thisMonth, -1);
        const lastSameDay = addDays(lastMonth, day - 1) > lastMonthEnd ? lastMonthEnd : addDays(lastMonth, day - 1);
        const [now, before, year] = await Promise.all([
          collectedByMonth(db, viewer.tenantId, thisMonth, today),
          collectedByMonth(db, viewer.tenantId, lastMonth, lastSameDay),
          feeMonths(db, viewer.tenantId, Number(today.slice(0, 4))),
        ]);
        out.fees = {
          collectedThisMonth: fromPoisha(total(now)),
          collectedLastMonthToDate: fromPoisha(total(before)),
          billedThisMonth: year.months.find((m) => m.month === today.slice(0, 7))?.billed ?? "0.00",
        };
      })(),
    );
  }
  await Promise.all(jobs);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Pending actions
// ---------------------------------------------------------------------------------------------------------------------

export interface AttentionItem {
  key: string;
  tone: "critical" | "warning" | "info";
  title: string;
  detail: string;
  count: number;
  href: string;
}

const TONE_ORDER = { critical: 0, warning: 1, info: 2 } as const;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What needs someone's attention now, each only for those who can act on it; critical first. */
export async function attention(db: DbOrTx, viewer: DashboardViewer): Promise<AttentionItem[]> {
  const today = todayInDhaka();
  const items: AttentionItem[] = [];
  const jobs: Promise<void>[] = [];

  if (can(viewer, "attendance.take")) {
    jobs.push(
      (async () => {
        const day = await todaysClasses(db, viewer, today);
        const due = day.classes.filter((c) => c.ended && (c.state === "NOT_TAKEN" || c.state === "OPEN"));
        if (due.length)
          items.push({
            key: "registers",
            tone: "critical",
            title: `${plural(due.length, "register")} not taken`,
            detail: `Today's ended classes: ${due.slice(0, 3).map((c) => `${c.subjectName} · ${c.batchName}`).join(", ")}${due.length > 3 ? "…" : ""}`,
            count: due.length,
            href: "/app/attendance",
          });
      })(),
    );
  }
  if (can(viewer, "leave.manage")) {
    jobs.push(
      (async () => {
        const pending = await listLeave(db, viewer.tenantId, { status: "PENDING" });
        if (pending.length)
          items.push({ key: "leave", tone: "warning", title: `${plural(pending.length, "leave request")} to decide`, detail: "Waiting for approval", count: pending.length, href: "/app/attendance/leave" });
      })(),
    );
  }
  if (can(viewer, "exams.publish", "exams.manage")) {
    jobs.push(
      (async () => {
        const drafts = (await listExams(db, viewer, { state: "DRAFT" })).filter((e) => e.startsOn <= today).slice(0, 10);
        for (const exam of drafts) {
          const results = await getResults(db, viewer, exam.id).catch(() => null);
          if (!results || !results.rows.length) continue;
          const missing = results.missing.length;
          if (missing)
            items.push({ key: `exam-${exam.id}`, tone: "warning", title: `${exam.name}: marks missing`, detail: `${plural(missing, "student")} still without every mark`, count: missing, href: `/app/exams/${exam.id}` });
          else if (can(viewer, "exams.publish"))
            items.push({ key: `exam-${exam.id}`, tone: "info", title: `${exam.name}: ready to publish`, detail: "Every mark is in", count: 1, href: `/app/exams/${exam.id}/results` });
        }
      })(),
    );
  }
  if (can(viewer, "website.manage")) {
    jobs.push(
      (async () => {
        const { counts } = await listEnquiries(db, viewer.tenantId, { status: "NEW" });
        if (counts.NEW) items.push({ key: "enquiries", tone: "info", title: `${plural(counts.NEW, "new enquiry", "new enquiries")}`, detail: "From your website", count: counts.NEW, href: "/app/website/enquiries" });
      })(),
    );
  }
  if (can(viewer, "fees.report.view")) {
    jobs.push(
      (async () => {
        const dues = await duesReport(db, viewer.tenantId);
        const overdue = dues.rows.filter((r) => toPoisha(r.overdue) > 0);
        if (overdue.length)
          items.push({
            key: "overdue",
            tone: "critical",
            title: `${plural(overdue.length, "student")} with overdue fees`,
            detail: `৳${Number(dues.totalOverdue).toLocaleString("en-IN")} overdue in all`,
            count: overdue.length,
            href: "/app/fees/reports",
          });
      })(),
    );
  }
  await Promise.all(jobs);
  return items.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || b.count - a.count);
}

// ---------------------------------------------------------------------------------------------------------------------
// Coming up
// ---------------------------------------------------------------------------------------------------------------------

export interface UpcomingItem {
  key: string;
  kind: "EXAM" | "HOLIDAY" | "CANCELLED" | "SUBSTITUTE" | "RESCHEDULED";
  date: string;
  title: string;
  detail: string;
  href: string;
}

/** Exams, holidays and class changes in the next `days` days (today included). */
export async function upcoming(db: DbOrTx, viewer: DashboardViewer, days = 14): Promise<UpcomingItem[]> {
  const today = todayInDhaka();
  const to = addDays(today, days - 1);
  const items: UpcomingItem[] = [];
  const within = (d: string | null) => !!d && d >= today && d <= to;
  const jobs: Promise<void>[] = [];

  if (can(viewer, "exams.view")) {
    jobs.push(
      (async () => {
        for (const e of await listExams(db, viewer)) {
          if (within(e.startsOn))
            items.push({ key: `exam-${e.id}`, kind: "EXAM", date: e.startsOn, title: e.name, detail: e.endsOn !== e.startsOn ? `${e.courseName} · until ${e.endsOn}` : e.courseName, href: `/app/exams/${e.id}` });
        }
      })(),
    );
  }
  if (can(viewer, "routine.view")) {
    jobs.push(
      (async () => {
        const { changes, holidays } = await listChanges(db, viewer, { from: today });
        for (const h of holidays) {
          const date = h.fromDate < today ? today : h.fromDate;
          if (within(date)) items.push({ key: `holiday-${h.id}`, kind: "HOLIDAY", date, title: h.name, detail: h.fromDate === h.toDate ? "Holiday" : `Holiday until ${h.toDate}`, href: "/app/routine" });
        }
        for (const c of changes) {
          if (!within(c.classDate)) continue;
          const what = `${c.subjectName} · ${c.batchName}, ${c.startsAt}`;
          if (c.kind === "CANCEL") items.push({ key: `change-${c.id}`, kind: "CANCELLED", date: c.classDate, title: `${c.subjectName} cancelled`, detail: `${what}${c.reason ? ` · ${c.reason}` : ""}`, href: "/app/routine" });
          else if (c.kind === "SUBSTITUTE") items.push({ key: `change-${c.id}`, kind: "SUBSTITUTE", date: c.classDate, title: `Substitute for ${c.subjectName}`, detail: `${what} · ${c.substituteName ?? "—"}`, href: "/app/routine" });
          else items.push({ key: `change-${c.id}`, kind: "RESCHEDULED", date: c.classDate, title: `${c.subjectName} moved`, detail: `${what} → ${c.newDate ?? ""} ${c.newStartsAt ?? ""}`.trim(), href: "/app/routine" });
        }
      })(),
    );
  }
  await Promise.all(jobs);
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)).slice(0, 12);
}

// ---------------------------------------------------------------------------------------------------------------------
// Set-up checklist (a new institute's first steps, judged from its data)
// ---------------------------------------------------------------------------------------------------------------------

export interface SetupStep {
  key: string;
  title: string;
  done: boolean;
  href: string;
}

export async function setupChecklist(db: DbOrTx, viewer: DashboardViewer): Promise<{ steps: SetupStep[]; done: number }> {
  const t = viewer.tenantId;
  const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const [courseCount, scheduled, instructorCount, studentCount, feesOn, websiteOn] = await Promise.all([
    n(db.select({ n: count() }).from(courses).where(eq(courses.tenantId, t))),
    n(db.select({ n: count() }).from(scheduleSlots).innerJoin(batchSubjects, and(eq(batchSubjects.tenantId, scheduleSlots.tenantId), eq(batchSubjects.id, scheduleSlots.batchSubjectId))).where(eq(scheduleSlots.tenantId, t))),
    n(db.select({ n: count() }).from(instructors).where(eq(instructors.tenantId, t))),
    n(db.select({ n: count() }).from(students).where(eq(students.tenantId, t))),
    isModuleActive(db, t, "fees"),
    isModuleActive(db, t, "website"),
  ]);
  const steps: SetupStep[] = [
    { key: "course", title: "Add a course", done: courseCount > 0, href: "/app/courses" },
    { key: "schedule", title: "Add a batch and its weekly schedule", done: scheduled > 0, href: "/app/courses" },
    { key: "instructor", title: "Add an instructor", done: instructorCount > 0, href: "/app/instructors" },
    { key: "student", title: "Admit your first student", done: studentCount > 0, href: "/app/students/new" },
  ];
  if (feesOn) steps.push({ key: "fees", title: "Set up your fees", done: (await n(db.select({ n: count() }).from(feeItems).where(eq(feeItems.tenantId, t)))) > 0, href: "/app/fees" });
  if (websiteOn) steps.push({ key: "website", title: "Design your website", done: (await n(db.select({ n: count() }).from(websiteSettings).where(eq(websiteSettings.tenantId, t)))) > 0, href: "/app/website" });
  return { steps, done: steps.filter((s) => s.done).length };
}
