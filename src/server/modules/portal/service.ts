import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  batchMemberships,
  batchSubjectInstructors,
  batchSubjects,
  batches,
  courses,
  instructors,
  scheduleSlots,
  students,
  subjects,
  tenants,
} from "../../core/db/schema";
import type { DbOrTx } from "../../core/db/types";
import { NotFoundError } from "../../core/errors";
import { WEEKDAYS, type Weekday } from "../academic/service";
import { getInstitutionProfile } from "../settings/service";

// Read models for the dashboard, the instructor and student portals (D24, D27, D60) and the public page (D58, D59).
// Every query is scoped to the institute, and the portal ones to the signed-in person's own records.

export interface ClassTime {
  weekday: Weekday;
  startsAt: string;
  endsAt: string;
}

const hhmm = (t: string) => t.slice(0, 5);
const dayIndex = (d: string) => WEEKDAYS.indexOf(d as Weekday);
const byTime = <T extends ClassTime>(a: T, b: T) => dayIndex(a.weekday) - dayIndex(b.weekday) || a.startsAt.localeCompare(b.startsAt);

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function getDashboardCounts(db: DbOrTx, tenantId: string) {
  const [studentRows, [batchRow], [instructorRow], [courseRow]] = await Promise.all([
    db.select({ status: students.status, count: sql<number>`count(*)::int` }).from(students).where(eq(students.tenantId, tenantId)).groupBy(students.status),
    db.select({ count: sql<number>`count(*)::int` }).from(batches).where(and(eq(batches.tenantId, tenantId), eq(batches.status, "ACTIVE"))),
    db.select({ count: sql<number>`count(*)::int` }).from(instructors).where(and(eq(instructors.tenantId, tenantId), eq(instructors.status, "ACTIVE"))),
    db.select({ count: sql<number>`count(*)::int` }).from(courses).where(and(eq(courses.tenantId, tenantId), eq(courses.status, "ACTIVE"))),
  ]);
  const byStatus = Object.fromEntries(studentRows.map((r) => [r.status, r.count])) as Record<string, number>;
  return {
    students: {
      total: studentRows.reduce((sum, r) => sum + r.count, 0),
      active: byStatus.ACTIVE ?? 0,
      onHold: byStatus.ON_HOLD ?? 0,
    },
    activeBatches: batchRow.count,
    activeInstructors: instructorRow.count,
    activeCourses: courseRow.count,
  };
}

// ---------------------------------------------------------------------------
// Batch subjects with their instructors' names and class times (shared by both portals)
// ---------------------------------------------------------------------------

async function subjectsOfBatches(db: DbOrTx, tenantId: string, batchIds: string[]) {
  if (!batchIds.length) return [];
  const items = await db
    .select({ id: batchSubjects.id, batchId: batchSubjects.batchId, subjectName: subjects.name })
    .from(batchSubjects)
    .innerJoin(subjects, and(eq(subjects.tenantId, batchSubjects.tenantId), eq(subjects.id, batchSubjects.subjectId)))
    .where(and(eq(batchSubjects.tenantId, tenantId), inArray(batchSubjects.batchId, batchIds)))
    .orderBy(asc(subjects.name));
  const ids = items.map((i) => i.id);
  if (!ids.length) return [];
  const [teachers, slots] = await Promise.all([
    db
      .select({ batchSubjectId: batchSubjectInstructors.batchSubjectId, fullName: instructors.fullName })
      .from(batchSubjectInstructors)
      .innerJoin(instructors, and(eq(instructors.tenantId, batchSubjectInstructors.tenantId), eq(instructors.id, batchSubjectInstructors.instructorId)))
      .where(and(eq(batchSubjectInstructors.tenantId, tenantId), inArray(batchSubjectInstructors.batchSubjectId, ids), eq(instructors.status, "ACTIVE")))
      .orderBy(asc(instructors.fullName)),
    db
      .select({ batchSubjectId: scheduleSlots.batchSubjectId, weekday: scheduleSlots.weekday, startsAt: scheduleSlots.startsAt, endsAt: scheduleSlots.endsAt })
      .from(scheduleSlots)
      .where(and(eq(scheduleSlots.tenantId, tenantId), inArray(scheduleSlots.batchSubjectId, ids))),
  ]);
  return items.map((i) => ({
    ...i,
    instructors: teachers.filter((t) => t.batchSubjectId === i.id).map((t) => t.fullName),
    slots: slots
      .filter((s) => s.batchSubjectId === i.id)
      .map((s) => ({ weekday: s.weekday, startsAt: hhmm(s.startsAt), endsAt: hhmm(s.endsAt) }))
      .sort(byTime),
  }));
}

const subjectView = (i: { subjectName: string; instructors: string[]; slots: ClassTime[] }) => ({ subjectName: i.subjectName, instructors: i.instructors, slots: i.slots });

/** A week of classes from batch subjects, ordered Saturday first (Bangladesh week). */
function weekOf(items: { subjectName: string; slots: ClassTime[]; batchName: string }[]) {
  return items.flatMap((i) => i.slots.map((s) => ({ ...s, subjectName: i.subjectName, batchName: i.batchName }))).sort(byTime);
}

