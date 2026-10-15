import sharp from "sharp";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../core/testing/db";
import { batchMemberships, instructors, permissions as permissionRows, rateLimits, rolePermissions, roles, signatures, tenants, userRoles } from "../core/db/schema";
import type { Db } from "../core/db/types";
import { seedPlatformCatalog } from "../core/db/seed";
import { uploadFile } from "../core/files/service";
import { LocalDiskStorage } from "../core/files/storage";
import { INSTITUTE_OWNER_ROLE, ROLE_TEMPLATES, type PermissionName } from "../core/rbac/catalog";
import * as academic from "./academic/service";
import { createAcademicHandlers } from "./academic/http";
import { createLogin } from "./auth/credentials";
import { createTenantAuth } from "./auth/tenant-auth";
import { createAttendanceHandlers } from "./attendance/http";
import { createExamsHandlers } from "./exams/http";
import { createRoutineHandlers } from "./routine/http";
import { createWebsiteHandlers } from "./website/http";
import { createDashboardHandlers } from "./dashboard/http";
import * as routineService from "./routine/service";
import * as lessonService from "./routine/lessons";
import * as websiteContent from "./website/content";
import * as websiteEnquiries from "./website/enquiries";
import * as websiteShowcase from "./website/showcase";
import * as examSetup from "./exams/setup";
import { createFeesHandlers } from "./fees/http";
import { createFilesHandlers } from "./files/http";
import { setModules } from "../core/testing/modules";
import * as feeSetup from "./fees/setup";
import * as feeCharges from "./fees/charges";
import * as feePayments from "./fees/payments";
import * as leave from "./attendance/leave";
import { todayInDhaka } from "@/lib/dates";
import { createInstituteHandlers } from "./institute/http";
import { createInstructorHandlers } from "./instructors/http";
import { seedBaselineRoles } from "./rbac/service";
import { createSettingsHandlers } from "./settings/http";
import { createStudentHandlers } from "./students/http";
import * as students from "./students/service";

/**
 * The access matrix: every institute API handler × signed-out × each baseline role ×
 * a single-permission role per permission × a suspended institute × another institute's ids. Paid-module columns
 * join with each module. The catalogue of handlers below must name every handler and every route, or this fails.
 */

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;
const host = { baseDomain: "localhost:3000", platformHost: "admin.localhost:3000" };
const auth = createTenantAuth(db, { secret: "test-secret-".padEnd(40, "x"), host, protocol: "http" });
let storage: LocalDiskStorage;

const DUMMY = "00000000-0000-4000-8000-000000000000";
type Entity = "COURSE" | "SUBJECT" | "BATCH" | "BATCH_SUBJECT" | "SCHEDULE_SLOT" | "STUDENT" | "MEMBERSHIP" | "INSTRUCTOR" | "USER" | "SIGNATURE" | "FILE" | "FEE_ITEM" | "STUDENT_FEE_AMOUNT" | "FEE_RUN" | "FEE_CHARGE" | "FEE_PAYMENT" | "LEAVE" | "EXAM" | "EXAM_PAPER" | "ROUTINE_CHANGE" | "HOLIDAY" | "LESSON_TOPIC" | "NOTICE" | "GALLERY_PHOTO" | "TESTIMONIAL" | "ENQUIRY" | "FACULTY" | "ACHIEVER";
type Factory = "academic" | "students" | "instructors" | "institute" | "settings" | "files" | "fees" | "attendance" | "exams" | "routine" | "website" | "dashboard";
/** Paid modules: each handler of these factories is refused while its module is off. */
const PAID: Partial<Record<Factory, "fees" | "attendance" | "exams" | "routine" | "website">> = { fees: "fees", attendance: "attendance", exams: "exams", routine: "routine", website: "website" };
const TODAY = todayInDhaka();

interface Entry {
  factory: Factory;
  name: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** The permission the guard must demand; "signed-in" for handlers any institute user may call. */
  permission: PermissionName | "signed-in";
  /** The entity a path id names, for the cross-institute column. */
  id?: Entity;
  /** A well-formed body, so a request with another institute's id reaches the id lookup. */
  body?: unknown;
  /** A well-formed query string, for the same reason. */
  query?: Record<string, string>;
}

const student = {
  full_name: "Matrix Student", gender: "MALE", guardian_name: "G", guardian_relation: "FATHER", guardian_phone: "01711000111", temporary_password: "Student123",
};

