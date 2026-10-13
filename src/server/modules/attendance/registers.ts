import { and, asc, eq, gt, gte, inArray, lte, or, sql } from "drizzle-orm";
import {
  attendanceClasses,
  attendanceMarks,
  batchMemberships,
  batchSubjectInstructors,
  batchSubjects,
  batches,
  courses,
  instructors,
  leaveApplications,
  scheduleSlots,
  students,
  subjects,
} from "../../core/db/schema";
import { inTransaction } from "../../core/db/transaction";
import type { DbOrTx } from "../../core/db/types";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../core/errors";
import { isCalendarDate, todayInDhaka } from "@/lib/dates";
import { cleanTime, type Weekday } from "../academic/service";
import { audit } from "../audit/service";
import { editRule, effectiveStatus, tally, type AttendanceStatus } from "./rules";
import { routineClassesOn, routineOffReason, substitutionsOn } from "../routine/service";
import "./references";

// Class registers (D80–D86, D91): which classes are on a day, a class's register, taking and correcting it.

export interface Viewer {
  tenantId: string;
  userId: string;
  permissions: ReadonlySet<string>;
}

const STATUSES: readonly AttendanceStatus[] = ["PRESENT", "ABSENT", "LATE", "EXCUSED"];
const hhmm = (t: string) => t.slice(0, 5);

