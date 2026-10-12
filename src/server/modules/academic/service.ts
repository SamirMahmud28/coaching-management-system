import { and, asc, eq, gt, inArray, lt, ne, or, sql } from "drizzle-orm";
import { batchSubjectInstructors, batchSubjects, batches, courses, instructors, scheduleSlots, subjects } from "../../core/db/schema";
import { getInTenant } from "../../core/db/tenant-scope";
import { inTransaction } from "../../core/db/transaction";
import type { DbOrTx } from "../../core/db/types";
import { ConflictError, InUseError, ValidationError, mapDatabaseError } from "../../core/errors";
import { audit } from "../audit/service";
import { academicReferences } from "./references";

export interface Actor {
  tenantId: string;
  userId: string;
}

export type AcademicStatus = "ACTIVE" | "ARCHIVED";
export const WEEKDAYS = ["SAT", "SUN", "MON", "TUE", "WED", "THU", "FRI"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const UNIQUE = {
  courses_tenant_name_lower_idx: { code: "CONFLICT_COURSE_NAME", field: "name", message: "A course with this name already exists." },
  courses_tenant_code_idx: { code: "CONFLICT_COURSE_CODE", field: "code", message: "A course with this code already exists." },
  subjects_tenant_course_name_lower_idx: { code: "CONFLICT_SUBJECT_NAME", field: "name", message: "This course already has a subject with this name." },
  batches_tenant_course_name_lower_idx: { code: "CONFLICT_BATCH_NAME", field: "name", message: "This course already has a batch with this name." },
  batch_subjects_batch_subject_unique: { code: "CONFLICT_BATCH_SUBJECT_EXISTS", field: "subjectId", message: "This subject is already in the batch." },
  schedule_slots_subject_day_start_unique: { code: "CONFLICT_SLOT_EXISTS", field: "startsAt", message: "This subject already has a class starting then on that day." },
};
const write = <T>(entity: string, fn: () => Promise<T>) =>
  fn().catch((err) => {
    throw mapDatabaseError(err, { entity, operation: "write", unique: UNIQUE }) ?? err;
  });

const record = (tx: DbOrTx, actor: Actor, action: string, resourceType: string, resourceId: string, values: { oldValue?: Record<string, unknown> | null; newValue?: Record<string, unknown> | null } = {}) =>
  audit.record(tx, { tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action, resourceType, resourceId, ...values });

function cleanName(value: string | undefined, field = "name"): string {
  const name = value?.trim() ?? "";
  if (!name) throw new ValidationError("VALIDATION_NAME", "The name is required.", { field });
  if (name.length > 100) throw new ValidationError("VALIDATION_NAME", "The name can be at most 100 characters.", { field });
  return name;
}

/** Course codes go into student IDs (D15): capital letters and digits, starting with a letter. */
export function cleanCourseCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{0,9}$/.test(code)) {
    throw new ValidationError("VALIDATION_COURSE_CODE", "Use 1–10 capital letters and digits, starting with a letter (e.g. HSC26).", { field: "code" });
  }
  return code;
}

function cleanDueDay(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || !((value >= 1 && value <= 28) || value === 31)) {
    throw new ValidationError("VALIDATION_DUE_DAY", "Pick a day from 1 to 28, or the last day of the month.", { field: "dueDay" });
  }
  return value;
}

/** "HH:MM" in 24-hour time → "HH:MM:00". */
export function cleanTime(value: string, field: string): string {
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::00)?$/.exec(value.trim());
  if (!m) throw new ValidationError("VALIDATION_TIME", "Use a 24-hour time like 16:30.", { field });
  return `${m[1]}:${m[2]}:00`;
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

export interface CourseInput {
  name: string;
  code: string;
  description?: string | null;
  dueDay?: number | null;
}

