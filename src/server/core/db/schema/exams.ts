import { boolean, check, date, foreignKey, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { batches, courses, subjects } from "./academic";
import { tenants, users } from "./core";
import { students } from "./students";

// Exams & Results (paid module `exams`): D24, D26, D27, D101–D110. Marks are numeric(7,2) (D104); results are
// calculated from the marks each time, never stored, so a correction after publishing updates the result (D107).

export const examKindEnum = pgEnum("exam_kind", ["WEEKLY", "MONTHLY", "MODEL", "CUSTOM"]);
export const examStateEnum = pgEnum("exam_state", ["DRAFT", "PUBLISHED"]);

/** The institute's grading scale (D102): [{ grade, minPercent, gradePoint }]. No row means the BD 5.0 default. */
export const gradeScales = pgTable("grade_scales", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id),
  bands: jsonb("bands").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
});

/** An exam of one course (D101), sat by one or more of its batches; published as a whole (D110). */
export const exams = pgTable("exams", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  courseId: uuid("course_id").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  // A label only: weekly, monthly, model or custom.
  kind: examKindEnum("kind").notNull(),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on").notNull(),
  syllabus: text("syllabus"),
  // Grades and GPA on results, or marks only (D102).
  showGrades: boolean("show_grades").notNull().default(true),
  state: examStateEnum("state").notNull().default("DRAFT"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  publishedBy: uuid("published_by"),
  // The grading scale at publishing (D112): a published exam is graded with it, whatever the institute's scale becomes.
  publishedScale: jsonb("published_scale"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
}, (t) => [
  unique("exams_tenant_id_unique").on(t.tenantId, t.id),
  // Lets batches and papers prove (by foreign key) that they belong to the exam's course (D101).
  unique("exams_tenant_id_course_unique").on(t.tenantId, t.id, t.courseId),
  index("exams_course_idx").on(t.tenantId, t.courseId, t.startsOn),
  foreignKey({ name: "exams_course_fk", columns: [t.tenantId, t.courseId], foreignColumns: [courses.tenantId, courses.id] }),
  foreignKey({ name: "exams_published_by_fk", columns: [t.tenantId, t.publishedBy], foreignColumns: [users.tenantId, users.id] }),
  check("exams_dates", sql`${t.startsOn} <= ${t.endsOn}`),
  check("exams_published", sql`(${t.state} = 'PUBLISHED') = (${t.publishedAt} IS NOT NULL)`),
  check("exams_published_scale", sql`(${t.state} = 'PUBLISHED') = (${t.publishedScale} IS NOT NULL)`),
]);

/** The batches that sit an exam; the foreign keys make sure they are batches of the exam's course. */
export const examBatches = pgTable("exam_batches", {
  tenantId: uuid("tenant_id").notNull(),
  examId: uuid("exam_id").notNull(),
  courseId: uuid("course_id").notNull(),
  batchId: uuid("batch_id").notNull(),
}, (t) => [
  primaryKey({ name: "exam_batches_pk", columns: [t.tenantId, t.examId, t.batchId] }),
  index("exam_batches_batch_idx").on(t.tenantId, t.batchId),
  foreignKey({ name: "exam_batches_exam_fk", columns: [t.tenantId, t.examId, t.courseId], foreignColumns: [exams.tenantId, exams.id, exams.courseId] }).onDelete("cascade"),
  foreignKey({ name: "exam_batches_batch_fk", columns: [t.tenantId, t.courseId, t.batchId], foreignColumns: [batches.tenantId, batches.courseId, batches.id] }),
]);

/** One subject paper of an exam (D101): full and pass marks; optional marks the BD 4th subject (D108). */
export const examPapers = pgTable("exam_papers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  examId: uuid("exam_id").notNull(),
  courseId: uuid("course_id").notNull(),
  subjectId: uuid("subject_id").notNull(),
  fullMarks: numeric("full_marks", { precision: 7, scale: 2 }).notNull(),
  passMarks: numeric("pass_marks", { precision: 7, scale: 2 }).notNull(),
  optional: boolean("optional").notNull().default(false),
  position: integer("position").notNull().default(0),
}, (t) => [
  unique("exam_papers_tenant_id_unique").on(t.tenantId, t.id),
  unique("exam_papers_exam_subject_unique").on(t.tenantId, t.examId, t.subjectId),
  // Subjects of the exam's course only (D101).
  foreignKey({ name: "exam_papers_exam_fk", columns: [t.tenantId, t.examId, t.courseId], foreignColumns: [exams.tenantId, exams.id, exams.courseId] }).onDelete("cascade"),
  foreignKey({ name: "exam_papers_subject_fk", columns: [t.tenantId, t.courseId, t.subjectId], foreignColumns: [subjects.tenantId, subjects.courseId, subjects.id] }),
  check("exam_papers_marks", sql`${t.fullMarks} > 0 AND ${t.passMarks} >= 0 AND ${t.passMarks} <= ${t.fullMarks}`),
]);

