import { and, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";
import { attendanceClasses, attendanceMarks, leaveApplications, students, users } from "../../core/db/schema";
import { inTransaction } from "../../core/db/transaction";
import type { DbOrTx } from "../../core/db/types";
import { ConflictError, NotFoundError, ValidationError } from "../../core/errors";
import { isCalendarDate, todayInDhaka } from "@/lib/dates";
import { audit } from "../audit/service";

// Leave: a student applies or the office enters it; Owner/Admin decide; approved leave excuses the student's
// classes on those days through attendance_marks.leave_id, and revoking it puts them back as they were.

export interface Actor {
  tenantId: string;
  userId: string;
}

export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN" | "REVOKED";
export const LEAVE_STATUSES: readonly LeaveStatus[] = ["PENDING", "APPROVED", "REJECTED", "WITHDRAWN", "REVOKED"];
/** How far back a student may apply; the office may enter any date. */
export const STUDENT_DAYS_BACK = 7;

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

function cleanDates(input: { fromDate: string; toDate: string }) {
  const fromDate = input.fromDate?.trim() ?? "";
  const toDate = input.toDate?.trim() ?? "";
  if (!isCalendarDate(fromDate)) throw new ValidationError("VALIDATION_DATE", "Enter a valid start date.", { field: "fromDate" });
  if (!isCalendarDate(toDate)) throw new ValidationError("VALIDATION_DATE", "Enter a valid end date.", { field: "toDate" });
  if (toDate < fromDate) throw new ValidationError("VALIDATION_DATE_ORDER", "The last day can't be before the first.", { field: "toDate" });
  return { fromDate, toDate };
}

function cleanText(value: string | null | undefined, field: string, required: boolean, label: string) {
  const text = value?.trim() || null;
  if (required && !text) throw new ValidationError("VALIDATION_REASON_REQUIRED", `Give ${label}.`, { field });
  if (text && text.length > 300) throw new ValidationError("VALIDATION_TEXT", "Keep it to 300 characters.", { field });
  return text;
}

/** Leave decisions for one student run one at a time, so two overlapping applications can't both pass the check. */
const lockStudentLeave = (tx: DbOrTx, tenantId: string, studentId: string) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`leave:${tenantId}:${studentId}`}))`);

/** A day can be covered by only one pending or approved application, since a class is excused by one leave. */
async function assertNoOverlap(tx: DbOrTx, tenantId: string, studentId: string, fromDate: string, toDate: string, except?: string) {
  const [clash] = await tx
    .select({ id: leaveApplications.id, fromDate: leaveApplications.fromDate, toDate: leaveApplications.toDate, status: leaveApplications.status })
    .from(leaveApplications)
    .where(
      and(
        eq(leaveApplications.tenantId, tenantId),
        eq(leaveApplications.studentId, studentId),
        inArray(leaveApplications.status, ["PENDING", "APPROVED"]),
        lte(leaveApplications.fromDate, toDate),
        gte(leaveApplications.toDate, fromDate),
        except ? sql`${leaveApplications.id} <> ${except}` : undefined,
      ),
    )
    .limit(1);
  if (clash) {
    throw new ConflictError(
      "CONFLICT_LEAVE_OVERLAP",
      `There's already ${clash.status === "PENDING" ? "a pending application" : "approved leave"} covering some of these days (${clash.fromDate} to ${clash.toDate}).`,
      { leaveId: clash.id },
    );
  }
}

/** the student's classes already taken on those days become Excused through this leave. Returns how many. */
async function excuseClasses(tx: DbOrTx, tenantId: string, leave: { id: string; studentId: string; fromDate: string; toDate: string }) {
  const rows = await tx
    .update(attendanceMarks)
    .set({ leaveId: leave.id })
    .where(
      and(
        eq(attendanceMarks.tenantId, tenantId),
        eq(attendanceMarks.studentId, leave.studentId),
        isNull(attendanceMarks.leaveId),
        inArray(
          attendanceMarks.classId,
          tx
            .select({ id: attendanceClasses.id })
            .from(attendanceClasses)
            .where(and(eq(attendanceClasses.tenantId, tenantId), gte(attendanceClasses.classDate, leave.fromDate), lte(attendanceClasses.classDate, leave.toDate))),
        ),
      ),
    )
    .returning({ id: attendanceMarks.id });
  return rows.length;
}

async function studentOfUser(db: DbOrTx, tenantId: string, userId: string) {
  const [student] = await db.select({ id: students.id }).from(students).where(and(eq(students.tenantId, tenantId), eq(students.userId, userId)));
  if (!student) throw new NotFoundError("STUDENT");
  return student.id;
}

async function getLeave(tx: DbOrTx, tenantId: string, id: string, where?: SQL) {
  const [row] = await tx.select().from(leaveApplications).where(and(eq(leaveApplications.tenantId, tenantId), eq(leaveApplications.id, id), where));
  if (!row) throw new NotFoundError("LEAVE");
  return row;
}