export async function listCourses(db: DbOrTx, tenantId: string, params: { status?: AcademicStatus } = {}) {
  // Outer columns are table-qualified by hand: Drizzle renders them bare in a single-table select, and a bare column
  // would bind to the subquery's table.
  const subjectCount = sql<number>`(select count(*)::int from subjects s where s.tenant_id = "courses"."tenant_id" and s.course_id = "courses"."id" and s.status = 'ACTIVE')`;
  const batchCount = sql<number>`(select count(*)::int from batches b where b.tenant_id = "courses"."tenant_id" and b.course_id = "courses"."id" and b.status = 'ACTIVE')`;
  return db
    .select({ id: courses.id, name: courses.name, code: courses.code, description: courses.description, dueDay: courses.dueDay, status: courses.status, subjectCount, batchCount })
    .from(courses)
    .where(and(eq(courses.tenantId, tenantId), params.status ? eq(courses.status, params.status) : undefined))
    .orderBy(asc(courses.name));
}

export async function getCourse(db: DbOrTx, tenantId: string, id: string) {
  const course = await getInTenant(db, courses, tenantId, id, "COURSE");
  const [subjectRows, batchRows] = await Promise.all([
    db.select().from(subjects).where(and(eq(subjects.tenantId, tenantId), eq(subjects.courseId, id))).orderBy(asc(subjects.name)),
    db
      .select({
        id: batches.id,
        name: batches.name,
        status: batches.status,
        subjectCount: sql<number>`(select count(*)::int from batch_subjects bs where bs.tenant_id = "batches"."tenant_id" and bs.batch_id = "batches"."id")`,
      })
      .from(batches)
      .where(and(eq(batches.tenantId, tenantId), eq(batches.courseId, id)))
      .orderBy(asc(batches.name)),
  ]);
  return { ...course, subjects: subjectRows, batches: batchRows };
}

export async function createCourse(db: DbOrTx, actor: Actor, input: CourseInput) {
  const values = { name: cleanName(input.name), code: cleanCourseCode(input.code), description: input.description?.trim() || null, dueDay: cleanDueDay(input.dueDay) };
  return inTransaction(db, async (tx) => {
    const [row] = await write("COURSE", () => tx.insert(courses).values({ tenantId: actor.tenantId, ...values, createdBy: actor.userId, updatedBy: actor.userId }).returning());
    await record(tx, actor, "COURSE_CREATED", "COURSE", row.id, { newValue: values });
    return row;
  });
}

/** The code can change only while no student ID has been issued with it (checked once students exist, M6). */
export async function updateCourse(db: DbOrTx, actor: Actor, id: string, input: Partial<CourseInput>) {
  return inTransaction(db, async (tx) => {
    const existing = await getInTenant(tx, courses, actor.tenantId, id, "COURSE");
    const values = {
      name: input.name === undefined ? existing.name : cleanName(input.name),
      code: input.code === undefined ? existing.code : cleanCourseCode(input.code),
      description: input.description === undefined ? existing.description : input.description?.trim() || null,
      dueDay: input.dueDay === undefined ? existing.dueDay : cleanDueDay(input.dueDay),
    };
    if (values.code !== existing.code) await academicReferences.assertUnreferenced(tx, actor.tenantId, "COURSE", id);
    const [row] = await write("COURSE", () =>
      tx.update(courses).set({ ...values, updatedAt: new Date(), updatedBy: actor.userId }).where(and(eq(courses.tenantId, actor.tenantId), eq(courses.id, id))).returning(),
    );
    await record(tx, actor, "COURSE_UPDATED", "COURSE", id, {
      oldValue: { name: existing.name, code: existing.code, description: existing.description, dueDay: existing.dueDay },
      newValue: values,
    });
    return row;
  });
}

export async function setCourseStatus(db: DbOrTx, actor: Actor, id: string, status: AcademicStatus) {
  return inTransaction(db, async (tx) => {
    const existing = await getInTenant(tx, courses, actor.tenantId, id, "COURSE");
    if (existing.status === status) return existing;
    const [row] = await tx.update(courses).set({ status, updatedAt: new Date(), updatedBy: actor.userId }).where(and(eq(courses.tenantId, actor.tenantId), eq(courses.id, id))).returning();
    await record(tx, actor, status === "ARCHIVED" ? "COURSE_ARCHIVED" : "COURSE_RESTORED", "COURSE", id);
    return row;
  });
}

