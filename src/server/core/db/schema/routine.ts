import { check, date, foreignKey, index, integer, pgEnum, pgTable, time, timestamp, unique, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { batchSubjects } from "./academic";
import { users } from "./core";
import { instructors } from "./instructors";

// Routine & Lesson Plans (paid module `routine`): D3, D24, D27, D51, D114–D122. The weekly class times stay in Core
// (schedule_slots); this module records what changes on particular dates, institute holidays, and lesson plans.

export const routineChangeKindEnum = pgEnum("routine_change_kind", ["CANCEL", "RESCHEDULE", "SUBSTITUTE"]);
export const lessonTopicStatusEnum = pgEnum("lesson_topic_status", ["PENDING", "ONGOING", "COMPLETED"]);

/**
 * One change to one scheduled class (D114): the class is identified by its batch subject, date and start time (an
 * occurrence of a weekly slot). Withdrawn rather than deleted, so the record stays; at most one active change per class.
 */
export const routineChanges = pgTable("routine_changes", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  batchSubjectId: uuid("batch_subject_id").notNull(),
  classDate: date("class_date").notNull(),
  startsAt: time("starts_at").notNull(),
  kind: routineChangeKindEnum("kind").notNull(),
  // Required for a cancellation, and for any change to a past class (D122).
  reason: varchar("reason", { length: 300 }),
  newDate: date("new_date"),
  newStartsAt: time("new_starts_at"),
  newEndsAt: time("new_ends_at"),
  substituteInstructorId: uuid("substitute_instructor_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by").notNull(),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  withdrawnBy: uuid("withdrawn_by"),
}, (t) => [
  unique("routine_changes_tenant_id_unique").on(t.tenantId, t.id),
  uniqueIndex("routine_changes_active_unique").on(t.tenantId, t.batchSubjectId, t.classDate, t.startsAt).where(sql`${t.withdrawnAt} IS NULL`),
  index("routine_changes_date_idx").on(t.tenantId, t.classDate),
  index("routine_changes_new_date_idx").on(t.tenantId, t.newDate),
  foreignKey({ name: "routine_changes_batch_subject_fk", columns: [t.tenantId, t.batchSubjectId], foreignColumns: [batchSubjects.tenantId, batchSubjects.id] }),
  foreignKey({ name: "routine_changes_substitute_fk", columns: [t.tenantId, t.substituteInstructorId], foreignColumns: [instructors.tenantId, instructors.id] }),
  foreignKey({ name: "routine_changes_created_by_fk", columns: [t.tenantId, t.createdBy], foreignColumns: [users.tenantId, users.id] }),
  foreignKey({ name: "routine_changes_withdrawn_by_fk", columns: [t.tenantId, t.withdrawnBy], foreignColumns: [users.tenantId, users.id] }),
  check(
    "routine_changes_shape",
    sql`(${t.kind} = 'CANCEL' AND ${t.reason} IS NOT NULL AND ${t.newDate} IS NULL AND ${t.substituteInstructorId} IS NULL)
     OR (${t.kind} = 'RESCHEDULE' AND ${t.newDate} IS NOT NULL AND ${t.newStartsAt} IS NOT NULL AND ${t.newEndsAt} IS NOT NULL AND ${t.newStartsAt} < ${t.newEndsAt} AND ${t.substituteInstructorId} IS NULL)
     OR (${t.kind} = 'SUBSTITUTE' AND ${t.substituteInstructorId} IS NOT NULL AND ${t.newDate} IS NULL)`,
  ),
  check("routine_changes_withdrawn", sql`(${t.withdrawnAt} IS NULL) = (${t.withdrawnBy} IS NULL)`),
]);

/** An institute holiday (D114): every class on these dates is cancelled. Withdrawn rather than deleted. */
export const holidays = pgTable("holidays", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  fromDate: date("from_date").notNull(),
  toDate: date("to_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by").notNull(),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  withdrawnBy: uuid("withdrawn_by"),
}, (t) => [
  unique("holidays_tenant_id_unique").on(t.tenantId, t.id),
  index("holidays_dates_idx").on(t.tenantId, t.fromDate, t.toDate),
  foreignKey({ name: "holidays_created_by_fk", columns: [t.tenantId, t.createdBy], foreignColumns: [users.tenantId, users.id] }),
  foreignKey({ name: "holidays_withdrawn_by_fk", columns: [t.tenantId, t.withdrawnBy], foreignColumns: [users.tenantId, users.id] }),
  check("holidays_dates", sql`${t.fromDate} <= ${t.toDate}`),
  check("holidays_withdrawn", sql`(${t.withdrawnAt} IS NULL) = (${t.withdrawnBy} IS NULL)`),
]);

/** One topic of a batch subject's lesson plan (D118–D120): status set by hand; Overdue is derived (D119). */
export const lessonTopics = pgTable("lesson_topics", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  batchSubjectId: uuid("batch_subject_id").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  startDate: date("start_date"),
  targetDate: date("target_date"),
  status: lessonTopicStatusEnum("status").notNull().default("PENDING"),
  completedOn: date("completed_on"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
}, (t) => [
  unique("lesson_topics_tenant_id_unique").on(t.tenantId, t.id),
  index("lesson_topics_batch_subject_idx").on(t.tenantId, t.batchSubjectId, t.position),
  foreignKey({ name: "lesson_topics_batch_subject_fk", columns: [t.tenantId, t.batchSubjectId], foreignColumns: [batchSubjects.tenantId, batchSubjects.id] }),
  check("lesson_topics_dates", sql`${t.startDate} IS NULL OR ${t.targetDate} IS NULL OR ${t.startDate} <= ${t.targetDate}`),
  check("lesson_topics_completed", sql`(${t.status} = 'COMPLETED') = (${t.completedOn} IS NOT NULL)`),
]);
