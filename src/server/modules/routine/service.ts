import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  batchSubjectInstructors,
  batchSubjects,
  batches,
  courses,
  holidays,
  instructors,
  routineChanges,
  scheduleSlots,
  subjects,
} from "../../core/db/schema";
import { inTransaction } from "../../core/db/transaction";
import type { DbOrTx } from "../../core/db/types";
import { ConflictError, NotFoundError, ValidationError } from "../../core/errors";
import { addDays, isCalendarDate, todayInDhaka, weekdayOf } from "@/lib/dates";
import { audit } from "../audit/service";
import { isModuleActive } from "../entitlements/service";
import { expandTimetable, hhmm, overlaps, takesPlace, type Change, type DatedClass, type Holiday, type Slot } from "./timetable";
import "./references";

// The routine: the dated timetable with its changes and holidays, and making those changes. Only Owner/Admin
// change the routine; an instructor sees their own batches.

export interface Viewer {
  tenantId: string;
  userId: string;
  permissions: ReadonlySet<string>;
}

const MAX_RANGE_DAYS = 62;
/** The office sees every batch; an instructor the batches they teach. */
export const seesAllRoutine = (v: Viewer) => v.permissions.has("routine.manage") || v.permissions.has("academic.view");

function cleanDate(value: string | null | undefined, field: string, label = "a valid date"): string {
  const date = value?.trim() ?? "";
  if (!isCalendarDate(date)) throw new ValidationError("VALIDATION_DATE", `Enter ${label}.`, { field });
  return date;
}

function cleanTime(value: string | null | undefined, field: string): string {
  const t = value?.trim() ?? "";
  if (!/^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(t)) throw new ValidationError("VALIDATION_TIME", "Enter a time like 16:30.", { field });
  return t.slice(0, 5);
}

function cleanReason(value: string | null | undefined, required: boolean, message: string): string | null {
  const r = value?.trim() || null;
  if (required && !r) throw new ValidationError("VALIDATION_REASON_REQUIRED", message, { field: "reason" });
  if (r && r.length > 300) throw new ValidationError("VALIDATION_TEXT", "The reason can be at most 300 characters.", { field: "reason" });
  return r;
}

/** Batch subjects of active batches, with names and their regular instructors. */
async function batchSubjectInfo(db: DbOrTx, tenantId: string, filter: { batchIds?: string[]; batchSubjectIds?: string[] } = {}) {
  const rows = await db
    .select({ id: batchSubjects.id, batchId: batches.id, batchName: batches.name, courseName: courses.name, subjectName: subjects.name })
    .from(batchSubjects)
    .innerJoin(batches, and(eq(batches.tenantId, batchSubjects.tenantId), eq(batches.id, batchSubjects.batchId)))
    .innerJoin(courses, and(eq(courses.tenantId, batches.tenantId), eq(courses.id, batches.courseId)))
    .innerJoin(subjects, and(eq(subjects.tenantId, batchSubjects.tenantId), eq(subjects.id, batchSubjects.subjectId)))
    .where(
      and(
        eq(batchSubjects.tenantId, tenantId),
        eq(batches.status, "ACTIVE"),
        filter.batchIds ? inArray(batches.id, filter.batchIds) : undefined,
        filter.batchSubjectIds ? inArray(batchSubjects.id, filter.batchSubjectIds) : undefined,
      ),
    );
  const ids = rows.map((r) => r.id);
  const teachers = ids.length
    ? await db
        .select({ batchSubjectId: batchSubjectInstructors.batchSubjectId, id: instructors.id, name: instructors.fullName, userId: instructors.userId })
        .from(batchSubjectInstructors)
        .innerJoin(instructors, and(eq(instructors.tenantId, batchSubjectInstructors.tenantId), eq(instructors.id, batchSubjectInstructors.instructorId)))
        .where(and(eq(batchSubjectInstructors.tenantId, tenantId), inArray(batchSubjectInstructors.batchSubjectId, ids)))
    : [];
  return new Map(rows.map((r) => [r.id, { ...r, instructors: teachers.filter((t) => t.batchSubjectId === r.id).map(({ id, name, userId }) => ({ id, name, userId })) }]));
}

