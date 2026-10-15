import { check, date, foreignKey, index, integer, pgEnum, pgTable, primaryKey, smallint, text, timestamp, unique, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { batches, courses } from "./academic";
import { files, tenants, users } from "./core";
import { genderEnum } from "./instructors";

// Students. Never deleted; Completed and Left keep the full history.

export const studentStatusEnum = pgEnum("student_status", ["ACTIVE", "ON_HOLD", "COMPLETED", "LEFT"]);
export const membershipStatusEnum = pgEnum("membership_status", ["ACTIVE", "COMPLETED", "LEFT"]);
export const guardianRelationEnum = pgEnum("guardian_relation", ["FATHER", "MOTHER", "BROTHER", "SISTER", "UNCLE", "AUNT", "GRANDPARENT", "OTHER"]);

export const students = pgTable("students", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  // The login; its username is the student ID. Only ACTIVE students' logins are unbanned.
  userId: uuid("user_id").notNull(),
  // Issued at admission from the institute's pattern (or typed by an Admin); never changes.
  studentCode: varchar("student_code", { length: 30 }).notNull(),
  fullName: varchar("full_name", { length: 100 }).notNull(),
  gender: genderEnum("gender").notNull(),
  dateOfBirth: date("date_of_birth"),
  // The student's own mobile: contact only, not a sign-in identifier.
  phone: varchar("phone", { length: 11 }),
  schoolName: varchar("school_name", { length: 150 }),
  schoolClass: varchar("school_class", { length: 50 }),
  address: text("address"),
  // Staff-only note; never shown to the student or instructors.
  adminNote: text("admin_note"),
  guardianName: varchar("guardian_name", { length: 100 }).notNull(),
  guardianRelation: guardianRelationEnum("guardian_relation").notNull(),
  guardianPhone: varchar("guardian_phone", { length: 11 }).notNull(),
  // Single-column on purpose: ON DELETE SET NULL on a composite key would null tenant_id. Checked by assertFileReference.
  photoFileId: uuid("photo_file_id").references(() => files.id, { onDelete: "set null" }),
  admissionDate: date("admission_date").notNull(),
  // The course chosen at admission; its code is in the ID when the pattern includes it.
  admissionCourseId: uuid("admission_course_id"),
  status: studentStatusEnum("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  updatedBy: uuid("updated_by"),
}, (t) => [
  unique("students_tenant_id_unique").on(t.tenantId, t.id),
  unique("students_tenant_user_unique").on(t.tenantId, t.userId),
  uniqueIndex("students_tenant_code_lower_idx").on(t.tenantId, sql`lower(${t.studentCode})`),
  index("students_tenant_status_name_idx").on(t.tenantId, t.status, t.fullName),
  foreignKey({ name: "students_user_fk", columns: [t.tenantId, t.userId], foreignColumns: [users.tenantId, users.id] }),
  foreignKey({ name: "students_admission_course_fk", columns: [t.tenantId, t.admissionCourseId], foreignColumns: [courses.tenantId, courses.id] }),
  check("students_guardian_phone", sql`${t.guardianPhone} ~ '^01[3-9][0-9]{8}$'`),
  check("students_phone", sql`${t.phone} IS NULL OR ${t.phone} ~ '^01[3-9][0-9]{8}$'`),
]);

/**
 * The running number of generated student IDs: per (institute, scope, admission year), where the scope is the
 * course id when the pattern includes the course code, otherwise "ALL". The row is locked while a number is taken.
 */
export const studentIdCounters = pgTable("student_id_counters", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  scope: varchar("scope", { length: 36 }).notNull(),
  year: smallint("year").notNull(),
  nextValue: integer("next_value").notNull().default(1),
}, (t) => [primaryKey({ name: "student_id_counters_pk", columns: [t.tenantId, t.scope, t.year] })]);

/** Every overall status change, with its reason. Append-only. */
export const studentStatusHistory = pgTable("student_status_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  studentId: uuid("student_id").notNull(),
  // Null for the admission entry.
  fromStatus: studentStatusEnum("from_status"),
  toStatus: studentStatusEnum("to_status").notNull(),
  reason: text("reason"),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  changedBy: uuid("changed_by"),
}, (t) => [
  index("student_status_history_student_idx").on(t.tenantId, t.studentId, t.changedAt),
  foreignKey({ name: "student_status_history_student_fk", columns: [t.tenantId, t.studentId], foreignColumns: [students.tenantId, students.id] }),
]);

/**
 * A student's place in a batch: its own status and dates. A closed membership stays closed; rejoining adds a new
 * one. The roll number is optional and unique among the batch's active members.
 */
export const batchMemberships = pgTable("batch_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  studentId: uuid("student_id").notNull(),
  batchId: uuid("batch_id").notNull(),
  status: membershipStatusEnum("status").notNull().default("ACTIVE"),
  startedOn: date("started_on").notNull(),
  endedOn: date("ended_on"),
  rollNumber: varchar("roll_number", { length: 10 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  updatedBy: uuid("updated_by"),
}, (t) => [
  unique("batch_memberships_tenant_id_unique").on(t.tenantId, t.id),
  uniqueIndex("batch_memberships_active_unique").on(t.tenantId, t.studentId, t.batchId).where(sql`${t.status} = 'ACTIVE'`),
  uniqueIndex("batch_memberships_active_roll_unique").on(t.tenantId, t.batchId, sql`lower(${t.rollNumber})`).where(sql`${t.status} = 'ACTIVE' AND ${t.rollNumber} IS NOT NULL`),
  index("batch_memberships_batch_idx").on(t.tenantId, t.batchId, t.status),
  index("batch_memberships_student_idx").on(t.tenantId, t.studentId),
  foreignKey({ name: "batch_memberships_student_fk", columns: [t.tenantId, t.studentId], foreignColumns: [students.tenantId, students.id] }),
  foreignKey({ name: "batch_memberships_batch_fk", columns: [t.tenantId, t.batchId], foreignColumns: [batches.tenantId, batches.id] }),
  check("batch_memberships_dates", sql`(${t.status} = 'ACTIVE') = (${t.endedOn} IS NULL) AND (${t.endedOn} IS NULL OR ${t.endedOn} >= ${t.startedOn})`),
]);