/** Only an unused course can be deleted (no subjects, no batches, nothing else referring to it); otherwise archive it. */
export async function deleteCourse(db: DbOrTx, actor: Actor, id: string) {
  return inTransaction(db, async (tx) => {
    const existing = await getInTenant(tx, courses, actor.tenantId, id, "COURSE");
    const [counts] = await tx
      .select({
        subjects: sql<number>`(select count(*)::int from ${subjects} where ${subjects.tenantId} = ${actor.tenantId} and ${subjects.courseId} = ${id})`,
        batches: sql<number>`(select count(*)::int from ${batches} where ${batches.tenantId} = ${actor.tenantId} and ${batches.courseId} = ${id})`,
      })
      .from(sql`(select 1) as one`);
    const references = [
      ...(counts.subjects ? [{ type: "SUBJECT", count: counts.subjects }] : []),
      ...(counts.batches ? [{ type: "BATCH", count: counts.batches }] : []),
      ...(await academicReferences.countReferences(tx, actor.tenantId, "COURSE", id)),
    ];
    if (references.length) throw new InUseError("COURSE", references);
    await tx.delete(courses).where(and(eq(courses.tenantId, actor.tenantId), eq(courses.id, id)));
    await record(tx, actor, "COURSE_DELETED", "COURSE", id, { oldValue: { name: existing.name, code: existing.code } });
  });
}

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------

async function activeCourse(tx: DbOrTx, tenantId: string, courseId: string) {
  const course = await getInTenant(tx, courses, tenantId, courseId, "COURSE");
  if (course.status !== "ACTIVE") throw new ConflictError("CONFLICT_COURSE_ARCHIVED", "This course is archived. Restore it first.");
  return course;
}

export async function createSubject(db: DbOrTx, actor: Actor, courseId: string, input: { name: string }) {
  const name = cleanName(input.name);
  return inTransaction(db, async (tx) => {
    await activeCourse(tx, actor.tenantId, courseId);
    const [row] = await write("SUBJECT", () => tx.insert(subjects).values({ tenantId: actor.tenantId, courseId, name }).returning());
    await record(tx, actor, "SUBJECT_CREATED", "SUBJECT", row.id, { newValue: { courseId, name } });
    return row;
  });
}

export async function updateSubject(db: DbOrTx, actor: Actor, id: string, input: { name?: string; status?: AcademicStatus }) {
  return inTransaction(db, async (tx) => {
    const existing = await getInTenant(tx, subjects, actor.tenantId, id, "SUBJECT");
    const name = input.name === undefined ? existing.name : cleanName(input.name);
    const status = input.status ?? existing.status;
    const [row] = await write("SUBJECT", () =>
      tx.update(subjects).set({ name, status, updatedAt: new Date() }).where(and(eq(subjects.tenantId, actor.tenantId), eq(subjects.id, id))).returning(),
    );
    await record(tx, actor, "SUBJECT_UPDATED", "SUBJECT", id, { oldValue: { name: existing.name, status: existing.status }, newValue: { name, status } });
    return row;
  });
}

/** Only a subject no batch teaches can be deleted; otherwise archive it. */
export async function deleteSubject(db: DbOrTx, actor: Actor, id: string) {
  return inTransaction(db, async (tx) => {
    const existing = await getInTenant(tx, subjects, actor.tenantId, id, "SUBJECT");
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(batchSubjects).where(and(eq(batchSubjects.tenantId, actor.tenantId), eq(batchSubjects.subjectId, id)));
    const references = [...(count ? [{ type: "BATCH", count }] : []), ...(await academicReferences.countReferences(tx, actor.tenantId, "SUBJECT", id))];
    if (references.length) throw new InUseError("SUBJECT", references);
    await tx.delete(subjects).where(and(eq(subjects.tenantId, actor.tenantId), eq(subjects.id, id)));
    await record(tx, actor, "SUBJECT_DELETED", "SUBJECT", id, { oldValue: { name: existing.name } });
  });
}

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------

export async function listBatches(db: DbOrTx, tenantId: string, params: { courseId?: string; status?: AcademicStatus } = {}) {
  return db
    .select({ id: batches.id, name: batches.name, status: batches.status, courseId: courses.id, courseName: courses.name, courseCode: courses.code })
    .from(batches)
    .innerJoin(courses, and(eq(courses.tenantId, batches.tenantId), eq(courses.id, batches.courseId)))
    .where(and(eq(batches.tenantId, tenantId), params.courseId ? eq(batches.courseId, params.courseId) : undefined, params.status ? eq(batches.status, params.status) : undefined))
    .orderBy(asc(courses.name), asc(batches.name));
}