async function instructorNames(db: DbOrTx, tenantId: string, ids: string[]) {
  if (!ids.length) return new Map<string, { name: string; userId: string | null }>();
  const rows = await db.select({ id: instructors.id, name: instructors.fullName, userId: instructors.userId }).from(instructors).where(and(eq(instructors.tenantId, tenantId), inArray(instructors.id, ids)));
  return new Map(rows.map((r) => [r.id, { name: r.name, userId: r.userId }]));
}

/** The raw inputs of the timetable for a date range: slots, active changes touching it, overlapping holidays. */
async function timetableInputs(db: DbOrTx, tenantId: string, batchSubjectIds: string[], from: string, to: string) {
  if (!batchSubjectIds.length) return { slots: [] as Slot[], changes: [] as Change[], holidays: [] as Holiday[] };
  const [slotRows, changeRows, holidayRows] = await Promise.all([
    db
      .select({ batchSubjectId: scheduleSlots.batchSubjectId, weekday: scheduleSlots.weekday, startsAt: scheduleSlots.startsAt, endsAt: scheduleSlots.endsAt })
      .from(scheduleSlots)
      .where(and(eq(scheduleSlots.tenantId, tenantId), inArray(scheduleSlots.batchSubjectId, batchSubjectIds))),
    db
      .select()
      .from(routineChanges)
      .where(
        and(
          eq(routineChanges.tenantId, tenantId),
          isNull(routineChanges.withdrawnAt),
          inArray(routineChanges.batchSubjectId, batchSubjectIds),
          or(and(gte(routineChanges.classDate, from), lte(routineChanges.classDate, to)), and(gte(routineChanges.newDate, from), lte(routineChanges.newDate, to))),
        ),
      ),
    db.select().from(holidays).where(and(eq(holidays.tenantId, tenantId), isNull(holidays.withdrawnAt), lte(holidays.fromDate, to), gte(holidays.toDate, from))),
  ]);
  return {
    slots: slotRows as Slot[],
    changes: changeRows.map((c) => ({ ...c, kind: c.kind, startsAt: hhmm(c.startsAt) })) as Change[],
    holidays: holidayRows.map((h) => ({ id: h.id, name: h.name, fromDate: h.fromDate, toDate: h.toDate })),
  };
}

export interface RoutineClass extends DatedClass {
  batchId: string;
  batchName: string;
  courseName: string;
  subjectName: string;
  /** Who teaches it on this date: the substitute when there is one, else the regular instructor(s). */
  instructors: { id: string; name: string }[];
  regularInstructors: { id: string; name: string }[];
  substituteName: string | null;
}

/** The dated timetable of these batch subjects, named, with who teaches each class. */
export async function timetable(db: DbOrTx, tenantId: string, from: string, to: string, filter: { batchIds?: string[]; batchSubjectIds?: string[] } = {}): Promise<RoutineClass[]> {
  const info = await batchSubjectInfo(db, tenantId, filter);
  const inputs = await timetableInputs(db, tenantId, [...info.keys()], from, to);
  const classes = expandTimetable({ ...inputs, from, to });
  const subs = await instructorNames(db, tenantId, [...new Set(classes.map((c) => c.substituteInstructorId).filter((x): x is string => !!x))]);
  return classes.map((c) => {
    const bs = info.get(c.batchSubjectId)!;
    const regular = bs.instructors.map(({ id, name }) => ({ id, name }));
    const sub = c.substituteInstructorId ? subs.get(c.substituteInstructorId) : undefined;
    return {
      ...c, batchId: bs.batchId, batchName: bs.batchName, courseName: bs.courseName, subjectName: bs.subjectName,
      regularInstructors: regular,
      instructors: c.substituteInstructorId ? [{ id: c.substituteInstructorId, name: sub?.name ?? "—" }] : regular,
      substituteName: sub?.name ?? null,
    };
  });
}