// ---------------------------------------------------------------------------
// Instructor portal (D24, D60)
// ---------------------------------------------------------------------------

async function instructorOf(db: DbOrTx, tenantId: string, userId: string) {
  const [row] = await db.select({ id: instructors.id, fullName: instructors.fullName }).from(instructors).where(and(eq(instructors.tenantId, tenantId), eq(instructors.userId, userId)));
  if (!row) throw new NotFoundError("INSTRUCTOR");
  return row;
}

/** The active batches the instructor teaches at least one subject in. */
async function taughtBatchIds(db: DbOrTx, tenantId: string, instructorId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: batches.id })
    .from(batchSubjectInstructors)
    .innerJoin(batchSubjects, and(eq(batchSubjects.tenantId, batchSubjectInstructors.tenantId), eq(batchSubjects.id, batchSubjectInstructors.batchSubjectId)))
    .innerJoin(batches, and(eq(batches.tenantId, batchSubjects.tenantId), eq(batches.id, batchSubjects.batchId)))
    .where(and(eq(batchSubjectInstructors.tenantId, tenantId), eq(batchSubjectInstructors.instructorId, instructorId), eq(batches.status, "ACTIVE")));
  return rows.map((r) => r.id);
}

async function batchHeaders(db: DbOrTx, tenantId: string, batchIds: string[]) {
  if (!batchIds.length) return [];
  return db
    .select({
      id: batches.id,
      name: batches.name,
      courseName: courses.name,
      courseCode: courses.code,
      studentCount: sql<number>`(select count(*)::int from batch_memberships m where m.tenant_id = ${batches.tenantId} and m.batch_id = ${batches.id} and m.status = 'ACTIVE')`,
    })
    .from(batches)
    .innerJoin(courses, and(eq(courses.tenantId, batches.tenantId), eq(courses.id, batches.courseId)))
    .where(and(eq(batches.tenantId, tenantId), inArray(batches.id, batchIds)))
    .orderBy(asc(courses.name), asc(batches.name));
}

/** The instructor's batches (with the subjects they teach in each) and their week of classes. */
export async function getInstructorHome(db: DbOrTx, tenantId: string, userId: string) {
  const instructor = await instructorOf(db, tenantId, userId);
  const batchIds = await taughtBatchIds(db, tenantId, instructor.id);
  const [headers, items, mine] = await Promise.all([
    batchHeaders(db, tenantId, batchIds),
    subjectsOfBatches(db, tenantId, batchIds),
    db
      .select({ batchSubjectId: batchSubjectInstructors.batchSubjectId })
      .from(batchSubjectInstructors)
      .where(and(eq(batchSubjectInstructors.tenantId, tenantId), eq(batchSubjectInstructors.instructorId, instructor.id))),
  ]);
  const teaching = new Set(mine.map((m) => m.batchSubjectId));
  const myItems = items.filter((i) => teaching.has(i.id));
  const nameOf = new Map(headers.map((b) => [b.id, b.name]));
  return {
    fullName: instructor.fullName,
    batches: headers.map((b) => ({ ...b, mySubjects: myItems.filter((i) => i.batchId === b.id).map((i) => i.subjectName) })),
    week: weekOf(myItems.map((i) => ({ ...i, batchName: nameOf.get(i.batchId) ?? "" }))),
  };
}

/**
 * One of the instructor's batches: every subject with its instructors and times, and the current students with only
 * roll, ID, name, photo and school/class (D60). Any other batch is a 404, like another institute's.
 */
export async function getInstructorBatch(db: DbOrTx, tenantId: string, userId: string, batchId: string) {
  const instructor = await instructorOf(db, tenantId, userId);
  if (!(await taughtBatchIds(db, tenantId, instructor.id)).includes(batchId)) throw new NotFoundError("BATCH");
  const [[header], items, roster] = await Promise.all([
    batchHeaders(db, tenantId, [batchId]),
    subjectsOfBatches(db, tenantId, [batchId]),
    db
      .select({
        id: students.id,
        rollNumber: batchMemberships.rollNumber,
        studentCode: students.studentCode,
        fullName: students.fullName,
        photoFileId: students.photoFileId,
        schoolName: students.schoolName,
        schoolClass: students.schoolClass,
        status: students.status,
      })
      .from(batchMemberships)
      .innerJoin(students, and(eq(students.tenantId, batchMemberships.tenantId), eq(students.id, batchMemberships.studentId)))
      .where(and(eq(batchMemberships.tenantId, tenantId), eq(batchMemberships.batchId, batchId), eq(batchMemberships.status, "ACTIVE")))
      .orderBy(sql`${batchMemberships.rollNumber} is null`, sql`lpad(${batchMemberships.rollNumber}, 10, '0')`, asc(students.fullName)),
  ]);
  return { ...header, subjects: items.map(subjectView), students: roster };
}

// ---------------------------------------------------------------------------
// Student portal (D27, Core part)
// ---------------------------------------------------------------------------