/** A batch with its course, and each subject with its instructors and schedule. */
export async function getBatch(db: DbOrTx, tenantId: string, id: string) {
  const batch = await getInTenant(db, batches, tenantId, id, "BATCH");
  const course = await getInTenant(db, courses, tenantId, batch.courseId, "COURSE");
  const subjectRows = await db
    .select({ id: batchSubjects.id, subjectId: subjects.id, subjectName: subjects.name, subjectStatus: subjects.status })
    .from(batchSubjects)
    .innerJoin(subjects, and(eq(subjects.tenantId, batchSubjects.tenantId), eq(subjects.id, batchSubjects.subjectId)))
    .where(and(eq(batchSubjects.tenantId, tenantId), eq(batchSubjects.batchId, id)))
    .orderBy(asc(subjects.name));
  const ids = subjectRows.map((s) => s.id);
  const [teacherRows, slotRows] = ids.length
    ? await Promise.all([
        db
          .select({ batchSubjectId: batchSubjectInstructors.batchSubjectId, id: instructors.id, fullName: instructors.fullName, status: instructors.status })
          .from(batchSubjectInstructors)
          .innerJoin(instructors, and(eq(instructors.tenantId, batchSubjectInstructors.tenantId), eq(instructors.id, batchSubjectInstructors.instructorId)))
          .where(and(eq(batchSubjectInstructors.tenantId, tenantId), inArray(batchSubjectInstructors.batchSubjectId, ids)))
          .orderBy(asc(instructors.fullName)),
        db.select().from(scheduleSlots).where(and(eq(scheduleSlots.tenantId, tenantId), inArray(scheduleSlots.batchSubjectId, ids))),
      ])
    : [[], []];
  const dayOrder = (d: string) => WEEKDAYS.indexOf(d as Weekday);
  return {
    ...batch,
    course: { id: course.id, name: course.name, code: course.code, status: course.status },
    subjects: subjectRows.map((s) => ({
      ...s,
      instructors: teacherRows.filter((t) => t.batchSubjectId === s.id).map((t) => ({ id: t.id, fullName: t.fullName, status: t.status })),
      slots: slotRows
        .filter((sl) => sl.batchSubjectId === s.id)
        .sort((a, b) => dayOrder(a.weekday) - dayOrder(b.weekday) || a.startsAt.localeCompare(b.startsAt))
        .map((sl) => ({ id: sl.id, weekday: sl.weekday, startsAt: sl.startsAt.slice(0, 5), endsAt: sl.endsAt.slice(0, 5) })),
    })),
  };
}

export async function createBatch(db: DbOrTx, actor: Actor, courseId: string, input: { name: string }) {
  const name = cleanName(input.name);
  return inTransaction(db, async (tx) => {
    await activeCourse(tx, actor.tenantId, courseId);
    const [row] = await write("BATCH", () => tx.insert(batches).values({ tenantId: actor.tenantId, courseId, name, createdBy: actor.userId, updatedBy: actor.userId }).returning());
    await record(tx, actor, "BATCH_CREATED", "BATCH", row.id, { newValue: { courseId, name } });
    return row;
  });
}

export async function updateBatch(db: DbOrTx, actor: Actor, id: string, input: { name?: string; status?: AcademicStatus }) {
  return inTransaction(db, async (tx) => {
    const existing = await getInTenant(tx, batches, actor.tenantId, id, "BATCH");
    const name = input.name === undefined ? existing.name : cleanName(input.name);
    const status = input.status ?? existing.status;
    if (status === "ACTIVE" && existing.status !== "ACTIVE") {
      await activeCourse(tx, actor.tenantId, existing.courseId);
      await lockSchedule(tx, actor.tenantId);
      await assertBatchFree(tx, actor.tenantId, id);
    }
    const [row] = await write("BATCH", () =>
      tx.update(batches).set({ name, status, updatedAt: new Date(), updatedBy: actor.userId }).where(and(eq(batches.tenantId, actor.tenantId), eq(batches.id, id))).returning(),
    );
    await record(tx, actor, "BATCH_UPDATED", "BATCH", id, { oldValue: { name: existing.name, status: existing.status }, newValue: { name, status } });
    return row;
  });
}

