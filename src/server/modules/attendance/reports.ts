import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { attendanceClasses, attendanceMarks, batchMemberships, batchSubjects, batches, students, subjects } from "../../core/db/schema";
import type { DbOrTx } from "../../core/db/types";
import { NotFoundError, ValidationError } from "../../core/errors";
import { isCalendarDate, todayInDhaka } from "@/lib/dates";
import { effectiveStatus, tally, type AttendanceStatus, type AttendanceTally } from "./rules";
import { scopedBatchSubjects, type Viewer } from "./registers";

// Attendance reports and the student's own attendance. Only taken classes count; classes not held
// count for nobody. Reports follow the register scope: the office sees every batch subject, an instructor the
// ones they teach. Guardian mobiles appear only with students.contact.view.

const hhmm = (t: string) => t.slice(0, 5);
const MAX_RANGE_DAYS = 366;

export interface DateRange {
  from: string;
  to: string;
}

export function cleanRange(from: string | undefined, to: string | undefined): DateRange {
  if (!from || !isCalendarDate(from)) throw new ValidationError("VALIDATION_DATE", "Enter a valid start date.", { field: "from" });
  if (!to || !isCalendarDate(to)) throw new ValidationError("VALIDATION_DATE", "Enter a valid end date.", { field: "to" });
  if (to < from) throw new ValidationError("VALIDATION_DATE_ORDER", "The end date can't be before the start date.", { field: "to" });
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 >= MAX_RANGE_DAYS) throw new ValidationError("VALIDATION_DATE_RANGE", "Choose at most a year.", { field: "to" });
  return { from, to };
}