/** The signed-in student's own record (no staff note), current batches with subjects, instructors and times, and past batches. */
export async function getStudentHome(db: DbOrTx, tenantId: string, userId: string) {
  const [student] = await db
    .select({
      id: students.id,
      studentCode: students.studentCode,
      fullName: students.fullName,
      gender: students.gender,
      dateOfBirth: students.dateOfBirth,
      phone: students.phone,
      schoolName: students.schoolName,
      schoolClass: students.schoolClass,
      address: students.address,
      guardianName: students.guardianName,
      guardianRelation: students.guardianRelation,
      guardianPhone: students.guardianPhone,
      photoFileId: students.photoFileId,
      admissionDate: students.admissionDate,
      status: students.status,
    })
    .from(students)
    .where(and(eq(students.tenantId, tenantId), eq(students.userId, userId)));
  if (!student) throw new NotFoundError("STUDENT");

  const memberships = await db
    .select({
      batchId: batches.id,
      batchName: batches.name,
      courseName: courses.name,
      courseCode: courses.code,
      status: batchMemberships.status,
      startedOn: batchMemberships.startedOn,
      endedOn: batchMemberships.endedOn,
      rollNumber: batchMemberships.rollNumber,
    })
    .from(batchMemberships)
    .innerJoin(batches, and(eq(batches.tenantId, batchMemberships.tenantId), eq(batches.id, batchMemberships.batchId)))
    .innerJoin(courses, and(eq(courses.tenantId, batches.tenantId), eq(courses.id, batches.courseId)))
    .where(and(eq(batchMemberships.tenantId, tenantId), eq(batchMemberships.studentId, student.id)))
    .orderBy(asc(courses.name), asc(batches.name));
  const current = memberships.filter((m) => m.status === "ACTIVE");
  const items = await subjectsOfBatches(db, tenantId, current.map((m) => m.batchId));
  const nameOf = new Map(current.map((m) => [m.batchId, m.batchName]));
  return {
    profile: student,
    batches: current.map((m) => ({
      batchId: m.batchId,
      batchName: m.batchName,
      courseName: m.courseName,
      courseCode: m.courseCode,
      startedOn: m.startedOn,
      rollNumber: m.rollNumber,
      subjects: items.filter((i) => i.batchId === m.batchId).map(subjectView),
    })),
    pastBatches: memberships
      .filter((m) => m.status !== "ACTIVE")
      .map((m) => ({ batchName: m.batchName, courseName: m.courseName, status: m.status, startedOn: m.startedOn, endedOn: m.endedOn })),
    week: weekOf(items.map((i) => ({ ...i, batchName: nameOf.get(i.batchId) ?? "" }))),
  };
}

// ---------------------------------------------------------------------------
// Public page (D58, D59)
// ---------------------------------------------------------------------------

/** Active and Suspended institutes show their public page; Pending and Deactivated don't (D58). */
export const publicPageVisible = (status: (typeof tenants.$inferSelect)["status"]) => status === "ACTIVE" || status === "SUSPENDED";

/** Profile and contact details, and each active course with its subjects and active batches' class times. No instructor names (D59). */
export async function getPublicCatalog(db: DbOrTx, tenantId: string) {
  const [profile, courseRows] = await Promise.all([
    getInstitutionProfile(db, tenantId),
    db
      .select({ id: courses.id, name: courses.name, description: courses.description })
      .from(courses)
      .where(and(eq(courses.tenantId, tenantId), eq(courses.status, "ACTIVE")))
      .orderBy(asc(courses.name)),
  ]);
  const courseIds = courseRows.map((c) => c.id);
  const [subjectRows, batchRows] = courseIds.length
    ? await Promise.all([
        db
          .select({ courseId: subjects.courseId, name: subjects.name })
          .from(subjects)
          .where(and(eq(subjects.tenantId, tenantId), inArray(subjects.courseId, courseIds), eq(subjects.status, "ACTIVE")))
          .orderBy(asc(subjects.name)),
        db
          .select({ id: batches.id, courseId: batches.courseId, name: batches.name })
          .from(batches)
          .where(and(eq(batches.tenantId, tenantId), inArray(batches.courseId, courseIds), eq(batches.status, "ACTIVE")))
          .orderBy(asc(batches.name)),
      ])
    : [[], []];
  const items = await subjectsOfBatches(db, tenantId, batchRows.map((b) => b.id));
  return {
    profile: {
      name: profile.displayName,
      shortName: profile.shortName,
      address: profile.address,
      phone: profile.phone,
      email: profile.email,
      website: profile.website,
      hasLogo: !!profile.logoFileId,
      primaryColor: profile.primaryColor,
    },
    courses: courseRows.map((c) => ({
      name: c.name,
      description: c.description,
      subjects: subjectRows.filter((s) => s.courseId === c.id).map((s) => s.name),
      batches: batchRows
        .filter((b) => b.courseId === c.id)
        .map((b) => ({
          name: b.name,
          classes: items
            .filter((i) => i.batchId === b.id)
            .flatMap((i) => i.slots.map((s) => ({ ...s, subjectName: i.subjectName })))
            .sort(byTime),
        })),
    })),
  };
}