/** Only an unused batch can be deleted (nothing else refers to it, e.g. students, M6); otherwise archive it. */
export async function deleteBatch(db: DbOrTx, actor: Actor, id: string) {
  return inTransaction(db, async (tx) => {
    const existing = await getInTenant(tx, batches, actor.tenantId, id, "BATCH");
    await academicReferences.assertUnreferenced(tx, actor.tenantId, "BATCH", id);
    await tx.delete(batches).where(and(eq(batches.tenantId, actor.tenantId), eq(batches.id, id)));
    await record(tx, actor, "BATCH_DELETED", "BATCH", id, { oldValue: { name: existing.name } });
  });
}

// ---------------------------------------------------------------------------
// Batch subjects, instructors, schedule
// ---------------------------------------------------------------------------

/** Adds one of the course's active subjects to the batch (D25). */
export async function addBatchSubject(db: DbOrTx, actor: Actor, batchId: string, subjectId: string) {
  return inTransaction(db, async (tx) => {
    const batch = await getInTenant(tx, batches, actor.tenantId, batchId, "BATCH");
    const subject = await getInTenant(tx, subjects, actor.tenantId, subjectId, "SUBJECT");
    if (subject.courseId !== batch.courseId) {
      throw new ValidationError("VALIDATION_SUBJECT_COURSE", "A batch can only include subjects of its own course.", { field: "subjectId" });
    }
    if (subject.status !== "ACTIVE") throw new ConflictError("CONFLICT_SUBJECT_ARCHIVED", "This subject is archived.");
    const [row] = await write("BATCH_SUBJECT", () => tx.insert(batchSubjects).values({ tenantId: actor.tenantId, courseId: batch.courseId, batchId, subjectId }).returning());
    await record(tx, actor, "BATCH_SUBJECT_ADDED", "BATCH", batchId, { newValue: { subject: subject.name } });
    return row;
  });
}

/** Removes a subject from a batch with its instructors and schedule, unless another module refers to it. */
export async function removeBatchSubject(db: DbOrTx, actor: Actor, id: string) {
  return inTransaction(db, async (tx) => {
    const existing = await getInTenant(tx, batchSubjects, actor.tenantId, id, "BATCH_SUBJECT");
    await academicReferences.assertUnreferenced(tx, actor.tenantId, "BATCH_SUBJECT", id);
    await tx.delete(batchSubjects).where(and(eq(batchSubjects.tenantId, actor.tenantId), eq(batchSubjects.id, id)));
    await record(tx, actor, "BATCH_SUBJECT_REMOVED", "BATCH", existing.batchId, { oldValue: { subjectId: existing.subjectId } });
  });
}