function cleanRange(from: string | undefined, days: number) {
  const start = cleanDate(from ?? todayInDhaka(), "from");
  if (days < 1 || days > MAX_RANGE_DAYS) throw new ValidationError("VALIDATION_DATE_RANGE", `Choose at most ${MAX_RANGE_DAYS} days.`, { field: "days" });
  return { from: start, to: addDays(start, days - 1) };
}

/** The batches (and instructors) a viewer can see in the routine. */
export async function routineOptions(db: DbOrTx, viewer: Viewer) {
  const all = seesAllRoutine(viewer);
  const batchRows = await db
    .select({ id: batches.id, name: batches.name, courseName: courses.name })
    .from(batches)
    .innerJoin(courses, and(eq(courses.tenantId, batches.tenantId), eq(courses.id, batches.courseId)))
    .where(
      and(
        eq(batches.tenantId, viewer.tenantId),
        eq(batches.status, "ACTIVE"),
        all
          ? undefined
          : sql`exists (select 1 from ${batchSubjects} bs join ${batchSubjectInstructors} bsi on bsi.tenant_id = bs.tenant_id and bsi.batch_subject_id = bs.id
              join ${instructors} i on i.tenant_id = bsi.tenant_id and i.id = bsi.instructor_id
              where bs.tenant_id = ${viewer.tenantId} and bs.batch_id = ${batches.id} and i.user_id = ${viewer.userId})`,
      ),
    )
    .orderBy(asc(courses.name), asc(batches.name));
  const instructorRows = all
    ? await db.select({ id: instructors.id, name: instructors.fullName, status: instructors.status }).from(instructors).where(eq(instructors.tenantId, viewer.tenantId)).orderBy(asc(instructors.fullName))
    : await db.select({ id: instructors.id, name: instructors.fullName, status: instructors.status }).from(instructors).where(and(eq(instructors.tenantId, viewer.tenantId), eq(instructors.userId, viewer.userId)));
  return { batches: batchRows, instructors: instructorRows, today: todayInDhaka() };
}

/** A batch's classes for some days, including changes. An instructor only for a batch they teach. */
export async function batchWeek(db: DbOrTx, viewer: Viewer, batchId: string, input: { from?: string; days?: number }) {
  const range = cleanRange(input.from, input.days ?? 7);
  const { batches: visible } = await routineOptions(db, viewer);
  if (!visible.some((b) => b.id === batchId)) throw new NotFoundError("BATCH");
  return { ...range, classes: await timetable(db, viewer.tenantId, range.from, range.to, { batchIds: [batchId] }) };
}

/**
 * An instructor's classes for some days: those they teach regularly (unless someone substitutes) and those they
 * substitute in. An instructor sees only their own week.
 */
export async function instructorWeek(db: DbOrTx, viewer: Viewer, instructorId: string, input: { from?: string; days?: number }) {
  const range = cleanRange(input.from, input.days ?? 7);
  const { instructors: visible } = await routineOptions(db, viewer);
  if (!visible.some((i) => i.id === instructorId)) throw new NotFoundError("INSTRUCTOR");
  const all = await timetable(db, viewer.tenantId, range.from, range.to);
  return { ...range, classes: all.filter((c) => c.instructors.some((i) => i.id === instructorId) || c.regularInstructors.some((i) => i.id === instructorId)) };
}

/** Every class in the viewer's batches on one day (the office: the whole institute). */
export async function dayView(db: DbOrTx, viewer: Viewer, dateInput?: string) {
  const date = cleanDate(dateInput ?? todayInDhaka(), "date");
  const { batches: visible } = await routineOptions(db, viewer);
  return { date, classes: visible.length ? await timetable(db, viewer.tenantId, date, date, { batchIds: visible.map((b) => b.id) }) : [] };
}