/** "2026-10" → its first and last day and a label. */
export function monthRange(month: string | undefined): DateRange & { month: string; label: string } {
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new ValidationError("VALIDATION_MONTH", "Choose a month.", { field: "month" });
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return { month, from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}`, label };
}

/** Taken classes' marks for the given batch subjects in a date range, with the student and class. */
async function marksIn(db: DbOrTx, tenantId: string, batchSubjectIds: string[], range: DateRange, studentIds?: string[]) {
  if (!batchSubjectIds.length) return [];
  return db
    .select({
      studentId: attendanceMarks.studentId,
      status: attendanceMarks.status,
      leaveId: attendanceMarks.leaveId,
      classId: attendanceClasses.id,
      batchSubjectId: attendanceClasses.batchSubjectId,
      classDate: attendanceClasses.classDate,
      startsAt: attendanceClasses.startsAt,
    })
    .from(attendanceMarks)
    .innerJoin(attendanceClasses, and(eq(attendanceClasses.tenantId, attendanceMarks.tenantId), eq(attendanceClasses.id, attendanceMarks.classId)))
    .where(
      and(
        eq(attendanceMarks.tenantId, tenantId),
        eq(attendanceClasses.state, "TAKEN"),
        inArray(attendanceClasses.batchSubjectId, batchSubjectIds),
        gte(attendanceClasses.classDate, range.from),
        lte(attendanceClasses.classDate, range.to),
        studentIds ? inArray(attendanceMarks.studentId, studentIds) : undefined,
      ),
    )
    .orderBy(asc(attendanceClasses.classDate), asc(attendanceClasses.startsAt));
}

async function studentsById(db: DbOrTx, tenantId: string, ids: string[]) {
  if (!ids.length) return new Map<string, { id: string; studentCode: string; fullName: string; guardianName: string; guardianPhone: string }>();
  const rows = await db
    .select({ id: students.id, studentCode: students.studentCode, fullName: students.fullName, guardianName: students.guardianName, guardianPhone: students.guardianPhone })
    .from(students)
    .where(and(eq(students.tenantId, tenantId), inArray(students.id, ids)));
  return new Map(rows.map((r) => [r.id, r]));
}

/** The batches and subjects the viewer can report on, for the report filters. */
export async function reportOptions(db: DbOrTx, viewer: Viewer) {
  const scope = await scopedBatchSubjects(db, viewer, undefined, { includeArchived: true });
  const batchMap = new Map<string, { id: string; name: string; courseId: string; courseName: string; subjects: { id: string; name: string }[] }>();
  for (const s of scope) {
    const b = batchMap.get(s.batchId) ?? { id: s.batchId, name: s.batchName, courseId: s.courseId, courseName: s.courseName, subjects: [] };
    b.subjects.push({ id: s.id, name: s.subjectName });
    batchMap.set(s.batchId, b);
  }
  const list = [...batchMap.values()];
  const courses = [...new Map(list.map((b) => [b.courseId, { id: b.courseId, name: b.courseName }])).values()];
  return { courses, batches: list, today: todayInDhaka() };
}

/**
 * A batch's register for a month: one column per taken class (date, time, subject), one row per student who was
 * on any of them or is a current member, each cell the effective status, and each student's totals and percentage.
 */
export async function monthlyRegister(db: DbOrTx, viewer: Viewer, input: { batchId: string; month: string; batchSubjectId?: string | null }) {
  const range = monthRange(input.month);
  const scope = (await scopedBatchSubjects(db, viewer, undefined, { includeArchived: true })).filter((s) => s.batchId === input.batchId);
  if (!scope.length) throw new NotFoundError("BATCH");
  const chosen = input.batchSubjectId ? scope.filter((s) => s.id === input.batchSubjectId) : scope;
  if (!chosen.length) throw new NotFoundError("BATCH_SUBJECT");
  const subjectName = new Map(chosen.map((s) => [s.id, s.subjectName]));

  const classes = await db
    .select({ id: attendanceClasses.id, batchSubjectId: attendanceClasses.batchSubjectId, classDate: attendanceClasses.classDate, startsAt: attendanceClasses.startsAt, state: attendanceClasses.state })
    .from(attendanceClasses)
    .where(
      and(
        eq(attendanceClasses.tenantId, viewer.tenantId),
        inArray(attendanceClasses.batchSubjectId, chosen.map((s) => s.id)),
        gte(attendanceClasses.classDate, range.from),
        lte(attendanceClasses.classDate, range.to),
        inArray(attendanceClasses.state, ["TAKEN", "NOT_HELD"]),
      ),
    )
    .orderBy(asc(attendanceClasses.classDate), asc(attendanceClasses.startsAt));
  const taken = classes.filter((c) => c.state === "TAKEN");
  const marks = await marksIn(db, viewer.tenantId, chosen.map((s) => s.id), range);
  const members = await db
    .select({ studentId: batchMemberships.studentId, rollNumber: batchMemberships.rollNumber })
    .from(batchMemberships)
    .where(and(eq(batchMemberships.tenantId, viewer.tenantId), eq(batchMemberships.batchId, input.batchId), lte(batchMemberships.startedOn, range.to), sql`(${batchMemberships.endedOn} is null or ${batchMemberships.endedOn} >= ${range.from})`));
  const roll = new Map(members.map((m) => [m.studentId, m.rollNumber]));
  const ids = [...new Set([...members.map((m) => m.studentId), ...marks.map((m) => m.studentId)])];
  const people = await studentsById(db, viewer.tenantId, ids);

  const cell = new Map(marks.map((m) => [`${m.studentId}|${m.classId}`, effectiveStatus(m)]));
  const rows = ids
    .map((id) => {
      const p = people.get(id)!;
      const statuses = taken.map((c) => cell.get(`${id}|${c.id}`) ?? null);
      return { studentId: id, studentCode: p.studentCode, fullName: p.fullName, rollNumber: roll.get(id) ?? null, statuses, ...tally(statuses) };
    })
    .sort((a, b) => Number(a.rollNumber === null) - Number(b.rollNumber === null) || (a.rollNumber ?? "").localeCompare(b.rollNumber ?? "", undefined, { numeric: true }) || a.fullName.localeCompare(b.fullName));
  const [batch] = await db.select({ name: batches.name }).from(batches).where(and(eq(batches.tenantId, viewer.tenantId), eq(batches.id, input.batchId)));

  return {
    batchId: input.batchId,
    batchName: batch.name,
    courseName: chosen[0].courseName,
    subjectName: input.batchSubjectId ? chosen[0].subjectName : null,
    month: range.month,
    monthLabel: range.label,
    classes: taken.map((c) => ({ id: c.id, date: c.classDate, startsAt: hhmm(c.startsAt), subjectName: subjectName.get(c.batchSubjectId)! })),
    notHeld: classes.filter((c) => c.state === "NOT_HELD").length,
    rows,
  };
}

/** Students below a percentage over a date range, lowest first. Guardian mobiles only with contact access. */
export async function lowAttendance(
  db: DbOrTx,
  viewer: Viewer,
  input: { range: DateRange; below: number; courseId?: string; batchId?: string },
) {
  if (!Number.isFinite(input.below) || input.below <= 0 || input.below > 100) throw new ValidationError("VALIDATION_PERCENT", "Enter a percentage between 1 and 100.", { field: "below" });
  const scope = (await scopedBatchSubjects(db, viewer, undefined, { includeArchived: true })).filter(
    (s) => (!input.courseId || s.courseId === input.courseId) && (!input.batchId || s.batchId === input.batchId),
  );
  const marks = await marksIn(db, viewer.tenantId, scope.map((s) => s.id), input.range);
  const byStudent = new Map<string, (AttendanceStatus | null)[]>();
  for (const m of marks) byStudent.set(m.studentId, [...(byStudent.get(m.studentId) ?? []), effectiveStatus(m)]);
  const below = [...byStudent.entries()].map(([id, statuses]) => ({ id, t: tally(statuses) })).filter((x) => x.t.percentage !== null && x.t.percentage < input.below);
  const people = await studentsById(db, viewer.tenantId, below.map((x) => x.id));
  const contacts = viewer.permissions.has("students.contact.view");
  return {
    range: input.range,
    below: input.below,
    rows: below
      .map(({ id, t }) => {
        const p = people.get(id)!;
        return { studentId: id, studentCode: p.studentCode, fullName: p.fullName, guardianName: p.guardianName, guardianPhone: contacts ? p.guardianPhone : null, ...t };
      })
      .sort((a, b) => a.percentage! - b.percentage! || a.fullName.localeCompare(b.fullName)),
  };
}

/** Who was absent on a day: each student with the classes they missed. Excused (leave) isn't absent. */
export async function dailyAbsentees(db: DbOrTx, viewer: Viewer, input: { date: string; batchId?: string }) {
  if (!isCalendarDate(input.date)) throw new ValidationError("VALIDATION_DATE", "Enter a valid date.", { field: "date" });
  const scope = (await scopedBatchSubjects(db, viewer, undefined, { includeArchived: true })).filter((s) => !input.batchId || s.batchId === input.batchId);
  const byId = new Map(scope.map((s) => [s.id, s]));
  const marks = (await marksIn(db, viewer.tenantId, scope.map((s) => s.id), { from: input.date, to: input.date })).filter((m) => effectiveStatus(m) === "ABSENT");
  const people = await studentsById(db, viewer.tenantId, [...new Set(marks.map((m) => m.studentId))]);
  const contacts = viewer.permissions.has("students.contact.view");
  const rows = new Map<string, { studentId: string; studentCode: string; fullName: string; guardianName: string; guardianPhone: string | null; missed: { batchName: string; subjectName: string; startsAt: string }[] }>();
  for (const m of marks) {
    const p = people.get(m.studentId)!;
    const row = rows.get(m.studentId) ?? { studentId: p.id, studentCode: p.studentCode, fullName: p.fullName, guardianName: p.guardianName, guardianPhone: contacts ? p.guardianPhone : null, missed: [] };
    const bs = byId.get(m.batchSubjectId)!;
    row.missed.push({ batchName: bs.batchName, subjectName: bs.subjectName, startsAt: hhmm(m.startsAt) });
    rows.set(m.studentId, row);
  }
  return { date: input.date, rows: [...rows.values()].sort((a, b) => a.fullName.localeCompare(b.fullName)) };
}

interface HistoryEntry {
  date: string;
  startsAt: string;
  batchName: string;
  subjectName: string;
  status: AttendanceStatus | null;
  onLeave: boolean;
}

function summarise(entries: HistoryEntry[]) {
  const subjectsMap = new Map<string, { batchName: string; subjectName: string; statuses: (AttendanceStatus | null)[] }>();
  for (const e of entries) {
    const k = `${e.batchName}|${e.subjectName}`;
    const s = subjectsMap.get(k) ?? { batchName: e.batchName, subjectName: e.subjectName, statuses: [] };
    s.statuses.push(e.status);
    subjectsMap.set(k, s);
  }
  return {
    overall: tally(entries.map((e) => e.status)),
    bySubject: [...subjectsMap.values()].map((s) => ({ batchName: s.batchName, subjectName: s.subjectName, ...tally(s.statuses) })) as ({ batchName: string; subjectName: string } & AttendanceTally)[],
  };
}

/** A student's classes in a range, newest first, with totals overall and per subject. */
async function historyOf(db: DbOrTx, tenantId: string, studentId: string, scope: Awaited<ReturnType<typeof scopedBatchSubjects>>, range: DateRange) {
  const byId = new Map(scope.map((s) => [s.id, s]));
  const marks = await marksIn(db, tenantId, scope.map((s) => s.id), range, [studentId]);
  const entries: HistoryEntry[] = marks
    .map((m) => ({ date: m.classDate, startsAt: hhmm(m.startsAt), batchName: byId.get(m.batchSubjectId)!.batchName, subjectName: byId.get(m.batchSubjectId)!.subjectName, status: effectiveStatus(m), onLeave: !!m.leaveId }));
  // Subjects in the order they were first taught; the class list newest first.
  return { range, ...summarise(entries), entries: entries.reverse() };
}

/** Staff view of one student's attendance. An instructor sees only the subjects they teach; any other student is a 404. */
export async function studentHistory(db: DbOrTx, viewer: Viewer, studentId: string, range: DateRange) {
  const [student] = await db.select({ id: students.id }).from(students).where(and(eq(students.tenantId, viewer.tenantId), eq(students.id, studentId)));
  if (!student) throw new NotFoundError("STUDENT");
  let scope = await scopedBatchSubjects(db, viewer, undefined, { includeArchived: true });
  const all = viewer.permissions.has("attendance.manage") || viewer.permissions.has("academic.view");
  if (!all) {
    const theirs = await db
      .select({ batchId: batchMemberships.batchId })
      .from(batchMemberships)
      .where(and(eq(batchMemberships.tenantId, viewer.tenantId), eq(batchMemberships.studentId, studentId)));
    const batchIds = new Set(theirs.map((t) => t.batchId));
    scope = scope.filter((s) => batchIds.has(s.batchId));
    if (!scope.length) throw new NotFoundError("STUDENT");
  }
  return historyOf(db, viewer.tenantId, studentId, scope, range);
}

/** The signed-in student's own attendance: every batch subject they belong or belonged to, all their history. */
export async function myAttendance(db: DbOrTx, tenantId: string, userId: string, range?: DateRange) {
  const [student] = await db.select({ id: students.id }).from(students).where(and(eq(students.tenantId, tenantId), eq(students.userId, userId)));
  if (!student) throw new NotFoundError("STUDENT");
  const scope = await db
    .select({ id: batchSubjects.id, batchId: batches.id, batchName: batches.name, courseId: batches.courseId, courseName: sql<string>`''`, subjectName: subjects.name })
    .from(batchSubjects)
    .innerJoin(batches, and(eq(batches.tenantId, batchSubjects.tenantId), eq(batches.id, batchSubjects.batchId)))
    .innerJoin(subjects, and(eq(subjects.tenantId, batchSubjects.tenantId), eq(subjects.id, batchSubjects.subjectId)))
    .where(
      and(
        eq(batchSubjects.tenantId, tenantId),
        inArray(batchSubjects.batchId, db.select({ id: batchMemberships.batchId }).from(batchMemberships).where(and(eq(batchMemberships.tenantId, tenantId), eq(batchMemberships.studentId, student.id)))),
      ),
    );
  const today = todayInDhaka();
  return historyOf(db, tenantId, student.id, scope, range ?? { from: "2000-01-01", to: today });
}