const DAY_NAME: Record<Weekday, string> = { SAT: "Saturday", SUN: "Sunday", MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday", FRI: "Friday" };

export interface ScheduleClash {
  instructorName: string;
  batchName: string;
  subjectName: string;
  weekday: Weekday;
  startsAt: string;
  endsAt: string;
}

interface SlotTime {
  weekday: Weekday;
  startsAt: string;
  endsAt: string;
}

/** Schedule writes in one institute run one at a time, so two overlapping classes can't both pass the clash check. */
const lockSchedule = (tx: DbOrTx, tenantId: string) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`schedule:${tenantId}`}))`);

/**
 * Classes in active batches that the given instructors already teach at a time overlapping any of `times`
 * (back-to-back is fine). Classes of `excludeBatchSubjectId` itself are left out.
 */
async function findClashes(tx: DbOrTx, tenantId: string, instructorIds: string[], times: SlotTime[], excludeBatchSubjectId?: string): Promise<ScheduleClash[]> {
  if (!instructorIds.length || !times.length) return [];
  const overlapsAny = or(...times.map((t) => and(eq(scheduleSlots.weekday, t.weekday), lt(scheduleSlots.startsAt, t.endsAt), gt(scheduleSlots.endsAt, t.startsAt))));
  const rows = await tx
    .select({
      instructorName: instructors.fullName,
      batchName: batches.name,
      subjectName: subjects.name,
      weekday: scheduleSlots.weekday,
      startsAt: scheduleSlots.startsAt,
      endsAt: scheduleSlots.endsAt,
    })
    .from(scheduleSlots)
    .innerJoin(batchSubjects, and(eq(batchSubjects.tenantId, scheduleSlots.tenantId), eq(batchSubjects.id, scheduleSlots.batchSubjectId)))
    .innerJoin(batches, and(eq(batches.tenantId, batchSubjects.tenantId), eq(batches.id, batchSubjects.batchId)))
    .innerJoin(subjects, and(eq(subjects.tenantId, batchSubjects.tenantId), eq(subjects.id, batchSubjects.subjectId)))
    .innerJoin(batchSubjectInstructors, and(eq(batchSubjectInstructors.tenantId, batchSubjects.tenantId), eq(batchSubjectInstructors.batchSubjectId, batchSubjects.id)))
    .innerJoin(instructors, and(eq(instructors.tenantId, batchSubjectInstructors.tenantId), eq(instructors.id, batchSubjectInstructors.instructorId)))
    .where(
      and(
        eq(scheduleSlots.tenantId, tenantId),
        eq(batches.status, "ACTIVE"),
        inArray(batchSubjectInstructors.instructorId, instructorIds),
        overlapsAny,
        excludeBatchSubjectId ? ne(batchSubjects.id, excludeBatchSubjectId) : undefined,
      ),
    )
    .orderBy(asc(instructors.fullName), asc(scheduleSlots.startsAt));
  return rows.map((r) => ({ ...r, startsAt: r.startsAt.slice(0, 5), endsAt: r.endsAt.slice(0, 5) }));
}

/** An instructor can't teach two classes at overlapping times (owner decision, M4). */
function assertNoClashes(clashes: ScheduleClash[]) {
  if (!clashes.length) return;
  const [c] = clashes;
  throw new ConflictError(
    "CONFLICT_INSTRUCTOR_CLASH",
    `${c.instructorName} already teaches ${c.subjectName} (${c.batchName}) on ${DAY_NAME[c.weekday]}, ${c.startsAt}–${c.endsAt}.`,
    { clashes },
  );
}

const instructorIdsOf = async (tx: DbOrTx, tenantId: string, batchSubjectId: string) =>
  (
    await tx
      .select({ id: batchSubjectInstructors.instructorId })
      .from(batchSubjectInstructors)
      .where(and(eq(batchSubjectInstructors.tenantId, tenantId), eq(batchSubjectInstructors.batchSubjectId, batchSubjectId)))
  ).map((r) => r.id);

const slotTimesOf = (tx: DbOrTx, tenantId: string, batchSubjectId: string): Promise<SlotTime[]> =>
  tx
    .select({ weekday: scheduleSlots.weekday, startsAt: scheduleSlots.startsAt, endsAt: scheduleSlots.endsAt })
    .from(scheduleSlots)
    .where(and(eq(scheduleSlots.tenantId, tenantId), eq(scheduleSlots.batchSubjectId, batchSubjectId)));

/**
 * Replaces who teaches a subject in a batch. Only active instructors can be newly assigned; one deactivated after
 * being assigned can stay until removed. A newly assigned instructor must be free at this subject's class times.
 */
export async function setBatchSubjectInstructors(db: DbOrTx, actor: Actor, id: string, instructorIds: string[]) {
  const wanted = [...new Set(instructorIds)];
  return inTransaction(db, async (tx) => {
    const existing = await getInTenant(tx, batchSubjects, actor.tenantId, id, "BATCH_SUBJECT");
    await lockSchedule(tx, actor.tenantId);
    const assigned = new Set(await instructorIdsOf(tx, actor.tenantId, id));
    for (const instructorId of wanted) {
      const instructor = await getInTenant(tx, instructors, actor.tenantId, instructorId, "INSTRUCTOR");
      if (instructor.status !== "ACTIVE" && !assigned.has(instructorId)) {
        throw new ConflictError("CONFLICT_INSTRUCTOR_INACTIVE", `${instructor.fullName} is inactive and can't be assigned.`, { instructorId });
      }
    }
    const batch = await getInTenant(tx, batches, actor.tenantId, existing.batchId, "BATCH");
    if (batch.status === "ACTIVE") {
      const added = wanted.filter((i) => !assigned.has(i));
      assertNoClashes(await findClashes(tx, actor.tenantId, added, await slotTimesOf(tx, actor.tenantId, id), id));
    }
    await tx.delete(batchSubjectInstructors).where(and(eq(batchSubjectInstructors.tenantId, actor.tenantId), eq(batchSubjectInstructors.batchSubjectId, id)));
    if (wanted.length) {
      await tx.insert(batchSubjectInstructors).values(wanted.map((instructorId) => ({ tenantId: actor.tenantId, batchSubjectId: id, instructorId })));
    }
    await record(tx, actor, "BATCH_SUBJECT_INSTRUCTORS_SET", "BATCH", existing.batchId, { newValue: { batchSubjectId: id, instructorIds: wanted } });
  });
}