/** Changes and holidays from a date on (today by default), newest class first, with names. */
export async function listChanges(db: DbOrTx, viewer: Viewer, input: { from?: string } = {}) {
  const from = cleanDate(input.from ?? addDays(todayInDhaka(), -7), "from");
  const { batches: visible } = await routineOptions(db, viewer);
  const info = await batchSubjectInfo(db, viewer.tenantId, { batchIds: visible.map((b) => b.id) });
  const ids = [...info.keys()];
  const changes = ids.length
    ? await db
        .select()
        .from(routineChanges)
        .where(and(eq(routineChanges.tenantId, viewer.tenantId), isNull(routineChanges.withdrawnAt), inArray(routineChanges.batchSubjectId, ids), or(gte(routineChanges.classDate, from), gte(routineChanges.newDate, from))))
        .orderBy(asc(routineChanges.classDate), asc(routineChanges.startsAt))
    : [];
  const subs = await instructorNames(db, viewer.tenantId, [...new Set(changes.map((c) => c.substituteInstructorId).filter((x): x is string => !!x))]);
  const holidayRows = await db
    .select()
    .from(holidays)
    .where(and(eq(holidays.tenantId, viewer.tenantId), isNull(holidays.withdrawnAt), gte(holidays.toDate, from)))
    .orderBy(asc(holidays.fromDate));
  return {
    from,
    changes: changes.map((c) => {
      const bs = info.get(c.batchSubjectId)!;
      return {
        id: c.id, kind: c.kind, batchSubjectId: c.batchSubjectId, batchName: bs.batchName, courseName: bs.courseName, subjectName: bs.subjectName,
        classDate: c.classDate, startsAt: hhmm(c.startsAt), reason: c.reason, newDate: c.newDate, newStartsAt: c.newStartsAt && hhmm(c.newStartsAt), newEndsAt: c.newEndsAt && hhmm(c.newEndsAt),
        substituteName: c.substituteInstructorId ? (subs.get(c.substituteInstructorId)?.name ?? null) : null, createdAt: c.createdAt,
      };
    }),
    holidays: holidayRows.map((h) => ({ id: h.id, name: h.name, fromDate: h.fromDate, toDate: h.toDate })),
  };
}

// --- making changes (Owner/Admin) -----------------------------------------------------------------------