const HANDLERS: Entry[] = [
  // academic
  { factory: "academic", name: "listCourses", method: "GET", permission: "academic.view" },
  { factory: "academic", name: "createCourse", method: "POST", permission: "academic.manage", body: { name: "Matrix", code: "MTX" } },
  { factory: "academic", name: "getCourse", method: "GET", permission: "academic.view", id: "COURSE" },
  { factory: "academic", name: "updateCourse", method: "PATCH", permission: "academic.manage", id: "COURSE", body: { name: "Renamed" } },
  { factory: "academic", name: "setCourseStatus", method: "PATCH", permission: "academic.manage", id: "COURSE", body: { status: "ARCHIVED" } },
  { factory: "academic", name: "deleteCourse", method: "DELETE", permission: "academic.manage", id: "COURSE" },
  { factory: "academic", name: "createSubject", method: "POST", permission: "academic.manage", id: "COURSE", body: { name: "Matrix subject" } },
  { factory: "academic", name: "updateSubject", method: "PATCH", permission: "academic.manage", id: "SUBJECT", body: { name: "Renamed" } },
  { factory: "academic", name: "deleteSubject", method: "DELETE", permission: "academic.manage", id: "SUBJECT" },
  { factory: "academic", name: "listBatches", method: "GET", permission: "academic.view" },
  { factory: "academic", name: "createBatch", method: "POST", permission: "academic.manage", id: "COURSE", body: { name: "Matrix batch" } },
  { factory: "academic", name: "getBatch", method: "GET", permission: "academic.view", id: "BATCH" },
  { factory: "academic", name: "updateBatch", method: "PATCH", permission: "academic.manage", id: "BATCH", body: { name: "Renamed" } },
  { factory: "academic", name: "deleteBatch", method: "DELETE", permission: "academic.manage", id: "BATCH" },
  { factory: "academic", name: "addBatchSubject", method: "POST", permission: "academic.manage", id: "BATCH", body: { subject_id: DUMMY } },
  { factory: "academic", name: "removeBatchSubject", method: "DELETE", permission: "academic.manage", id: "BATCH_SUBJECT" },
  { factory: "academic", name: "setInstructors", method: "PUT", permission: "academic.manage", id: "BATCH_SUBJECT", body: { instructor_ids: [] } },
  { factory: "academic", name: "addSlot", method: "POST", permission: "academic.manage", id: "BATCH_SUBJECT", body: { weekday: "FRI", starts_at: "07:00", ends_at: "08:00" } },
  { factory: "academic", name: "removeSlot", method: "DELETE", permission: "academic.manage", id: "SCHEDULE_SLOT" },
  { factory: "academic", name: "assignableInstructors", method: "GET", permission: "academic.manage" },
  // students
  { factory: "students", name: "list", method: "GET", permission: "students.view" },
  { factory: "students", name: "admit", method: "POST", permission: "students.create", body: student },
  { factory: "students", name: "get", method: "GET", permission: "students.view", id: "STUDENT" },
  { factory: "students", name: "update", method: "PATCH", permission: "students.update", id: "STUDENT", body: { school_class: "X" } },
  { factory: "students", name: "setStatus", method: "PATCH", permission: "students.status", id: "STUDENT", body: { status: "ON_HOLD" } },
  { factory: "students", name: "resetPassword", method: "POST", permission: "students.update", id: "STUDENT", body: { temporary_password: "NewPass123" } },
  { factory: "students", name: "addMembership", method: "POST", permission: "students.batches.manage", id: "STUDENT", body: { batch_id: DUMMY } },
  { factory: "students", name: "setRoll", method: "PATCH", permission: "students.batches.manage", id: "MEMBERSHIP", body: { roll_number: "7" } },
  { factory: "students", name: "endMembership", method: "POST", permission: "students.batches.manage", id: "MEMBERSHIP", body: { status: "LEFT" } },
  { factory: "students", name: "batchStudents", method: "GET", permission: "students.view", id: "BATCH" },
  // instructors
  { factory: "instructors", name: "list", method: "GET", permission: "instructors.view" },
  { factory: "instructors", name: "get", method: "GET", permission: "instructors.view", id: "INSTRUCTOR" },
  { factory: "instructors", name: "create", method: "POST", permission: "instructors.manage", body: { full_name: "Matrix Teacher", email: "mt@x.test", temporary_password: "TeachPass1" } },
  { factory: "instructors", name: "update", method: "PATCH", permission: "instructors.manage", id: "INSTRUCTOR", body: { address: "X" } },
  { factory: "instructors", name: "setStatus", method: "PATCH", permission: "instructors.status", id: "INSTRUCTOR", body: { status: "INACTIVE" } },
  { factory: "instructors", name: "resetPassword", method: "POST", permission: "instructors.manage", id: "INSTRUCTOR", body: { temporary_password: "NewPass123" } },
  // institute
  { factory: "institute", name: "listModules", method: "GET", permission: "modules.view" },
  { factory: "institute", name: "requestModule", method: "POST", permission: "modules.view", body: { module_key: "fees" } },
  { factory: "institute", name: "auditLog", method: "GET", permission: "audit.view" },
  { factory: "institute", name: "listRoles", method: "GET", permission: "users.view" },
  { factory: "institute", name: "listUsers", method: "GET", permission: "users.view" },
  { factory: "institute", name: "createUser", method: "POST", permission: "users.manage", body: { name: "Matrix", email: "matrix@x.test", role_ids: [], temporary_password: "SomePass1" } },
  { factory: "institute", name: "setRoles", method: "PUT", permission: "users.manage", id: "USER", body: { role_ids: [] } },
  { factory: "institute", name: "setStatus", method: "PATCH", permission: "users.manage", id: "USER", body: { disabled: true } },
  { factory: "institute", name: "resetPassword", method: "POST", permission: "users.manage", id: "USER", body: { temporary_password: "NewPass123" } },
  // settings
  // dashboard: composite widgets are signed-in and include only the sections the user's permissions allow
  { factory: "dashboard", name: "summary", method: "GET", permission: "signed-in" },
  { factory: "dashboard", name: "attendance", method: "GET", permission: "attendance.report.view" },
  { factory: "dashboard", name: "classes", method: "GET", permission: "attendance.view" },
  { factory: "dashboard", name: "fees", method: "GET", permission: "fees.report.view" },
  { factory: "dashboard", name: "attention", method: "GET", permission: "signed-in" },
  { factory: "dashboard", name: "upcoming", method: "GET", permission: "signed-in" },
  { factory: "dashboard", name: "setup", method: "GET", permission: "academic.manage" },
  { factory: "settings", name: "getProfile", method: "GET", permission: "signed-in" },
  { factory: "settings", name: "saveProfile", method: "PUT", permission: "settings.manage", body: { display_name: "Matrix Institute" } },
  { factory: "settings", name: "getAppearance", method: "GET", permission: "settings.manage" },
  { factory: "settings", name: "saveAppearance", method: "PUT", permission: "settings.manage", body: { app_theme: "PLUM" } },
  { factory: "settings", name: "listSignatures", method: "GET", permission: "settings.manage" },
  { factory: "settings", name: "getStudentIdPattern", method: "GET", permission: "settings.manage" },
  { factory: "settings", name: "saveStudentIdPattern", method: "PUT", permission: "settings.manage", body: { prefix: "MX", include_course_code: false, separator: "-", sequence_width: 4 } },
  { factory: "settings", name: "createSignature", method: "POST", permission: "settings.manage", body: { title: "Principal", person_name: "P" } },
  { factory: "settings", name: "updateSignature", method: "PATCH", permission: "settings.manage", id: "SIGNATURE", body: { title: "Director", person_name: "D" } },
  { factory: "settings", name: "deleteSignature", method: "DELETE", permission: "settings.manage", id: "SIGNATURE" },
  // files: any institute user may call; what they may upload or view is checked per file (canUpload / canViewFile)
  { factory: "files", name: "upload", method: "POST", permission: "signed-in", body: {} },
  { factory: "files", name: "serve", method: "GET", permission: "signed-in", id: "FILE" },
  // fees (paid module): every handler is also refused while the module is off
  { factory: "fees", name: "listItems", method: "GET", permission: "fees.view" },
  { factory: "fees", name: "createItem", method: "POST", permission: "fees.configure", body: { course_id: DUMMY, kind: "MONTHLY", name: "Matrix fee", amount: "100" } },
  { factory: "fees", name: "updateItem", method: "PATCH", permission: "fees.configure", id: "FEE_ITEM", body: { amount: "200" } },
  { factory: "fees", name: "setItemStatus", method: "PATCH", permission: "fees.configure", id: "FEE_ITEM", body: { status: "ARCHIVED" } },
  { factory: "fees", name: "deleteItem", method: "DELETE", permission: "fees.configure", id: "FEE_ITEM" },
  { factory: "fees", name: "studentAmounts", method: "GET", permission: "fees.view", id: "STUDENT" },
  { factory: "fees", name: "setStudentAmount", method: "PUT", permission: "fees.adjust", id: "STUDENT", body: { fee_item_id: DUMMY, amount: "100", reason: "Sibling" } },
  { factory: "fees", name: "removeStudentAmount", method: "DELETE", permission: "fees.adjust", id: "STUDENT_FEE_AMOUNT" },
  { factory: "fees", name: "getSettings", method: "GET", permission: "fees.view" },
  { factory: "fees", name: "saveSettings", method: "PUT", permission: "fees.configure", body: { receipt_prefix: "MX" } },
  { factory: "fees", name: "previewGeneration", method: "POST", permission: "fees.generate", body: { fee_item_id: DUMMY, period: "2026-06" } },
  { factory: "fees", name: "generate", method: "POST", permission: "fees.generate", body: { fee_item_id: DUMMY, period: "2026-06" } },
  { factory: "fees", name: "listRuns", method: "GET", permission: "fees.view" },
  { factory: "fees", name: "cancelRun", method: "POST", permission: "fees.generate", id: "FEE_RUN", body: { reason: "Wrong month" } },
  { factory: "fees", name: "studentCharges", method: "GET", permission: "fees.view", id: "STUDENT" },
  { factory: "fees", name: "addFine", method: "POST", permission: "fees.adjust", id: "STUDENT", body: { amount: "50", reason: "Late" } },
  { factory: "fees", name: "cancelCharge", method: "POST", permission: "fees.generate", id: "FEE_CHARGE", body: { reason: "Wrong" } },
  { factory: "fees", name: "collect", method: "POST", permission: "fees.collect", id: "STUDENT", body: { charge_ids: [DUMMY], method: "CASH", idempotency_key: "00000000-0000-4000-8000-0000000000aa" } },
  { factory: "fees", name: "studentPayments", method: "GET", permission: "fees.view", id: "STUDENT" },
  { factory: "fees", name: "listPayments", method: "GET", permission: "fees.view" },
  { factory: "fees", name: "voidPayment", method: "POST", permission: "fees.payment.void", id: "FEE_PAYMENT", body: { reason: "Wrong student" } },
  { factory: "fees", name: "addWaiver", method: "POST", permission: "fees.waive", id: "FEE_CHARGE", body: { kind: "FIXED", value: "10", reason: "Sibling" } },
  { factory: "fees", name: "addRefund", method: "POST", permission: "fees.refund", id: "FEE_CHARGE", body: { amount: "10", method: "CASH", reason: "Left early" } },
  { factory: "fees", name: "collectionReport", method: "GET", permission: "fees.report.view" },
  { factory: "fees", name: "duesReport", method: "GET", permission: "fees.report.view" },
  { factory: "fees", name: "refundsReport", method: "GET", permission: "fees.report.view" },
  // attendance (paid module)
  { factory: "attendance", name: "classes", method: "GET", permission: "attendance.view" },
  { factory: "attendance", name: "getRegister", method: "GET", permission: "attendance.view", id: "BATCH_SUBJECT", query: { date: TODAY, starts_at: "09:00" } },
  { factory: "attendance", name: "saveRegister", method: "PUT", permission: "attendance.take", id: "BATCH_SUBJECT", body: { date: TODAY, starts_at: "09:00", marks: [] } },
  { factory: "attendance", name: "markNotHeld", method: "POST", permission: "attendance.take", id: "BATCH_SUBJECT", body: { date: TODAY, starts_at: "09:00", reason: "Holiday" } },
  { factory: "attendance", name: "addExtraClass", method: "POST", permission: "attendance.take", id: "BATCH_SUBJECT", body: { date: TODAY, starts_at: "18:00", ends_at: "19:00" } },
  { factory: "attendance", name: "listLeave", method: "GET", permission: "leave.manage" },
  { factory: "attendance", name: "enterLeave", method: "POST", permission: "leave.manage", id: "STUDENT", body: { from_date: TODAY, to_date: TODAY, reason: "Fever" } },
  { factory: "attendance", name: "decideLeave", method: "POST", permission: "leave.manage", id: "LEAVE", body: { decision: "APPROVE" } },
  { factory: "attendance", name: "revokeLeave", method: "POST", permission: "leave.manage", id: "LEAVE", body: { reason: "Entered by mistake" } },
  // a student's own leave: callers without a student record of their own get 404 from the service
  { factory: "attendance", name: "myLeave", method: "GET", permission: "leave.self.apply" },
  { factory: "attendance", name: "applyForLeave", method: "POST", permission: "leave.self.apply", body: { from_date: TODAY, to_date: TODAY, reason: "Fever" } },
  { factory: "attendance", name: "withdrawLeave", method: "POST", permission: "leave.self.apply", id: "LEAVE" },
  { factory: "attendance", name: "reportOptions", method: "GET", permission: "attendance.report.view" },
  { factory: "attendance", name: "monthlyRegister", method: "GET", permission: "attendance.report.view", query: { batch_id: DUMMY, month: TODAY.slice(0, 7) } },
  { factory: "attendance", name: "lowAttendance", method: "GET", permission: "attendance.report.view", query: { from: TODAY, to: TODAY, below: "75" } },
  { factory: "attendance", name: "dailyAbsentees", method: "GET", permission: "attendance.report.view" },
  { factory: "attendance", name: "studentHistory", method: "GET", permission: "attendance.report.view", id: "STUDENT", query: { from: TODAY, to: TODAY } },
  // exams (paid module)
  { factory: "exams", name: "setupOptions", method: "GET", permission: "exams.manage" },
  { factory: "exams", name: "listExams", method: "GET", permission: "exams.view" },
  { factory: "exams", name: "createExam", method: "POST", permission: "exams.manage", body: { course_id: DUMMY, name: "Matrix exam", kind: "WEEKLY", starts_on: TODAY, ends_on: TODAY, batch_ids: [DUMMY], papers: [{ subject_id: DUMMY, full_marks: "20", pass_marks: "7" }] } },
  { factory: "exams", name: "getExam", method: "GET", permission: "exams.view", id: "EXAM" },
  { factory: "exams", name: "updateExam", method: "PUT", permission: "exams.manage", id: "EXAM", body: { name: "Renamed", kind: "WEEKLY", starts_on: TODAY, ends_on: TODAY, batch_ids: [DUMMY], papers: [{ subject_id: DUMMY, full_marks: "20", pass_marks: "7" }] } },
  { factory: "exams", name: "deleteExam", method: "DELETE", permission: "exams.manage", id: "EXAM" },
  { factory: "exams", name: "getGradeScale", method: "GET", permission: "exams.view" },
  { factory: "exams", name: "saveGradeScale", method: "PUT", permission: "exams.manage", body: { bands: [{ grade: "P", min_percent: 40, grade_point: 1 }, { grade: "F", min_percent: 0, grade_point: 0 }] } },
  { factory: "exams", name: "resetGradeScale", method: "DELETE", permission: "exams.manage" },
  { factory: "exams", name: "getRoster", method: "GET", permission: "exams.view", id: "EXAM_PAPER" },
  { factory: "exams", name: "saveMarks", method: "PUT", permission: "exams.marks.enter", id: "EXAM_PAPER", body: { entries: [{ student_id: DUMMY, absent: true }] } },
  { factory: "exams", name: "getResults", method: "GET", permission: "exams.view", id: "EXAM" },
  { factory: "exams", name: "publishExam", method: "POST", permission: "exams.publish", id: "EXAM" },
  // routine (paid module)
  { factory: "routine", name: "routineOptions", method: "GET", permission: "routine.view" },
  { factory: "routine", name: "batchWeek", method: "GET", permission: "routine.view", id: "BATCH" },
  { factory: "routine", name: "instructorWeek", method: "GET", permission: "routine.view", id: "INSTRUCTOR" },
  { factory: "routine", name: "dayView", method: "GET", permission: "routine.view" },
  { factory: "routine", name: "listChanges", method: "GET", permission: "routine.view" },
  { factory: "routine", name: "createChange", method: "POST", permission: "routine.manage", body: { batch_subject_id: DUMMY, class_date: TODAY, starts_at: "09:00", kind: "CANCEL", reason: "Holiday" } },
  { factory: "routine", name: "withdrawChange", method: "POST", permission: "routine.manage", id: "ROUTINE_CHANGE" },
  { factory: "routine", name: "createHoliday", method: "POST", permission: "routine.manage", body: { name: "Matrix holiday", from_date: "2099-01-01" } },
  { factory: "routine", name: "withdrawHoliday", method: "POST", permission: "routine.manage", id: "HOLIDAY" },
  { factory: "routine", name: "lessonOverview", method: "GET", permission: "routine.view" },
  { factory: "routine", name: "lessonPlan", method: "GET", permission: "routine.view", id: "BATCH_SUBJECT" },
  { factory: "routine", name: "addTopic", method: "POST", permission: "lessons.manage", id: "BATCH_SUBJECT", body: { title: "Matrix topic" } },
  { factory: "routine", name: "reorderTopics", method: "PUT", permission: "lessons.manage", id: "BATCH_SUBJECT", body: { topic_ids: [] } },
  { factory: "routine", name: "copyPlan", method: "POST", permission: "routine.manage", id: "BATCH_SUBJECT", body: { from_batch_subject_id: DUMMY } },
  { factory: "routine", name: "updateTopic", method: "PATCH", permission: "lessons.manage", id: "LESSON_TOPIC", body: { status: "ONGOING" } },
  { factory: "routine", name: "deleteTopic", method: "DELETE", permission: "lessons.manage", id: "LESSON_TOPIC" },
  // website (paid module)
  { factory: "website", name: "getSettings", method: "GET", permission: "website.manage" },
  { factory: "website", name: "saveSettings", method: "PUT", permission: "website.manage", body: {
      theme: "BOLD", heading_font: "INTER", sections: [], hero_button: "NONE",
      design: {
        palette: "BRAND", gradient: "AUTO", body_font: "INTER", text_size: "MEDIUM", radius: "MEDIUM", button_style: "SOLID", card_style: "BORDER", density: "COMFORTABLE", background: "PLAIN",
        appearance: "VISITOR", header_style: "SOLID", hero_layout: "THEME", hero_overlay: "MEDIUM", gallery_layout: "GRID", testimonial_layout: "GRID", course_layout: "CARDS",
        notice_layout: "CARDS", faq_layout: "ACCORDION", motion: "NORMAL", language: "EN",
      },
      content: { section_titles: {}, announcement: null, social: {} },
    } },
  { factory: "website", name: "listNotices", method: "GET", permission: "website.manage" },
  { factory: "website", name: "createNotice", method: "POST", permission: "website.manage", body: { title: "Matrix notice", body: "Text" } },
  { factory: "website", name: "updateNotice", method: "PATCH", permission: "website.manage", id: "NOTICE", body: { title: "Matrix notice", body: "Text" } },
  { factory: "website", name: "hideNotice", method: "POST", permission: "website.manage", id: "NOTICE" },
  { factory: "website", name: "showNotice", method: "POST", permission: "website.manage", id: "NOTICE" },
  { factory: "website", name: "listGallery", method: "GET", permission: "website.manage" },
  { factory: "website", name: "addGalleryPhoto", method: "POST", permission: "website.manage", body: { file_id: DUMMY } },
  { factory: "website", name: "updateGalleryPhoto", method: "PATCH", permission: "website.manage", id: "GALLERY_PHOTO", body: { caption: "Matrix" } },
  { factory: "website", name: "removeGalleryPhoto", method: "DELETE", permission: "website.manage", id: "GALLERY_PHOTO" },
  { factory: "website", name: "reorderGallery", method: "PUT", permission: "website.manage", body: { ids: [] } },
  { factory: "website", name: "listTestimonials", method: "GET", permission: "website.manage" },
  { factory: "website", name: "createTestimonial", method: "POST", permission: "website.manage", body: { quote: "Great", name: "Matrix" } },
  { factory: "website", name: "updateTestimonial", method: "PATCH", permission: "website.manage", id: "TESTIMONIAL", body: { quote: "Great", name: "Matrix" } },
  { factory: "website", name: "removeTestimonial", method: "DELETE", permission: "website.manage", id: "TESTIMONIAL" },
  { factory: "website", name: "reorderTestimonials", method: "PUT", permission: "website.manage", body: { ids: [] } },
  { factory: "website", name: "listFaculty", method: "GET", permission: "website.manage" },
  { factory: "website", name: "addFaculty", method: "POST", permission: "website.manage", body: { instructor_id: DUMMY } },
  { factory: "website", name: "updateFaculty", method: "PATCH", permission: "website.manage", id: "FACULTY", body: { line: "Matrix" } },
  { factory: "website", name: "removeFaculty", method: "DELETE", permission: "website.manage", id: "FACULTY" },
  { factory: "website", name: "reorderFaculty", method: "PUT", permission: "website.manage", body: { ids: [] } },
  { factory: "website", name: "listAchievers", method: "GET", permission: "website.manage" },
  { factory: "website", name: "createAchiever", method: "POST", permission: "website.manage", body: { name: "Matrix", result: "GPA 5" } },
  { factory: "website", name: "updateAchiever", method: "PATCH", permission: "website.manage", id: "ACHIEVER", body: { name: "Matrix", result: "GPA 5" } },
  { factory: "website", name: "removeAchiever", method: "DELETE", permission: "website.manage", id: "ACHIEVER" },
  { factory: "website", name: "reorderAchievers", method: "PUT", permission: "website.manage", body: { ids: [] } },
  { factory: "website", name: "listEnquiries", method: "GET", permission: "website.manage", query: { status: "NEW" } },
  { factory: "website", name: "getEnquiry", method: "GET", permission: "website.manage", id: "ENQUIRY" },
  { factory: "website", name: "updateEnquiry", method: "PATCH", permission: "website.manage", id: "ENQUIRY", body: { note: "Called back" } },
  { factory: "website", name: "convertEnquiry", method: "POST", permission: "website.manage", id: "ENQUIRY", body: { student_id: DUMMY } },
];
/** Handlers deliberately outside the matrix, with the reason. */
const OUTSIDE: Partial<Record<Factory, Record<string, string>>> = {
  files: { publicLogo: "public by design: the host's logo while its public page is shown" },
  website: {
    publicImage: "public by design: a picture the website uses, while the module is on and the page is shown (website/settings.test.ts)",
    submitEnquiry: "public by design: the website's enquiry form, spam-checked and rate-limited (website/enquiries.test.ts)",
  },
};

