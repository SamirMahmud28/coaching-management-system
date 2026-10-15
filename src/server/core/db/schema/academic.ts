import { check, foreignKey, index, pgEnum, pgTable, primaryKey, smallint, text, time, timestamp, unique, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenants } from "./core";
import { instructors } from "./instructors";

// Course → Subject → Batch. Records with history are archived, never deleted once in use.

export const academicStatusEnum = pgEnum("academic_status", ["ACTIVE", "ARCHIVED"]);
// Bangladesh's week starts on Saturday.
export const weekdayEnum = pgEnum("weekday", ["SAT", "SUN", "MON", "TUE", "WED", "THU", "FRI"]);

export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 100 }).notNull(),
  // Goes into student IDs when the pattern includes it, so it starts with a letter and can't read as a phone number.
  code: varchar("code", { length: 10 }).notNull(),
  description: text("description"),
  // Day of the month monthly fees fall due; used by the Fees module. 1–28, or 31 for the last day.
  dueDay: smallint("due_day"),
  status: academicStatusEnum("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  updatedBy: uuid("updated_by"),
}, (t) => [
  unique("courses_tenant_id_unique").on(t.tenantId, t.id),
  uniqueIndex("courses_tenant_name_lower_idx").on(t.tenantId, sql`lower(${t.name})`),
  uniqueIndex("courses_tenant_code_idx").on(t.tenantId, t.code),
  check("courses_code_format", sql`${t.code} ~ '^[A-Z][A-Z0-9]{0,9}$'`),
  check("courses_due_day", sql`${t.dueDay} IS NULL OR ${t.dueDay} BETWEEN 1 AND 28 OR ${t.dueDay} = 31`),
]);

export const subjects = pgTable("subjects", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  courseId: uuid("course_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  status: academicStatusEnum("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("subjects_tenant_id_unique").on(t.tenantId, t.id),
  // Lets a batch subject require the subject to belong to the batch's course.
  unique("subjects_tenant_course_id_unique").on(t.tenantId, t.courseId, t.id),
  uniqueIndex("subjects_tenant_course_name_lower_idx").on(t.tenantId, t.courseId, sql`lower(${t.name})`),
  foreignKey({ name: "subjects_course_fk", columns: [t.tenantId, t.courseId], foreignColumns: [courses.tenantId, courses.id] }),
]);

export const batches = pgTable("batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  courseId: uuid("course_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  status: academicStatusEnum("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  updatedBy: uuid("updated_by"),
}, (t) => [
  unique("batches_tenant_id_unique").on(t.tenantId, t.id),
  unique("batches_tenant_course_id_unique").on(t.tenantId, t.courseId, t.id),
  uniqueIndex("batches_tenant_course_name_lower_idx").on(t.tenantId, t.courseId, sql`lower(${t.name})`),
  index("batches_tenant_status_idx").on(t.tenantId, t.status),
  foreignKey({ name: "batches_course_fk", columns: [t.tenantId, t.courseId], foreignColumns: [courses.tenantId, courses.id] }),
]);

/** A subject taught in a batch. Both composite FKs carry the course, so the subject must be the batch's course's. */
export const batchSubjects = pgTable("batch_subjects", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  courseId: uuid("course_id").notNull(),
  batchId: uuid("batch_id").notNull(),
  subjectId: uuid("subject_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("batch_subjects_tenant_id_unique").on(t.tenantId, t.id),
  unique("batch_subjects_batch_subject_unique").on(t.tenantId, t.batchId, t.subjectId),
  foreignKey({ name: "batch_subjects_batch_fk", columns: [t.tenantId, t.courseId, t.batchId], foreignColumns: [batches.tenantId, batches.courseId, batches.id] }).onDelete("cascade"),
  foreignKey({ name: "batch_subjects_subject_fk", columns: [t.tenantId, t.courseId, t.subjectId], foreignColumns: [subjects.tenantId, subjects.courseId, subjects.id] }),
]);

/** Who teaches a subject in a batch. The source of an instructor's "own batches". */
export const batchSubjectInstructors = pgTable("batch_subject_instructors", {
  tenantId: uuid("tenant_id").notNull(),
  batchSubjectId: uuid("batch_subject_id").notNull(),
  instructorId: uuid("instructor_id").notNull(),
}, (t) => [
  primaryKey({ name: "batch_subject_instructors_pk", columns: [t.tenantId, t.batchSubjectId, t.instructorId] }),
  index("batch_subject_instructors_instructor_idx").on(t.tenantId, t.instructorId),
  foreignKey({ name: "batch_subject_instructors_batch_subject_fk", columns: [t.tenantId, t.batchSubjectId], foreignColumns: [batchSubjects.tenantId, batchSubjects.id] }).onDelete("cascade"),
  foreignKey({ name: "batch_subject_instructors_instructor_fk", columns: [t.tenantId, t.instructorId], foreignColumns: [instructors.tenantId, instructors.id] }),
]);

/** When a subject meets in a batch: the basic schedule, part of Core. The Routine module builds on it. */
export const scheduleSlots = pgTable("schedule_slots", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  batchSubjectId: uuid("batch_subject_id").notNull(),
  weekday: weekdayEnum("weekday").notNull(),
  startsAt: time("starts_at").notNull(),
  endsAt: time("ends_at").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("schedule_slots_tenant_id_unique").on(t.tenantId, t.id),
  unique("schedule_slots_subject_day_start_unique").on(t.tenantId, t.batchSubjectId, t.weekday, t.startsAt),
  check("schedule_slots_order", sql`${t.startsAt} < ${t.endsAt}`),
  foreignKey({ name: "schedule_slots_batch_subject_fk", columns: [t.tenantId, t.batchSubjectId], foreignColumns: [batchSubjects.tenantId, batchSubjects.id] }).onDelete("cascade"),
]);
