import { check, date, foreignKey, index, pgEnum, pgTable, text, time, timestamp, unique, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { batchSubjects } from "./academic";
import { users } from "./core";
import { batchMemberships, students } from "./students";

// Attendance & Leave (paid module `attendance`):,,.

export const attendanceClassSourceEnum = pgEnum("attendance_class_source", ["SCHEDULED", "EXTRA"]);
export const attendanceClassStateEnum = pgEnum("attendance_class_state", ["OPEN", "TAKEN", "NOT_HELD"]);
export const attendanceStatusEnum = pgEnum("attendance_status", ["PRESENT", "ABSENT", "LATE", "EXCUSED"]);
export const leaveStatusEnum = pgEnum("leave_status", ["PENDING", "APPROVED", "REJECTED", "WITHDRAWN", "REVOKED"]);
export const leaveSourceEnum = pgEnum("leave_source", ["STUDENT", "OFFICE"]);

/**
 * One class of a batch subject on a date: from its weekly schedule (identified by date and start time, so later
 * schedule changes don't touch it) or an extra class. Created when its
 * register is first saved or it's marked not held, or when an extra class is added.
 */
export const attendanceClasses = pgTable("attendance_classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  batchSubjectId: uuid("batch_subject_id").notNull(),
  source: attendanceClassSourceEnum("source").notNull(),
  // The Bangladesh calendar date the class is on.
  classDate: date("class_date").notNull(),
  startsAt: time("starts_at").notNull(),
  endsAt: time("ends_at").notNull(),
  state: attendanceClassStateEnum("state").notNull(),
  notHeldReason: varchar("not_held_reason", { length: 300 }),
  takenAt: timestamp("taken_at", { withTimezone: true }),
  takenBy: uuid("taken_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("attendance_classes_tenant_id_unique").on(t.tenantId, t.id),
  unique("attendance_classes_subject_date_start_unique").on(t.tenantId, t.batchSubjectId, t.classDate, t.startsAt),
  index("attendance_classes_date_idx").on(t.tenantId, t.classDate),
  // Kept with its history: a batch subject that has registers can't be removed (reference counter).
  foreignKey({ name: "attendance_classes_batch_subject_fk", columns: [t.tenantId, t.batchSubjectId], foreignColumns: [batchSubjects.tenantId, batchSubjects.id] }),
  foreignKey({ name: "attendance_classes_taken_by_fk", columns: [t.tenantId, t.takenBy], foreignColumns: [users.tenantId, users.id] }),
  check("attendance_classes_times", sql`${t.startsAt} < ${t.endsAt}`),
  check("attendance_classes_not_held", sql`(${t.state} = 'NOT_HELD') = (${t.notHeldReason} IS NOT NULL)`),
]);

/** A student's leave. Office entries are approved at once. */
export const leaveApplications = pgTable("leave_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  studentId: uuid("student_id").notNull(),
  fromDate: date("from_date").notNull(),
  toDate: date("to_date").notNull(),
  reason: text("reason").notNull(),
  source: leaveSourceEnum("source").notNull(),
  status: leaveStatusEnum("status").notNull(),
  appliedBy: uuid("applied_by").notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  // The approval or rejection (with an optional note the student sees), or the revocation (with its reason).
  decidedBy: uuid("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decisionNote: varchar("decision_note", { length: 300 }),
  revokedBy: uuid("revoked_by"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokeReason: varchar("revoke_reason", { length: 300 }),
}, (t) => [
  unique("leave_applications_tenant_id_unique").on(t.tenantId, t.id),
  index("leave_applications_student_idx").on(t.tenantId, t.studentId, t.fromDate),
  index("leave_applications_status_idx").on(t.tenantId, t.status),
  foreignKey({ name: "leave_applications_student_fk", columns: [t.tenantId, t.studentId], foreignColumns: [students.tenantId, students.id] }),
  foreignKey({ name: "leave_applications_applied_by_fk", columns: [t.tenantId, t.appliedBy], foreignColumns: [users.tenantId, users.id] }),
  check("leave_applications_dates", sql`${t.fromDate} <= ${t.toDate}`),
  check("leave_applications_revoked", sql`(${t.status} = 'REVOKED') = (${t.revokeReason} IS NOT NULL)`),
]);

/**
 * A student in one class. `status` is what a person marked (null until marked); `leaveId` is the approved leave covering
 * the class, if any. The effective status is Excused while that leave stands, otherwise the marked status.
 */
export const attendanceMarks = pgTable("attendance_marks", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  classId: uuid("class_id").notNull(),
  studentId: uuid("student_id").notNull(),
  membershipId: uuid("membership_id").notNull(),
  status: attendanceStatusEnum("status"),
  leaveId: uuid("leave_id"),
  markedAt: timestamp("marked_at", { withTimezone: true }),
  markedBy: uuid("marked_by"),
}, (t) => [
  unique("attendance_marks_tenant_id_unique").on(t.tenantId, t.id),
  uniqueIndex("attendance_marks_class_student_unique").on(t.tenantId, t.classId, t.studentId),
  index("attendance_marks_student_idx").on(t.tenantId, t.studentId),
  index("attendance_marks_leave_idx").on(t.tenantId, t.leaveId),
  foreignKey({ name: "attendance_marks_class_fk", columns: [t.tenantId, t.classId], foreignColumns: [attendanceClasses.tenantId, attendanceClasses.id] }),
  foreignKey({ name: "attendance_marks_student_fk", columns: [t.tenantId, t.studentId], foreignColumns: [students.tenantId, students.id] }),
  foreignKey({ name: "attendance_marks_membership_fk", columns: [t.tenantId, t.membershipId], foreignColumns: [batchMemberships.tenantId, batchMemberships.id] }),
  foreignKey({ name: "attendance_marks_leave_fk", columns: [t.tenantId, t.leaveId], foreignColumns: [leaveApplications.tenantId, leaveApplications.id] }),
  foreignKey({ name: "attendance_marks_marked_by_fk", columns: [t.tenantId, t.markedBy], foreignColumns: [users.tenantId, users.id] }),
]);