/** A part of a paper (e.g. Written, MCQ), with its own full marks and, optionally, its own pass mark (D101, D105). */
export const examPaperParts = pgTable("exam_paper_parts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  paperId: uuid("paper_id").notNull(),
  name: varchar("name", { length: 40 }).notNull(),
  fullMarks: numeric("full_marks", { precision: 7, scale: 2 }).notNull(),
  passMarks: numeric("pass_marks", { precision: 7, scale: 2 }),
  position: integer("position").notNull().default(0),
}, (t) => [
  unique("exam_paper_parts_tenant_id_unique").on(t.tenantId, t.id),
  unique("exam_paper_parts_paper_name_unique").on(t.tenantId, t.paperId, t.name),
  foreignKey({ name: "exam_paper_parts_paper_fk", columns: [t.tenantId, t.paperId], foreignColumns: [examPapers.tenantId, examPapers.id] }).onDelete("cascade"),
  check("exam_paper_parts_marks", sql`${t.fullMarks} > 0 AND (${t.passMarks} IS NULL OR (${t.passMarks} >= 0 AND ${t.passMarks} <= ${t.fullMarks}))`),
]);

/**
 * One student's mark in one paper: the mark (for a paper without parts) or Absent (D106). A paper with parts keeps
 * its marks in exam_mark_parts. No row means not entered yet.
 */
export const examMarks = pgTable("exam_marks", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  paperId: uuid("paper_id").notNull(),
  studentId: uuid("student_id").notNull(),
  absent: boolean("absent").notNull().default(false),
  obtained: numeric("obtained", { precision: 7, scale: 2 }),
  enteredBy: uuid("entered_by").notNull(),
  enteredAt: timestamp("entered_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("exam_marks_tenant_id_unique").on(t.tenantId, t.id),
  unique("exam_marks_paper_student_unique").on(t.tenantId, t.paperId, t.studentId),
  index("exam_marks_student_idx").on(t.tenantId, t.studentId),
  foreignKey({ name: "exam_marks_paper_fk", columns: [t.tenantId, t.paperId], foreignColumns: [examPapers.tenantId, examPapers.id] }),
  foreignKey({ name: "exam_marks_student_fk", columns: [t.tenantId, t.studentId], foreignColumns: [students.tenantId, students.id] }),
  foreignKey({ name: "exam_marks_entered_by_fk", columns: [t.tenantId, t.enteredBy], foreignColumns: [users.tenantId, users.id] }),
  check("exam_marks_obtained", sql`${t.obtained} IS NULL OR ${t.obtained} >= 0`),
  check("exam_marks_absent", sql`NOT (${t.absent} AND ${t.obtained} IS NOT NULL)`),
]);

/** A student's mark in one part of a paper (net of any negative marking, D104). */
export const examMarkParts = pgTable("exam_mark_parts", {
  tenantId: uuid("tenant_id").notNull(),
  markId: uuid("mark_id").notNull(),
  partId: uuid("part_id").notNull(),
  obtained: numeric("obtained", { precision: 7, scale: 2 }).notNull(),
}, (t) => [
  primaryKey({ name: "exam_mark_parts_pk", columns: [t.tenantId, t.markId, t.partId] }),
  foreignKey({ name: "exam_mark_parts_mark_fk", columns: [t.tenantId, t.markId], foreignColumns: [examMarks.tenantId, examMarks.id] }).onDelete("cascade"),
  foreignKey({ name: "exam_mark_parts_part_fk", columns: [t.tenantId, t.partId], foreignColumns: [examPaperParts.tenantId, examPaperParts.id] }),
  check("exam_mark_parts_obtained", sql`${t.obtained} >= 0`),
]);