/** The weekday of a calendar date (Bangladesh week, Saturday first, as in schedules). */
export function weekdayOf(date: string): Weekday {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return (["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const)[day];
}

function cleanDate(value: string | undefined, field = "date"): string {
  const date = value?.trim() ?? "";
  if (!isCalendarDate(date)) throw new ValidationError("VALIDATION_DATE", "Enter a valid date.", { field });
  return date;
}

/**
 * The batch subjects this viewer may take or see registers for: all of them for staff who see every batch (Owner,
 * Admin, or a custom role with academic.view), otherwise only the ones they teach (D24, D81). Registers use active
 * batches only; reports (`includeArchived`) also reach archived ones, so their history stays readable.
 */
export async function scopedBatchSubjects(db: DbOrTx, viewer: Viewer, onlyIds?: string[], opts: { includeArchived?: boolean; unscoped?: boolean } = {}) {
  const all = opts.unscoped || viewer.permissions.has("attendance.manage") || viewer.permissions.has("academic.view");
  const rows = await db
    .select({
      id: batchSubjects.id,
      batchId: batches.id,
      batchName: batches.name,
      courseId: courses.id,
      courseName: courses.name,
      subjectName: subjects.name,
    })
    .from(batchSubjects)
    .innerJoin(batches, and(eq(batches.tenantId, batchSubjects.tenantId), eq(batches.id, batchSubjects.batchId)))
    .innerJoin(courses, and(eq(courses.tenantId, batches.tenantId), eq(courses.id, batches.courseId)))
    .innerJoin(subjects, and(eq(subjects.tenantId, batchSubjects.tenantId), eq(subjects.id, batchSubjects.subjectId)))
    .where(
      and(
        eq(batchSubjects.tenantId, viewer.tenantId),
        opts.includeArchived ? undefined : eq(batches.status, "ACTIVE"),
        onlyIds ? inArray(batchSubjects.id, onlyIds) : undefined,
        all
          ? undefined
          : sql`exists (select 1 from ${batchSubjectInstructors} bsi join ${instructors} i on i.tenant_id = bsi.tenant_id and i.id = bsi.instructor_id
              where bsi.tenant_id = ${viewer.tenantId} and bsi.batch_subject_id = ${batchSubjects.id} and i.user_id = ${viewer.userId})`,
      ),
    )
    .orderBy(asc(courses.name), asc(batches.name), asc(subjects.name));
  return rows;
}

/**
 * The batch subject of one class the viewer may use: one they teach (or any, for the office), or one they substitute
 * in on that date when the Routine module is on (D121). Otherwise a 404 — like another institute's (D24).
 */
async function scopedBatchSubject(db: DbOrTx, viewer: Viewer, batchSubjectId: string, at?: { date: string; startsAt: string }) {
  const [row] = await scopedBatchSubjects(db, viewer, [batchSubjectId]);
  if (row) return row;
  if (at && (await substitutionsOn(db, viewer.tenantId, viewer.userId, at.date)).some((s) => s.batchSubjectId === batchSubjectId && s.startsAt === hhmm(at.startsAt))) {
    const [sub] = await scopedBatchSubjects(db, viewer, [batchSubjectId], { unscoped: true });
    if (sub) return sub;
  }
  throw new NotFoundError("BATCH_SUBJECT");
}

export interface DayClass {
  batchSubjectId: string;
  batchId: string;
  batchName: string;
  courseName: string;
  subjectName: string;
  startsAt: string;
  endsAt: string;
  source: "SCHEDULED" | "EXTRA";
  classId: string | null;
  /** NOT_TAKEN: on the schedule but no register yet. */
  state: "NOT_TAKEN" | "OPEN" | "TAKEN" | "NOT_HELD";
  notHeldReason: string | null;
  /** What the routine changed about it, when the Routine module is on (D116, D121): moved here, or a substitute. */
  routineNote: string | null;
  counts: { present: number; absent: number; late: number; excused: number } | null;
}

/** The viewer's classes on a date: the weekly schedule's plus extra classes and any recorded ones, by time. */
export async function classesOn(db: DbOrTx, viewer: Viewer, dateInput: string): Promise<DayClass[]> {
  const date = cleanDate(dateInput);
  const own = await scopedBatchSubjects(db, viewer);
  // Classes the viewer substitutes in that day (D121): only those classes of those batch subjects.
  const subs = await substitutionsOn(db, viewer.tenantId, viewer.userId, date);
  const extraIds = [...new Set(subs.map((s) => s.batchSubjectId))].filter((id) => !own.some((o) => o.id === id));
  const scope = [...own, ...(extraIds.length ? await scopedBatchSubjects(db, viewer, extraIds, { unscoped: true }) : [])];
  if (!scope.length) return [];
  const ids = scope.map((s) => s.id);
  const byId = new Map(scope.map((s) => [s.id, s]));
  const onlySubstituted = (bsId: string, startsAt: string) => !extraIds.includes(bsId) || subs.some((s) => s.batchSubjectId === bsId && s.startsAt === hhmm(startsAt));
  // The routine's view of the day (D116), when the module is on.
  const routine = await routineClassesOn(db, viewer.tenantId, date, ids);
  const routineAt = new Map((routine ?? []).map((c) => [`${c.batchSubjectId}|${c.startsAt}`, c]));
  const [slots, recorded] = await Promise.all([
    db
      .select({ batchSubjectId: scheduleSlots.batchSubjectId, startsAt: scheduleSlots.startsAt, endsAt: scheduleSlots.endsAt })
      .from(scheduleSlots)
      .where(and(eq(scheduleSlots.tenantId, viewer.tenantId), inArray(scheduleSlots.batchSubjectId, ids), eq(scheduleSlots.weekday, weekdayOf(date)))),
    db
      .select()
      .from(attendanceClasses)
      .where(and(eq(attendanceClasses.tenantId, viewer.tenantId), inArray(attendanceClasses.batchSubjectId, ids), eq(attendanceClasses.classDate, date))),
  ]);
  const markCounts = recorded.length
    ? await db
        .select({ classId: attendanceMarks.classId, status: attendanceMarks.status, leaveId: attendanceMarks.leaveId })
        .from(attendanceMarks)
        .where(and(eq(attendanceMarks.tenantId, viewer.tenantId), inArray(attendanceMarks.classId, recorded.map((c) => c.id))))
    : [];
  const key = (bs: string, start: string) => `${bs}|${hhmm(start)}`;
  const recordedByKey = new Map(recorded.map((c) => [key(c.batchSubjectId, c.startsAt), c]));
  const out: DayClass[] = [];
  const seen = new Set<string>();
  const push = (bsId: string, startsAt: string, endsAt: string, source: "SCHEDULED" | "EXTRA") => {
    const k = key(bsId, startsAt);
    if (seen.has(k) || !onlySubstituted(bsId, startsAt)) return;
    seen.add(k);
    const bs = byId.get(bsId)!;
    const cls = recordedByKey.get(k);
    const r = routineAt.get(k);
    const off = r ? routineOffReason(r) : null;
    // A register already taken stands; otherwise a class moved away isn't on this day, and a cancelled or holiday class
    // shows as not held with the routine's reason (D116).
    if (!cls && r?.status === "MOVED_AWAY") return;
    const routineNote = r?.status === "MOVED_IN" && r.movedFrom ? `Moved from ${r.movedFrom.date}, ${r.movedFrom.startsAt}` : r?.substituteName ? `Substitute: ${r.substituteName}` : null;
    const statuses = cls ? markCounts.filter((m) => m.classId === cls.id).map(effectiveStatus) : [];
    const t = tally(statuses);
    out.push({
      batchSubjectId: bsId, batchId: bs.batchId, batchName: bs.batchName, courseName: bs.courseName, subjectName: bs.subjectName,
      startsAt: hhmm(cls?.startsAt ?? startsAt), endsAt: hhmm(cls?.endsAt ?? endsAt), source: cls?.source ?? source,
      classId: cls?.id ?? null, state: cls ? cls.state : off ? "NOT_HELD" : "NOT_TAKEN", notHeldReason: cls ? cls.notHeldReason : off,
      counts: cls?.state === "TAKEN" ? { present: t.present, absent: t.absent, late: t.late, excused: t.excused } : null,
      routineNote,
    });
  };
  for (const s of slots) push(s.batchSubjectId, s.startsAt, s.endsAt, "SCHEDULED");
  for (const r of routine ?? []) if (r.status === "MOVED_IN") push(r.batchSubjectId, r.startsAt, r.endsAt, "SCHEDULED");
  for (const c of recorded) push(c.batchSubjectId, c.startsAt, c.endsAt, c.source);
  return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.batchName.localeCompare(b.batchName) || a.subjectName.localeCompare(b.subjectName));
}

/**
 * The class on a date at a start time: a recorded one, one the routine moved here, or one from the weekly schedule,
 * else not found. `routineOff` says why a class the routine cancelled, closed or moved away can't be taken (D116).
 */
async function findClass(db: DbOrTx, tenantId: string, batchSubjectId: string, date: string, startsAt: string) {
  const [recorded] = await db
    .select()
    .from(attendanceClasses)
    .where(and(eq(attendanceClasses.tenantId, tenantId), eq(attendanceClasses.batchSubjectId, batchSubjectId), eq(attendanceClasses.classDate, date), eq(attendanceClasses.startsAt, startsAt)));
  if (recorded) return { recorded, endsAt: recorded.endsAt, source: recorded.source, routineOff: null };
  const routine = await routineClassesOn(db, tenantId, date, [batchSubjectId]);
  const r = routine?.find((c) => c.startsAt === hhmm(startsAt));
  if (r?.status === "MOVED_IN") return { recorded: null, endsAt: r.endsAt, source: "SCHEDULED" as const, routineOff: null };
  const [slot] = await db
    .select({ endsAt: scheduleSlots.endsAt })
    .from(scheduleSlots)
    .where(and(eq(scheduleSlots.tenantId, tenantId), eq(scheduleSlots.batchSubjectId, batchSubjectId), eq(scheduleSlots.weekday, weekdayOf(date)), eq(scheduleSlots.startsAt, startsAt)));
  if (!slot) throw new NotFoundError("ATTENDANCE_CLASS", "There's no class of this subject at that time on that day.");
  return { recorded: null, endsAt: slot.endsAt, source: "SCHEDULED" as const, routineOff: r ? routineOffReason(r) : null };
}

const assertNotRoutineOff = (cls: { routineOff: string | null }) => {
  if (cls.routineOff) throw new ConflictError("CONFLICT_ROUTINE_CHANGED", `${cls.routineOff}. Its register can't be taken; undo the routine change first if the class did happen.`);
};

/**
 * Members of the batch on the date: joined by then and either still active (and the student Active, so On Hold is
 * left off — D26) or ended after that day, so a past register an Admin takes late still lists who was there.
 */
async function eligibleMembers(db: DbOrTx, tenantId: string, batchId: string, date: string) {
  return db
    .select({
      membershipId: batchMemberships.id,
      studentId: students.id,
      studentCode: students.studentCode,
      fullName: students.fullName,
      photoFileId: students.photoFileId,
      rollNumber: batchMemberships.rollNumber,
    })
    .from(batchMemberships)
    .innerJoin(students, and(eq(students.tenantId, batchMemberships.tenantId), eq(students.id, batchMemberships.studentId)))
    .where(
      and(
        eq(batchMemberships.tenantId, tenantId),
        eq(batchMemberships.batchId, batchId),
        lte(batchMemberships.startedOn, date),
        or(and(eq(batchMemberships.status, "ACTIVE"), eq(students.status, "ACTIVE")), gt(batchMemberships.endedOn, date)),
      ),
    );
}

/** Approved leave covering the date, per student (D91). */
async function leaveOn(db: DbOrTx, tenantId: string, studentIds: string[], date: string) {
  if (!studentIds.length) return new Map<string, string>();
  const rows = await db
    .select({ id: leaveApplications.id, studentId: leaveApplications.studentId })
    .from(leaveApplications)
    .where(
      and(
        eq(leaveApplications.tenantId, tenantId),
        inArray(leaveApplications.studentId, studentIds),
        eq(leaveApplications.status, "APPROVED"),
        lte(leaveApplications.fromDate, date),
        gte(leaveApplications.toDate, date),
      ),
    );
  return new Map(rows.map((r) => [r.studentId, r.id]));
}

export interface RegisterRow {
  studentId: string;
  membershipId: string;
  studentCode: string;
  fullName: string;
  photoFileId: string | null;
  rollNumber: string | null;
  /** What a person marked; on a register not yet taken, the default it starts with (D83). */
  status: AttendanceStatus | null;
  onLeave: boolean;
  effective: AttendanceStatus | null;
}

/** A class's register: who is on it and how they're marked, and whether the viewer may change it now (D82, D84). */
export async function getRegister(db: DbOrTx, viewer: Viewer, input: { batchSubjectId: string; date: string; startsAt: string }) {
  const date = cleanDate(input.date);
  const startsAt = cleanTime(input.startsAt, "startsAt");
  const bs = await scopedBatchSubject(db, viewer, input.batchSubjectId, { date, startsAt });
  const cls = await findClass(db, viewer.tenantId, bs.id, date, startsAt);
  const members = await eligibleMembers(db, viewer.tenantId, bs.batchId, date);
  const marks = cls.recorded
    ? await db
        .select({
          studentId: attendanceMarks.studentId,
          membershipId: attendanceMarks.membershipId,
          status: attendanceMarks.status,
          leaveId: attendanceMarks.leaveId,
          studentCode: students.studentCode,
          fullName: students.fullName,
          photoFileId: students.photoFileId,
          rollNumber: batchMemberships.rollNumber,
        })
        .from(attendanceMarks)
        .innerJoin(students, and(eq(students.tenantId, attendanceMarks.tenantId), eq(students.id, attendanceMarks.studentId)))
        .innerJoin(batchMemberships, and(eq(batchMemberships.tenantId, attendanceMarks.tenantId), eq(batchMemberships.id, attendanceMarks.membershipId)))
        .where(and(eq(attendanceMarks.tenantId, viewer.tenantId), eq(attendanceMarks.classId, cls.recorded.id)))
    : [];
  const leave = await leaveOn(db, viewer.tenantId, members.map((m) => m.studentId), date);
  const marked = new Map(marks.map((m) => [m.studentId, m]));
  const rows: RegisterRow[] = [];
  for (const m of members) {
    const mark = marked.get(m.studentId);
    const leaveId = mark ? mark.leaveId : (leave.get(m.studentId) ?? null);
    // Not marked yet: everyone starts Present (D83); on leave they show as Excused through the leave (D91).
    const status = mark ? mark.status : leaveId ? null : "PRESENT";
    rows.push({ ...m, status, onLeave: !!leaveId, effective: effectiveStatus({ status, leaveId }) });
  }
  // Students marked before who are no longer members (left later) stay on their old register.
  for (const m of marks) {
    if (members.some((x) => x.studentId === m.studentId)) continue;
    rows.push({ ...m, onLeave: !!m.leaveId, effective: effectiveStatus(m) });
  }
  rows.sort((a, b) => Number(a.rollNumber === null) - Number(b.rollNumber === null) || (a.rollNumber ?? "").localeCompare(b.rollNumber ?? "", undefined, { numeric: true }) || a.fullName.localeCompare(b.fullName));
  const rule = editRule(date, todayInDhaka(), viewer.permissions.has("attendance.manage"));
  return {
    batchSubjectId: bs.id, batchName: bs.batchName, courseName: bs.courseName, subjectName: bs.subjectName,
    date, startsAt: hhmm(startsAt), endsAt: hhmm(cls.endsAt), source: cls.source,
    classId: cls.recorded?.id ?? null,
    state: cls.recorded?.state ?? (cls.routineOff ? ("NOT_HELD" as const) : ("NOT_TAKEN" as const)),
    notHeldReason: cls.recorded?.notHeldReason ?? cls.routineOff,
    canEdit: !cls.routineOff && rule.allowed && viewer.permissions.has("attendance.take"),
    reasonRequired: rule.reasonRequired,
    whyNot: cls.routineOff ? `${cls.routineOff}. Undo the routine change if the class did happen.` : rule.allowed ? null : rule.why,
    rows,
  };
}

function reasonFor(rule: ReturnType<typeof editRule>, reason: string | null | undefined): string | null {
  const r = reason?.trim() || null;
  if (r && r.length > 300) throw new ValidationError("VALIDATION_TEXT", "The reason can be at most 300 characters.", { field: "reason" });
  if (rule.reasonRequired && !r) throw new ValidationError("VALIDATION_REASON_REQUIRED", "Give a reason for changing a past day's register.", { field: "reason" });
  return r;
}

function assertEditable(viewer: Viewer, date: string) {
  if (!viewer.permissions.has("attendance.take")) throw new ForbiddenError();
  const rule = editRule(date, todayInDhaka(), viewer.permissions.has("attendance.manage"));
  if (!rule.allowed) throw new ConflictError("CONFLICT_REGISTER_LOCKED", rule.why ?? "This register can't be changed.");
  return rule;
}

async function upsertClass(tx: DbOrTx, viewer: Viewer, bsId: string, date: string, startsAt: string, endsAt: string, source: "SCHEDULED" | "EXTRA", existingId: string | null) {
  if (existingId) return existingId;
  const [row] = await tx
    .insert(attendanceClasses)
    .values({ tenantId: viewer.tenantId, batchSubjectId: bsId, source, classDate: date, startsAt, endsAt, state: "OPEN", createdBy: viewer.userId })
    .onConflictDoNothing()
    .returning({ id: attendanceClasses.id });
  if (row) return row.id;
  const [again] = await tx
    .select({ id: attendanceClasses.id })
    .from(attendanceClasses)
    .where(and(eq(attendanceClasses.tenantId, viewer.tenantId), eq(attendanceClasses.batchSubjectId, bsId), eq(attendanceClasses.classDate, date), eq(attendanceClasses.startsAt, startsAt)));
  return again.id;
}

/**
 * Saves a register: every listed student's status. The first save takes it; later saves are corrections, audited with
 * each change (after the class day: Owner/Admin only, with a reason — D82, D84). A not-held class becomes taken.
 */
export async function saveRegister(
  db: DbOrTx,
  viewer: Viewer,
  input: { batchSubjectId: string; date: string; startsAt: string; marks: { studentId: string; status: AttendanceStatus }[]; reason?: string | null },
) {
  const date = cleanDate(input.date);
  const startsAt = cleanTime(input.startsAt, "startsAt");
  const rule = assertEditable(viewer, date);
  const reason = reasonFor(rule, input.reason);
  for (const m of input.marks) if (!STATUSES.includes(m.status)) throw new ValidationError("VALIDATION_STATUS", "Choose Present, Absent, Late or Excused.", { field: "marks" });

  return inTransaction(db, async (tx) => {
    const bs = await scopedBatchSubject(tx, viewer, input.batchSubjectId, { date, startsAt });
    const cls = await findClass(tx, viewer.tenantId, bs.id, date, startsAt);
    assertNotRoutineOff(cls);
    const classId = await upsertClass(tx, viewer, bs.id, date, startsAt, cls.endsAt, cls.source, cls.recorded?.id ?? null);
    await tx.execute(sql`select id from attendance_classes where tenant_id = ${viewer.tenantId} and id = ${classId} for update`);

    const existing = await tx.select().from(attendanceMarks).where(and(eq(attendanceMarks.tenantId, viewer.tenantId), eq(attendanceMarks.classId, classId)));
    const members = await eligibleMembers(tx, viewer.tenantId, bs.batchId, date);
    const leave = await leaveOn(tx, viewer.tenantId, members.map((m) => m.studentId), date);
    const wasTaken = existing.length > 0;
    const changes: { student: string; from: AttendanceStatus | null; to: AttendanceStatus }[] = [];

    for (const m of input.marks) {
      const mark = existing.find((e) => e.studentId === m.studentId);
      if (mark) {
        if (mark.status === m.status) continue;
        await tx
          .update(attendanceMarks)
          .set({ status: m.status, markedAt: new Date(), markedBy: viewer.userId })
          .where(and(eq(attendanceMarks.tenantId, viewer.tenantId), eq(attendanceMarks.id, mark.id)));
        changes.push({ student: m.studentId, from: mark.status, to: m.status });
        continue;
      }
      const member = members.find((x) => x.studentId === m.studentId);
      if (!member) throw new ValidationError("VALIDATION_NOT_ON_REGISTER", "A student in this register isn't a current member of the batch.", { field: "marks", studentId: m.studentId });
      await tx.insert(attendanceMarks).values({
        tenantId: viewer.tenantId, classId, studentId: m.studentId, membershipId: member.membershipId, status: m.status,
        leaveId: leave.get(m.studentId) ?? null, markedAt: new Date(), markedBy: viewer.userId,
      });
      if (wasTaken) changes.push({ student: m.studentId, from: null, to: m.status });
    }
    // Members not sent (e.g. the page was opened before they joined) still get a row, as on leave or Present (D83).
    for (const member of members) {
      if (existing.some((e) => e.studentId === member.studentId) || input.marks.some((m) => m.studentId === member.studentId)) continue;
      const leaveId = leave.get(member.studentId) ?? null;
      await tx.insert(attendanceMarks).values({
        tenantId: viewer.tenantId, classId, studentId: member.studentId, membershipId: member.membershipId, status: leaveId ? null : "PRESENT",
        leaveId, markedAt: new Date(), markedBy: viewer.userId,
      });
    }
    await tx
      .update(attendanceClasses)
      .set({ state: "TAKEN", notHeldReason: null, takenAt: new Date(), takenBy: viewer.userId, updatedAt: new Date() })
      .where(and(eq(attendanceClasses.tenantId, viewer.tenantId), eq(attendanceClasses.id, classId)));

    const after = await tx.select({ status: attendanceMarks.status, leaveId: attendanceMarks.leaveId }).from(attendanceMarks).where(and(eq(attendanceMarks.tenantId, viewer.tenantId), eq(attendanceMarks.classId, classId)));
    const t = tally(after.map(effectiveStatus));
    const what = { classId, batch: bs.batchName, subject: bs.subjectName, date, startsAt: hhmm(startsAt) };
    if (!wasTaken || cls.recorded?.state !== "TAKEN") {
      await audit.record(tx, {
        tenantId: viewer.tenantId, actorType: "TENANT_USER", userId: viewer.userId, action: "ATTENDANCE_TAKEN", resourceType: "ATTENDANCE_CLASS", resourceId: classId,
        newValue: { ...what, present: t.present, absent: t.absent, late: t.late, excused: t.excused, reason },
      });
    } else if (changes.length) {
      await audit.record(tx, {
        tenantId: viewer.tenantId, actorType: "TENANT_USER", userId: viewer.userId, action: "ATTENDANCE_CORRECTED", resourceType: "ATTENDANCE_CLASS", resourceId: classId,
        oldValue: { changes: changes.map((c) => ({ studentId: c.student, status: c.from })) },
        newValue: { ...what, changes: changes.map((c) => ({ studentId: c.student, status: c.to })), reason },
      });
    }
    return getRegister(tx, viewer, { batchSubjectId: bs.id, date, startsAt: hhmm(startsAt) });
  });
}

/** Records that a class didn't happen, with a reason (D86); it then counts for nobody. */
export async function markNotHeld(db: DbOrTx, viewer: Viewer, input: { batchSubjectId: string; date: string; startsAt: string; reason: string }) {
  const date = cleanDate(input.date);
  const startsAt = cleanTime(input.startsAt, "startsAt");
  assertEditable(viewer, date);
  const reason = input.reason?.trim();
  if (!reason) throw new ValidationError("VALIDATION_REASON_REQUIRED", "Give a reason, e.g. 'Instructor ill' or 'Holiday'.", { field: "reason" });
  if (reason.length > 300) throw new ValidationError("VALIDATION_TEXT", "The reason can be at most 300 characters.", { field: "reason" });
  return inTransaction(db, async (tx) => {
    const bs = await scopedBatchSubject(tx, viewer, input.batchSubjectId, { date, startsAt });
    const cls = await findClass(tx, viewer.tenantId, bs.id, date, startsAt);
    assertNotRoutineOff(cls);
    const classId = await upsertClass(tx, viewer, bs.id, date, startsAt, cls.endsAt, cls.source, cls.recorded?.id ?? null);
    await tx
      .update(attendanceClasses)
      .set({ state: "NOT_HELD", notHeldReason: reason, takenAt: new Date(), takenBy: viewer.userId, updatedAt: new Date() })
      .where(and(eq(attendanceClasses.tenantId, viewer.tenantId), eq(attendanceClasses.id, classId)));
    await audit.record(tx, {
      tenantId: viewer.tenantId, actorType: "TENANT_USER", userId: viewer.userId, action: "ATTENDANCE_CLASS_NOT_HELD", resourceType: "ATTENDANCE_CLASS", resourceId: classId,
      oldValue: cls.recorded ? { state: cls.recorded.state } : null,
      newValue: { batch: bs.batchName, subject: bs.subjectName, date, startsAt: hhmm(startsAt), reason },
    });
    return getRegister(tx, viewer, { batchSubjectId: bs.id, date, startsAt: hhmm(startsAt) });
  });
}

/** Adds a one-off class for a batch subject (D85); its register is then taken like any other. */
export async function addExtraClass(db: DbOrTx, viewer: Viewer, input: { batchSubjectId: string; date: string; startsAt: string; endsAt: string }) {
  if (!viewer.permissions.has("attendance.take")) throw new ForbiddenError();
  const date = cleanDate(input.date);
  const startsAt = cleanTime(input.startsAt, "startsAt");
  const endsAt = cleanTime(input.endsAt, "endsAt");
  if (startsAt >= endsAt) throw new ValidationError("VALIDATION_TIME_ORDER", "The class must end after it starts.", { field: "endsAt" });
  return inTransaction(db, async (tx) => {
    const bs = await scopedBatchSubject(tx, viewer, input.batchSubjectId);
    const clash = await findClass(tx, viewer.tenantId, bs.id, date, startsAt).catch(() => null);
    if (clash) throw new ConflictError("CONFLICT_CLASS_EXISTS", "This subject already has a class starting then on that day.", { field: "startsAt" });
    const [row] = await tx
      .insert(attendanceClasses)
      .values({ tenantId: viewer.tenantId, batchSubjectId: bs.id, source: "EXTRA", classDate: date, startsAt, endsAt, state: "OPEN", createdBy: viewer.userId })
      .returning();
    await audit.record(tx, {
      tenantId: viewer.tenantId, actorType: "TENANT_USER", userId: viewer.userId, action: "ATTENDANCE_EXTRA_CLASS_ADDED", resourceType: "ATTENDANCE_CLASS", resourceId: row.id,
      newValue: { batch: bs.batchName, subject: bs.subjectName, date, startsAt: hhmm(startsAt), endsAt: hhmm(endsAt) },
    });
    return { id: row.id, date, startsAt: hhmm(startsAt), endsAt: hhmm(endsAt) };
  });
}


/** The batch subjects the viewer can take registers for, e.g. to add an extra class. */
export async function registerSubjects(db: DbOrTx, viewer: Viewer) {
  return scopedBatchSubjects(db, viewer);
}