/** Routine writes in one institute run one at a time — the same lock as Core's schedule — so clash checks hold. */
const lockSchedule = (tx: DbOrTx, tenantId: string) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`schedule:${tenantId}`}))`);

/**
 * on a date: who among `instructorIds` already teaches a class that takes place on `date` overlapping the time,
 * counting reschedules and substitutions. The class being changed is left out.
 */
async function clashOn(tx: DbOrTx, tenantId: string, instructorIds: string[], date: string, time: { startsAt: string; endsAt: string }, exclude: { batchSubjectId: string; date: string; startsAt: string }) {
  if (!instructorIds.length) return null;
  const day = await timetable(tx, tenantId, date, date);
  return (
    day.find(
      (c) =>
        takesPlace(c) &&
        !(c.batchSubjectId === exclude.batchSubjectId && ((c.movedFrom ? c.movedFrom.date === exclude.date && c.movedFrom.startsAt === exclude.startsAt : c.date === exclude.date && c.startsAt === exclude.startsAt))) &&
        c.instructors.some((i) => instructorIds.includes(i.id)) &&
        overlaps(c, time),
    ) ?? null
  );
}

export interface ChangeInput {
  batchSubjectId: string;
  classDate: string;
  startsAt: string;
  kind: "CANCEL" | "RESCHEDULE" | "SUBSTITUTE";
  reason?: string | null;
  newDate?: string | null;
  newStartsAt?: string | null;
  newEndsAt?: string | null;
  substituteInstructorId?: string | null;
}

/**
 * Changes one scheduled class: cancel (reason), reschedule (new date and time, free of instructor clashes and not
 * on a holiday), or substitute (an active instructor who is free then). A past class needs a reason. Audited.
 */
export async function createChange(db: DbOrTx, actor: Viewer, input: ChangeInput) {
  const classDate = cleanDate(input.classDate, "classDate", "the class's date");
  const startsAt = cleanTime(input.startsAt, "startsAt");
  if (!["CANCEL", "RESCHEDULE", "SUBSTITUTE"].includes(input.kind)) throw new ValidationError("VALIDATION_KIND", "Choose cancel, reschedule or substitute.", { field: "kind" });
  const past = classDate < todayInDhaka();
  const reason = cleanReason(
    input.reason,
    input.kind === "CANCEL" || past,
    input.kind === "CANCEL" ? "Give a reason for the cancellation, e.g. 'Instructor ill'." : "Give a reason for changing a past class.",
  );

  return inTransaction(db, async (tx) => {
    await lockSchedule(tx, actor.tenantId);
    const info = await batchSubjectInfo(tx, actor.tenantId, { batchSubjectIds: [input.batchSubjectId] });
    const bs = info.get(input.batchSubjectId);
    if (!bs) throw new NotFoundError("BATCH_SUBJECT");
    const [slot] = await tx
      .select({ endsAt: scheduleSlots.endsAt })
      .from(scheduleSlots)
      .where(and(eq(scheduleSlots.tenantId, actor.tenantId), eq(scheduleSlots.batchSubjectId, bs.id), eq(scheduleSlots.weekday, weekdayOf(classDate)), eq(scheduleSlots.startsAt, startsAt)));
    if (!slot) throw new NotFoundError("CLASS", "There's no class of this subject at that time on that day.");
    const [existing] = await tx
      .select({ id: routineChanges.id })
      .from(routineChanges)
      .where(and(eq(routineChanges.tenantId, actor.tenantId), eq(routineChanges.batchSubjectId, bs.id), eq(routineChanges.classDate, classDate), eq(routineChanges.startsAt, startsAt), isNull(routineChanges.withdrawnAt)));
    if (existing) throw new ConflictError("CONFLICT_CLASS_CHANGED", "This class already has a change. Withdraw it first to make a different one.");
    const exclude = { batchSubjectId: bs.id, date: classDate, startsAt };
    const values: typeof routineChanges.$inferInsert = { tenantId: actor.tenantId, batchSubjectId: bs.id, classDate, startsAt, kind: input.kind, reason, createdBy: actor.userId };

    if (input.kind === "RESCHEDULE") {
      const newDate = cleanDate(input.newDate, "newDate", "the new date");
      const newStartsAt = cleanTime(input.newStartsAt, "newStartsAt");
      const newEndsAt = cleanTime(input.newEndsAt, "newEndsAt");
      if (newStartsAt >= newEndsAt) throw new ValidationError("VALIDATION_TIME_ORDER", "The class must end after it starts.", { field: "newEndsAt" });
      if (newDate === classDate && newStartsAt === startsAt) throw new ValidationError("VALIDATION_SAME_TIME", "Choose a different date or time.", { field: "newDate" });
      const [holiday] = await tx.select({ name: holidays.name }).from(holidays).where(and(eq(holidays.tenantId, actor.tenantId), isNull(holidays.withdrawnAt), lte(holidays.fromDate, newDate), gte(holidays.toDate, newDate)));
      if (holiday) throw new ConflictError("CONFLICT_HOLIDAY", `${newDate} is a holiday (${holiday.name}).`);
      const clash = await clashOn(tx, actor.tenantId, bs.instructors.map((i) => i.id), newDate, { startsAt: newStartsAt, endsAt: newEndsAt }, exclude);
      if (clash) {
        throw new ConflictError("CONFLICT_INSTRUCTOR_CLASH", `${clash.instructors.map((i) => i.name).join(", ")} already teaches ${clash.subjectName} (${clash.batchName}) on ${newDate}, ${clash.startsAt}–${clash.endsAt}.`);
      }
      Object.assign(values, { newDate, newStartsAt, newEndsAt });
    }
    if (input.kind === "SUBSTITUTE") {
      if (!input.substituteInstructorId) throw new ValidationError("VALIDATION_SUBSTITUTE", "Choose the substitute instructor.", { field: "substituteInstructorId" });
      const [sub] = await tx.select().from(instructors).where(and(eq(instructors.tenantId, actor.tenantId), eq(instructors.id, input.substituteInstructorId)));
      if (!sub) throw new NotFoundError("INSTRUCTOR");
      if (sub.status !== "ACTIVE") throw new ConflictError("CONFLICT_INSTRUCTOR_INACTIVE", `${sub.fullName} is inactive.`);
      if (bs.instructors.some((i) => i.id === sub.id)) throw new ValidationError("VALIDATION_SUBSTITUTE", `${sub.fullName} already teaches this class.`, { field: "substituteInstructorId" });
      const clash = await clashOn(tx, actor.tenantId, [sub.id], classDate, { startsAt, endsAt: hhmm(slot.endsAt) }, exclude);
      if (clash) throw new ConflictError("CONFLICT_INSTRUCTOR_CLASH", `${sub.fullName} already teaches ${clash.subjectName} (${clash.batchName}) then, ${clash.startsAt}–${clash.endsAt}.`);
      values.substituteInstructorId = sub.id;
    }

    const [row] = await tx.insert(routineChanges).values(values).returning();
    await audit.record(tx, {
      tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action: "ROUTINE_CHANGE_ADDED", resourceType: "ROUTINE_CHANGE", resourceId: row.id,
      newValue: { kind: row.kind, batch: bs.batchName, subject: bs.subjectName, classDate, startsAt, reason, newDate: row.newDate, newStartsAt: row.newStartsAt, newEndsAt: row.newEndsAt, substituteInstructorId: row.substituteInstructorId },
    });
    return row;
  });
}

/** Withdraws a change: the class goes back to its weekly time and instructor. The record stays. Audited. */
export async function withdrawChange(db: DbOrTx, actor: Viewer, id: string) {
  return inTransaction(db, async (tx) => {
    const [row] = await tx.select().from(routineChanges).where(and(eq(routineChanges.tenantId, actor.tenantId), eq(routineChanges.id, id)));
    if (!row) throw new NotFoundError("ROUTINE_CHANGE");
    if (row.withdrawnAt) throw new ConflictError("CONFLICT_WITHDRAWN", "This change was already withdrawn.");
    await tx.update(routineChanges).set({ withdrawnAt: new Date(), withdrawnBy: actor.userId }).where(and(eq(routineChanges.tenantId, actor.tenantId), eq(routineChanges.id, id)));
    await audit.record(tx, {
      tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action: "ROUTINE_CHANGE_WITHDRAWN", resourceType: "ROUTINE_CHANGE", resourceId: id,
      oldValue: { kind: row.kind, classDate: row.classDate, startsAt: hhmm(row.startsAt), reason: row.reason },
    });
  });
}

/** An institute holiday: every class on those dates is cancelled. Overlapping holidays are refused. Audited. */
export async function createHoliday(db: DbOrTx, actor: Viewer, input: { name: string; fromDate: string; toDate?: string | null }) {
  const name = cleanReason(input.name, true, "Give the holiday a name, e.g. 'Victory Day'.")!;
  if (name.length > 120) throw new ValidationError("VALIDATION_TEXT", "The name can be at most 120 characters.", { field: "name" });
  const fromDate = cleanDate(input.fromDate, "fromDate", "the first day");
  const toDate = input.toDate ? cleanDate(input.toDate, "toDate", "the last day") : fromDate;
  if (toDate < fromDate) throw new ValidationError("VALIDATION_DATE_ORDER", "The last day can't be before the first.", { field: "toDate" });
  if (toDate > addDays(fromDate, 59)) throw new ValidationError("VALIDATION_DATE_RANGE", "A holiday can be at most 60 days.", { field: "toDate" });
  return inTransaction(db, async (tx) => {
    await lockSchedule(tx, actor.tenantId);
    const [overlap] = await tx.select({ name: holidays.name }).from(holidays).where(and(eq(holidays.tenantId, actor.tenantId), isNull(holidays.withdrawnAt), lte(holidays.fromDate, toDate), gte(holidays.toDate, fromDate)));
    if (overlap) throw new ConflictError("CONFLICT_HOLIDAY_OVERLAP", `These dates overlap the holiday "${overlap.name}".`);
    const [row] = await tx.insert(holidays).values({ tenantId: actor.tenantId, name, fromDate, toDate, createdBy: actor.userId }).returning();
    await audit.record(tx, { tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action: "HOLIDAY_ADDED", resourceType: "HOLIDAY", resourceId: row.id, newValue: { name, fromDate, toDate } });
    return row;
  });
}

export async function withdrawHoliday(db: DbOrTx, actor: Viewer, id: string) {
  return inTransaction(db, async (tx) => {
    const [row] = await tx.select().from(holidays).where(and(eq(holidays.tenantId, actor.tenantId), eq(holidays.id, id)));
    if (!row) throw new NotFoundError("HOLIDAY");
    if (row.withdrawnAt) throw new ConflictError("CONFLICT_WITHDRAWN", "This holiday was already withdrawn.");
    await tx.update(holidays).set({ withdrawnAt: new Date(), withdrawnBy: actor.userId }).where(and(eq(holidays.tenantId, actor.tenantId), eq(holidays.id, id)));
    await audit.record(tx, { tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action: "HOLIDAY_WITHDRAWN", resourceType: "HOLIDAY", resourceId: id, oldValue: { name: row.name, fromDate: row.fromDate, toDate: row.toDate } });
  });
}

// --- for other modules: only while Routine is on for the institute -------------------------

/** The routine's classes of these batch subjects on a date, or null when the Routine module is off. */
export async function routineClassesOn(db: DbOrTx, tenantId: string, date: string, batchSubjectIds: string[]): Promise<RoutineClass[] | null> {
  if (!batchSubjectIds.length || !(await isModuleActive(db, tenantId, "routine"))) return null;
  return timetable(db, tenantId, date, date, { batchSubjectIds });
}

/** The classes a user substitutes in on a date; none while the Routine module is off. */
export async function substitutionsOn(db: DbOrTx, tenantId: string, userId: string, date: string): Promise<{ batchSubjectId: string; startsAt: string }[]> {
  if (!(await isModuleActive(db, tenantId, "routine"))) return [];
  const rows = await db
    .select({ batchSubjectId: routineChanges.batchSubjectId, startsAt: routineChanges.startsAt })
    .from(routineChanges)
    .innerJoin(instructors, and(eq(instructors.tenantId, routineChanges.tenantId), eq(instructors.id, routineChanges.substituteInstructorId)))
    .where(and(eq(routineChanges.tenantId, tenantId), eq(routineChanges.kind, "SUBSTITUTE"), eq(routineChanges.classDate, date), isNull(routineChanges.withdrawnAt), eq(instructors.userId, userId)));
  return rows.map((r) => ({ batchSubjectId: r.batchSubjectId, startsAt: hhmm(r.startsAt) }));
}

/** Why a class doesn't take place, in words, or null when it does. */
export function routineOffReason(c: Pick<RoutineClass, "status" | "reason" | "movedTo">): string | null {
  if (c.status === "CANCELLED") return `Cancelled in the routine${c.reason ? `: ${c.reason}` : ""}`;
  if (c.status === "HOLIDAY") return `Holiday${c.reason ? `: ${c.reason}` : ""}`;
  if (c.status === "MOVED_AWAY" && c.movedTo) return `Moved in the routine to ${c.movedTo.date}, ${c.movedTo.startsAt}`;
  return null;
}