/** A restored batch's classes must not clash with what its instructors teach in other active batches. */
async function assertBatchFree(tx: DbOrTx, tenantId: string, batchId: string) {
  const items = await tx.select({ id: batchSubjects.id }).from(batchSubjects).where(and(eq(batchSubjects.tenantId, tenantId), eq(batchSubjects.batchId, batchId)));
  for (const item of items) {
    assertNoClashes(await findClashes(tx, tenantId, await instructorIdsOf(tx, tenantId, item.id), await slotTimesOf(tx, tenantId, item.id), item.id));
  }
}

/** Adds a weekly class time. Refused when one of the subject's instructors teaches elsewhere at an overlapping time. */
export async function addScheduleSlot(db: DbOrTx, actor: Actor, batchSubjectId: string, input: SlotTime) {
  if (!WEEKDAYS.includes(input.weekday)) throw new ValidationError("VALIDATION_WEEKDAY", "Pick a day of the week.", { field: "weekday" });
  const startsAt = cleanTime(input.startsAt, "startsAt");
  const endsAt = cleanTime(input.endsAt, "endsAt");
  if (startsAt >= endsAt) throw new ValidationError("VALIDATION_TIME_ORDER", "The class must end after it starts.", { field: "endsAt" });
  const time = { weekday: input.weekday, startsAt, endsAt };
  return inTransaction(db, async (tx) => {
    const batchSubject = await getInTenant(tx, batchSubjects, actor.tenantId, batchSubjectId, "BATCH_SUBJECT");
    await lockSchedule(tx, actor.tenantId);
    // Overlapping class times of the subject itself are checked too, so no exclusion here.
    assertNoClashes(await findClashes(tx, actor.tenantId, await instructorIdsOf(tx, actor.tenantId, batchSubjectId), [time]));
    const [slot] = await write("SCHEDULE_SLOT", () => tx.insert(scheduleSlots).values({ tenantId: actor.tenantId, batchSubjectId, ...time }).returning());
    await record(tx, actor, "SCHEDULE_SLOT_ADDED", "BATCH", batchSubject.batchId, { newValue: { batchSubjectId, ...time } });
    return { id: slot.id, weekday: slot.weekday, startsAt: slot.startsAt.slice(0, 5), endsAt: slot.endsAt.slice(0, 5) };
  });
}

export async function removeScheduleSlot(db: DbOrTx, actor: Actor, id: string) {
  return inTransaction(db, async (tx) => {
    const slot = await getInTenant(tx, scheduleSlots, actor.tenantId, id, "SCHEDULE_SLOT");
    const batchSubject = await getInTenant(tx, batchSubjects, actor.tenantId, slot.batchSubjectId, "BATCH_SUBJECT");
    await tx.delete(scheduleSlots).where(and(eq(scheduleSlots.tenantId, actor.tenantId), eq(scheduleSlots.id, id)));
    await record(tx, actor, "SCHEDULE_SLOT_REMOVED", "BATCH", batchSubject.batchId, { oldValue: { weekday: slot.weekday, startsAt: slot.startsAt, endsAt: slot.endsAt } });
  });
}