type Handlers = Record<string, (request: Request, params?: { id: string }) => Promise<Response>>;
let factories: Record<Factory, Handlers>;

const HOST = (sub: string) => `${sub}.localhost:3000`;
function call(entry: Entry, sub: string, cookie: string | null, id = DUMMY) {
  const qs = entry.query ? `?${new URLSearchParams(entry.query)}` : "";
  const request = new Request(`http://${HOST(sub)}/api/v1/matrix${qs}`, {
    method: entry.method,
    headers: { host: HOST(sub), origin: `http://${HOST(sub)}`, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: entry.method === "GET" || entry.method === "DELETE" ? undefined : JSON.stringify(entry.body ?? {}),
  });
  return factories[entry.factory][entry.name](request, { id });
}
async function outcome(res: Response): Promise<"unauthenticated" | "denied" | "suspended" | "module-off" | "passed"> {
  if (res.status === 401) return "unauthenticated";
  if (res.status !== 403) return "passed";
  const code = ((await res.json()) as { error: { code: string } }).error.code;
  if (code === "PERM_DENIED") return "denied";
  if (code === "TENANT_SUSPENDED") return "suspended";
  if (code === "MODULE_INACTIVE") return "module-off";
  return "passed"; // e.g. PERM_ESCALATION: past the guard, refused by the service
}

async function signIn(sub: string, email: string, password: string) {
  await testDb.delete(rateLimits); // sign-in is rate limited per address; this suite signs in many users
  const res = await auth.handler(
    new Request(`http://${HOST(sub)}/api/auth/tenant/sign-in`, {
      method: "POST",
      headers: { host: HOST(sub), origin: `http://${HOST(sub)}`, "content-type": "application/json" },
      body: JSON.stringify({ identifier: email, password }),
    }),
  );
  expect(res.status).toBe(200);
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

const BASELINE = ROLE_TEMPLATES.map((t) => t.name);
const permissionsOf = (role: string): Set<string> | "all" => {
  const t = ROLE_TEMPLATES.find((r) => r.name === role)!;
  return t.grantsAll ? "all" : new Set(t.permissions);
};
const GUARDED = [...new Set(HANDLERS.map((h) => h.permission).filter((p): p is PermissionName => p !== "signed-in"))];

const cookies: Record<string, string> = {};
let a: { id: string; sub: string };
const foreign = {} as Record<Entity, string>;

beforeAll(async () => {
  await reset();
  await seedPlatformCatalog(testDb);
  storage = new LocalDiskStorage(await mkdtemp(path.join(os.tmpdir(), "cms-matrix-")));
  factories = {
    academic: createAcademicHandlers({ db, auth, host }) as unknown as Handlers,
    students: createStudentHandlers({ db, auth, host }) as unknown as Handlers,
    instructors: createInstructorHandlers({ db, auth, host }) as unknown as Handlers,
    institute: createInstituteHandlers({ db, auth, host }) as unknown as Handlers,
    settings: createSettingsHandlers({ db, auth, host }) as unknown as Handlers,
    files: createFilesHandlers({ db, auth, host, storage }) as unknown as Handlers,
    fees: createFeesHandlers({ db, auth, host }) as unknown as Handlers,
    attendance: createAttendanceHandlers({ db, auth, host }) as unknown as Handlers,
    exams: createExamsHandlers({ db, auth, host }) as unknown as Handlers,
    routine: createRoutineHandlers({ db, auth, host }) as unknown as Handlers,
    website: createWebsiteHandlers({ db, auth, host, storage }) as unknown as Handlers,
    dashboard: createDashboardHandlers({ db, auth, host }) as unknown as Handlers,
  };

  const institute = async (sub: string) => {
    const [tenant] = await testDb.insert(tenants).values({ name: sub, subdomain: sub, status: "ACTIVE" }).returning();
    const roleIds = await seedBaselineRoles(db, tenant.id);
    const owner = await createLogin(db, { tenantId: tenant.id, name: "Owner", email: `owner@${sub}.test`, password: "OwnerPass1", mustChangePassword: false });
    await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: owner.id, roleId: roleIds[INSTITUTE_OWNER_ROLE] });
    await testDb.update(tenants).set({ ownerUserId: owner.id }).where(eq(tenants.id, tenant.id));
    return { tenant, roleIds, owner };
  };

  // Institute A: one user per baseline role, and one per guarded permission holding only that permission.
  const inst = await institute("matrix-a");
  await setModules(db, inst.tenant.id, ["fees", "attendance", "exams", "routine", "website"]);
  a = { id: inst.tenant.id, sub: "matrix-a" };
  const perms = await testDb.select().from(permissionRows);
  for (const role of BASELINE) {
    const email = `${role.toLowerCase()}@matrix-a.test`;
    if (role === INSTITUTE_OWNER_ROLE) {
      cookies[role] = await signIn(a.sub, "owner@matrix-a.test", "OwnerPass1");
      continue;
    }
    const user = await createLogin(db, { tenantId: a.id, name: role, email, password: "SomePass1", mustChangePassword: false });
    await testDb.insert(userRoles).values({ tenantId: a.id, userId: user.id, roleId: inst.roleIds[role] });
    cookies[role] = await signIn(a.sub, email, "SomePass1");
  }
  for (const permission of GUARDED) {
    const [role] = await testDb.insert(roles).values({ tenantId: a.id, name: `Only ${permission}` }).returning();
    await testDb.insert(rolePermissions).values({ tenantId: a.id, roleId: role.id, permissionId: perms.find((p) => p.name === permission)!.id });
    const email = `${permission.replaceAll(".", "-")}@matrix-a.test`;
    const user = await createLogin(db, { tenantId: a.id, name: permission, email, password: "SomePass1", mustChangePassword: false });
    await testDb.insert(userRoles).values({ tenantId: a.id, userId: user.id, roleId: role.id });
    cookies[`only:${permission}`] = await signIn(a.sub, email, "SomePass1");
  }

  // Institute B: one record of every kind a path id can name.
  const b = await institute("matrix-b");
  await setModules(db, b.tenant.id, ["fees", "attendance", "exams", "routine", "website"]);
  const actor = { tenantId: b.tenant.id, userId: b.owner.id };
  const course = await academic.createCourse(db, actor, { name: "B course", code: "BC", dueDay: 10 });
  const subject = await academic.createSubject(db, actor, course.id, { name: "B subject" });
  const batch = await academic.createBatch(db, actor, course.id, { name: "B batch" });
  const batchSubject = await academic.addBatchSubject(db, actor, batch.id, subject.id);
  const slot = await academic.addScheduleSlot(db, actor, batchSubject.id, { weekday: "SAT", startsAt: "09:00", endsAt: "10:00" });
  const { student: s } = await students.admitStudent(db, actor, {
    fullName: "B student", gender: "FEMALE", guardianName: "G", guardianRelation: "MOTHER", guardianPhone: "01711000222", batchIds: [batch.id], temporaryPassword: "Student123",
  });
  const [membership] = await testDb.select().from(batchMemberships).where(eq(batchMemberships.studentId, s.id));
  const teacherLogin = await createLogin(db, { tenantId: b.tenant.id, name: "B teacher", email: "t@matrix-b.test", password: "TeachPass1" });
  const [teacher] = await testDb.insert(instructors).values({ tenantId: b.tenant.id, userId: teacherLogin.id, fullName: "B teacher" }).returning();
  const [signature] = await testDb.insert(signatures).values({ tenantId: b.tenant.id, title: "Head", personName: "H" }).returning();
  const bytes = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#000" } }).jpeg().toBuffer();
  const file = await uploadFile(db, storage, actor, { category: "LOGO", filename: "b.jpg", bytes });
  const feeItem = await feeSetup.createFeeItem(db, actor, { courseId: course.id, kind: "MONTHLY", name: "B tuition", amount: "1000" });
  const studentAmount = await feeSetup.setStudentFeeAmount(db, actor, s.id, { feeItemId: feeItem.id, amount: "500", reason: "Sibling" });
  const run = await feeCharges.confirmGeneration(db, actor, { feeItemId: feeItem.id, period: todayInDhaka().slice(0, 7) });
  const [charge] = await feeCharges.listStudentCharges(db, b.tenant.id, s.id);
  const { payment } = await feePayments.collectPayment(db, actor, s.id, { chargeIds: [charge.id], method: "CASH", idempotencyKey: "00000000-0000-4000-8000-0000000000bb" });
  const leaveRow = await leave.enterLeave(db, actor, s.id, { fromDate: "2026-01-05", toDate: "2026-01-06", reason: "Fever" });
  const exam = await examSetup.createExam(db, { ...actor, permissions: new Set(["exams.manage"]) }, {
    courseId: course.id, name: "B exam", kind: "WEEKLY", startsOn: "2026-11-01", endsOn: "2026-11-01", batchIds: [batch.id], papers: [{ subjectId: subject.id, fullMarks: "20", passMarks: "7" }],
  });
  // A future Saturday (B's class day) for a routine change, and a holiday.
  let saturday = TODAY;
  while (new Date(`${saturday}T00:00:00Z`).getUTCDay() !== 6 || saturday === TODAY) saturday = new Date(Date.parse(`${saturday}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const routineActor = { ...actor, permissions: new Set(["routine.manage", "academic.view"]) };
  const routineChange = await routineService.createChange(db, routineActor, { batchSubjectId: batchSubject.id, classDate: saturday, startsAt: "09:00", kind: "CANCEL", reason: "Rain" });
  const holiday = await routineService.createHoliday(db, routineActor, { name: "B holiday", fromDate: "2099-02-01" });
  const lessonTopic = await lessonService.addTopic(db, { ...routineActor, permissions: new Set(["routine.manage", "lessons.manage", "academic.view"]) }, batchSubject.id, { title: "B topic" });
  const websitePicture = await uploadFile(db, storage, actor, { category: "WEBSITE_IMAGE", filename: "w.jpg", bytes });
  const notice = await websiteContent.createNotice(db, actor, { title: "B notice", body: "Text" });
  const galleryPhoto = await websiteContent.addGalleryPhoto(db, actor, { fileId: websitePicture.id });
  const testimonial = await websiteContent.createTestimonial(db, actor, { quote: "Great", name: "B" });
  const facultyRow = await websiteShowcase.addFaculty(db, actor, { instructorId: teacher.id });
  const achiever = await websiteShowcase.createAchiever(db, actor, { name: "B star", result: "GPA 5" });
  await websiteEnquiries.submitEnquiry(db, b.tenant.id, { name: "B visitor", mobile: "01711000333" }, { ipAddress: null });
  const { items: [enquiry] } = await websiteEnquiries.listEnquiries(db, b.tenant.id);
  Object.assign(foreign, {
    COURSE: course.id, SUBJECT: subject.id, BATCH: batch.id, BATCH_SUBJECT: batchSubject.id, SCHEDULE_SLOT: slot.id, STUDENT: s.id, MEMBERSHIP: membership.id,
    INSTRUCTOR: teacher.id, USER: teacherLogin.id, SIGNATURE: signature.id, FILE: file.id, FEE_ITEM: feeItem.id, STUDENT_FEE_AMOUNT: studentAmount.id, FEE_RUN: run.id, FEE_CHARGE: charge.id, FEE_PAYMENT: payment.id, LEAVE: leaveRow.id, EXAM: exam.id, EXAM_PAPER: exam.papers[0].id, ROUTINE_CHANGE: routineChange.id, HOLIDAY: holiday.id, LESSON_TOPIC: lessonTopic.id, NOTICE: notice.id, GALLERY_PHOTO: galleryPhoto.id, TESTIMONIAL: testimonial.id, ENQUIRY: enquiry.id, FACULTY: facultyRow.id, ACHIEVER: achiever.id,
  });
}, 120_000);

afterAll(async () => {
  await close();
});

describe("access matrix: catalogue", () => {
  it("names every handler of every institute HTTP module", () => {
    for (const [factory, handlers] of Object.entries(factories) as [Factory, Handlers][]) {
      const listed = HANDLERS.filter((h) => h.factory === factory).map((h) => h.name);
      const outside = Object.keys(OUTSIDE[factory] ?? {});
      expect([...listed, ...outside].sort(), factory).toEqual(Object.keys(handlers).sort());
    }
  });

  it("covers every institute API route", async () => {
    const root = path.join(process.cwd(), "src/app/api");
    const files: string[] = [];
    const walk = async (dir: string) => {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        if (e.isDirectory()) await walk(path.join(dir, e.name));
        else if (e.name === "route.ts") files.push(path.join(dir, e.name));
      }
    };
    await walk(root);
    const moduleOf: Record<string, Factory> = { academic: "academic", students: "students", instructors: "instructors", institute: "institute", settings: "settings", files: "files", fees: "fees", attendance: "attendance", exams: "exams", routine: "routine", website: "website", dashboard: "dashboard" };
    const seen: string[] = [];
    for (const file of files) {
      const rel = path.relative(root, file).replaceAll("\\", "/");
      // Better Auth's own endpoints and the platform API (guarded by requirePlatformAdmin, tested in platform/http.test.ts) are not institute handlers.
      if (rel.startsWith("auth/") || rel.startsWith("platform/")) continue;
      const source = await readFile(file, "utf8");
      const mod = /@\/server\/modules\/(\w+)\/instance/.exec(source)?.[1];
      expect(mod && moduleOf[mod], `${rel} imports an institute module instance`).toBeTruthy();
      for (const [, name] of source.matchAll(/\bh\.(\w+)\(/g)) {
        const factory = moduleOf[mod!];
        const known = HANDLERS.some((h) => h.factory === factory && h.name === name) || name in (OUTSIDE[factory] ?? {});
        expect(known, `${rel} → ${factory}.${name} is in the matrix`).toBe(true);
        seen.push(`${factory}.${name}`);
      }
    }
    // And every matrix entry is reachable through some route.
    expect(HANDLERS.filter((h) => !seen.includes(`${h.factory}.${h.name}`)).map((h) => `${h.factory}.${h.name}`)).toEqual([]);
  });
});

describe("access matrix: who passes the guard", () => {
  it("refuses every handler to a signed-out request (401)", async () => {
    for (const entry of HANDLERS) {
      expect(await outcome(await call(entry, a.sub, null)), `${entry.factory}.${entry.name}`).toBe("unauthenticated");
    }
  });

  it.each(BASELINE)("lets the %s role through exactly the handlers its permissions cover", async (role) => {
    const held = permissionsOf(role);
    for (const entry of HANDLERS) {
      const allowed = entry.permission === "signed-in" || held === "all" || held.has(entry.permission);
      expect(await outcome(await call(entry, a.sub, cookies[role])), `${role} → ${entry.factory}.${entry.name}`).toBe(allowed ? "passed" : "denied");
    }
  });

  it("demands exactly the declared permission: a role holding only that one passes, every other single-permission role is refused", async () => {
    for (const entry of HANDLERS) {
      for (const permission of GUARDED) {
        const allowed = entry.permission === "signed-in" || entry.permission === permission;
        const got = await outcome(await call(entry, a.sub, cookies[`only:${permission}`]));
        expect(got, `only ${permission} → ${entry.factory}.${entry.name}`).toBe(allowed ? "passed" : "denied");
      }
    }
  }, 120_000);
});

describe("access matrix: paid module switched off", () => {
  it.each(["fees", "attendance", "exams", "routine", "website"] as const)("refuses every %s handler while it's off, even to the Owner, and leaves everything else alone", async (key) => {
    await setModules(db, a.id, [key], false);
    try {
      for (const entry of HANDLERS) {
        const got = await outcome(await call(entry, a.sub, cookies[INSTITUTE_OWNER_ROLE]));
        expect(got, `${entry.factory}.${entry.name} with ${key} off`).toBe(PAID[entry.factory] === key ? "module-off" : "passed");
      }
    } finally {
      await setModules(db, a.id, [key]);
    }
  });
});

describe("access matrix: institute state and other institutes", () => {
  it("answers another institute's ids with 404, never their data", async () => {
    for (const entry of HANDLERS.filter((h) => h.id)) {
      const res = await call(entry, a.sub, cookies[INSTITUTE_OWNER_ROLE], foreign[entry.id!]);
      expect(res.status, `${entry.factory}.${entry.name} with another institute's ${entry.id}`).toBe(404);
    }
  });

  it("allows reads but refuses every change while the institute is suspended", async () => {
    await testDb.update(tenants).set({ status: "SUSPENDED" }).where(eq(tenants.id, a.id));
    try {
      for (const entry of HANDLERS) {
        const got = await outcome(await call(entry, a.sub, cookies[INSTITUTE_OWNER_ROLE]));
        expect(got, `${entry.method} ${entry.factory}.${entry.name}`).toBe(entry.method === "GET" ? "passed" : "suspended");
      }
    } finally {
      await testDb.update(tenants).set({ status: "ACTIVE" }).where(eq(tenants.id, a.id));
    }
  });
});