function assertStatus(leave: { status: LeaveStatus }, wanted: LeaveStatus, message: string) {
  if (leave.status !== wanted) throw new ConflictError("CONFLICT_LEAVE_STATE", message, { status: leave.status });
}

const record = (tx: DbOrTx, actor: Actor, action: string, leaveId: string, values: { oldValue?: Record<string, unknown>; newValue?: Record<string, unknown> }) =>
  audit.record(tx, { tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action, resourceType: "LEAVE", resourceId: leaveId, ...values });

export interface LeaveRow {
  id: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  source: "STUDENT" | "OFFICE";
  status: LeaveStatus;
  appliedAt: Date;
  appliedByName: string | null;
  decidedAt: Date | null;
  decidedByName: string | null;
  decisionNote: string | null;
  revokedAt: Date | null;
  revokeReason: string | null;
}

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;

async function leaveRows(db: DbOrTx, where: SQL | undefined): Promise<LeaveRow[]> {
  const rows = await db
    .select({
      id: leaveApplications.id,
      studentId: leaveApplications.studentId,
      studentCode: students.studentCode,
      studentName: students.fullName,
      fromDate: leaveApplications.fromDate,
      toDate: leaveApplications.toDate,
      reason: leaveApplications.reason,
      source: leaveApplications.source,
      status: leaveApplications.status,
      appliedAt: leaveApplications.appliedAt,
      appliedByName: sql<string | null>`(select u.name from ${users} u where u.tenant_id = "leave_applications"."tenant_id" and u.id = "leave_applications"."applied_by")`,
      decidedAt: leaveApplications.decidedAt,
      decidedByName: sql<string | null>`(select u.name from ${users} u where u.tenant_id = "leave_applications"."tenant_id" and u.id = "leave_applications"."decided_by")`,
      decisionNote: leaveApplications.decisionNote,
      revokedAt: leaveApplications.revokedAt,
      revokeReason: leaveApplications.revokeReason,
    })
    .from(leaveApplications)
    .innerJoin(students, and(eq(students.tenantId, leaveApplications.tenantId), eq(students.id, leaveApplications.studentId)))
    .where(where)
    .orderBy(desc(leaveApplications.fromDate), desc(leaveApplications.appliedAt));
  return rows.map((r) => ({ ...r, days: days(r.fromDate, r.toDate) }));
}

/** The office's list: pending first by default; filter by status or student. */
export async function listLeave(db: DbOrTx, tenantId: string, filter: { status?: LeaveStatus; studentId?: string } = {}) {
  return leaveRows(
    db,
    and(
      eq(leaveApplications.tenantId, tenantId),
      filter.status ? eq(leaveApplications.status, filter.status) : undefined,
      filter.studentId ? eq(leaveApplications.studentId, filter.studentId) : undefined,
    ),
  );
}

/** The signed-in student's own applications. */
export async function myLeave(db: DbOrTx, tenantId: string, userId: string) {
  const studentId = await studentOfUser(db, tenantId, userId);
  const rows = await leaveRows(db, and(eq(leaveApplications.tenantId, tenantId), eq(leaveApplications.studentId, studentId)));
  // Staff names stay with the office; the student sees the decision and its note.
  const staffOnly = new Set(["appliedByName", "decidedByName"]);
  return rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !staffOnly.has(k))) as Omit<LeaveRow, "appliedByName" | "decidedByName">);
}

/** A student applies for leave: up to 7 days back or any future date. It waits for a decision. */
export async function applyForLeave(db: DbOrTx, actor: Actor, input: { fromDate: string; toDate: string; reason: string }) {
  const { fromDate, toDate } = cleanDates(input);
  const reason = cleanText(input.reason, "reason", true, "a reason")!;
  const earliest = addDays(todayInDhaka(), -STUDENT_DAYS_BACK);
  if (fromDate < earliest) throw new ValidationError("VALIDATION_LEAVE_TOO_EARLY", `You can apply for at most ${STUDENT_DAYS_BACK} days back. Ask the office for earlier days.`, { field: "fromDate" });
  return inTransaction(db, async (tx) => {
    const studentId = await studentOfUser(tx, actor.tenantId, actor.userId);
    await lockStudentLeave(tx, actor.tenantId, studentId);
    await assertNoOverlap(tx, actor.tenantId, studentId, fromDate, toDate);
    const [row] = await tx
      .insert(leaveApplications)
      .values({ tenantId: actor.tenantId, studentId, fromDate, toDate, reason, source: "STUDENT", status: "PENDING", appliedBy: actor.userId })
      .returning();
    await record(tx, actor, "LEAVE_APPLIED", row.id, { newValue: { studentId, fromDate, toDate, reason } });
    return row;
  });
}

/** A student withdraws their own pending application. Another student's is a 404. */
export async function withdrawLeave(db: DbOrTx, actor: Actor, id: string) {
  return inTransaction(db, async (tx) => {
    const studentId = await studentOfUser(tx, actor.tenantId, actor.userId);
    const leave = await getLeave(tx, actor.tenantId, id, eq(leaveApplications.studentId, studentId));
    await lockStudentLeave(tx, actor.tenantId, studentId);
    assertStatus(await getLeave(tx, actor.tenantId, id), "PENDING", "Only an application still waiting for a decision can be withdrawn.");
    await tx.update(leaveApplications).set({ status: "WITHDRAWN" }).where(and(eq(leaveApplications.tenantId, actor.tenantId), eq(leaveApplications.id, id)));
    await record(tx, actor, "LEAVE_WITHDRAWN", id, { oldValue: { status: leave.status }, newValue: { status: "WITHDRAWN" } });
  });
}

/** The office enters leave for a student, for any dates; it is approved at once and takes effect. */
export async function enterLeave(db: DbOrTx, actor: Actor, studentId: string, input: { fromDate: string; toDate: string; reason: string }) {
  const { fromDate, toDate } = cleanDates(input);
  const reason = cleanText(input.reason, "reason", true, "a reason")!;
  return inTransaction(db, async (tx) => {
    const [student] = await tx.select({ id: students.id }).from(students).where(and(eq(students.tenantId, actor.tenantId), eq(students.id, studentId)));
    if (!student) throw new NotFoundError("STUDENT");
    await lockStudentLeave(tx, actor.tenantId, studentId);
    await assertNoOverlap(tx, actor.tenantId, studentId, fromDate, toDate);
    const now = new Date();
    const [row] = await tx
      .insert(leaveApplications)
      .values({ tenantId: actor.tenantId, studentId, fromDate, toDate, reason, source: "OFFICE", status: "APPROVED", appliedBy: actor.userId, decidedBy: actor.userId, decidedAt: now })
      .returning();
    const excused = await excuseClasses(tx, actor.tenantId, row);
    await record(tx, actor, "LEAVE_ENTERED", row.id, { newValue: { studentId, fromDate, toDate, reason, classesExcused: excused } });
    return { ...row, classesExcused: excused };
  });
}

/** Owner/Admin approve or reject a pending application, with an optional note the student sees. */
export async function decideLeave(db: DbOrTx, actor: Actor, id: string, input: { decision: "APPROVE" | "REJECT"; note?: string | null }) {
  const note = cleanText(input.note, "note", false, "a note");
  return inTransaction(db, async (tx) => {
    const found = await getLeave(tx, actor.tenantId, id);
    await lockStudentLeave(tx, actor.tenantId, found.studentId);
    const leave = await getLeave(tx, actor.tenantId, id);
    assertStatus(leave, "PENDING", "This application has already been decided or withdrawn.");
    const status = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
    const [row] = await tx
      .update(leaveApplications)
      .set({ status, decidedBy: actor.userId, decidedAt: new Date(), decisionNote: note })
      .where(and(eq(leaveApplications.tenantId, actor.tenantId), eq(leaveApplications.id, id)))
      .returning();
    const excused = status === "APPROVED" ? await excuseClasses(tx, actor.tenantId, row) : 0;
    await record(tx, actor, status === "APPROVED" ? "LEAVE_APPROVED" : "LEAVE_REJECTED", id, {
      oldValue: { status: "PENDING" },
      newValue: { status, note, fromDate: row.fromDate, toDate: row.toDate, classesExcused: excused },
    });
    return { ...row, classesExcused: excused };
  });
}

/** Owner/Admin revoke approved leave with a reason; the classes it excused go back to how they were marked. */
export async function revokeLeave(db: DbOrTx, actor: Actor, id: string, input: { reason: string }) {
  const reason = cleanText(input.reason, "reason", true, "a reason")!;
  return inTransaction(db, async (tx) => {
    const found = await getLeave(tx, actor.tenantId, id);
    await lockStudentLeave(tx, actor.tenantId, found.studentId);
    const leave = await getLeave(tx, actor.tenantId, id);
    assertStatus(leave, "APPROVED", "Only approved leave can be revoked.");
    const restored = await tx
      .update(attendanceMarks)
      .set({ leaveId: null })
      .where(and(eq(attendanceMarks.tenantId, actor.tenantId), eq(attendanceMarks.leaveId, id)))
      .returning({ id: attendanceMarks.id });
    const [row] = await tx
      .update(leaveApplications)
      .set({ status: "REVOKED", revokedBy: actor.userId, revokedAt: new Date(), revokeReason: reason })
      .where(and(eq(leaveApplications.tenantId, actor.tenantId), eq(leaveApplications.id, id)))
      .returning();
    await record(tx, actor, "LEAVE_REVOKED", id, {
      oldValue: { status: "APPROVED" },
      newValue: { status: "REVOKED", reason, fromDate: row.fromDate, toDate: row.toDate, classesRestored: restored.length },
    });
    return { ...row, classesRestored: restored.length };
  });
}
