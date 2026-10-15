import { and, asc, desc, eq, exists, ilike, not, or, sql } from "drizzle-orm";
import { batchMemberships, batches, courses, roles, sessions, studentIdCounters, students, studentStatusHistory, users } from "../../core/db/schema";
import { containsPattern } from "../../core/db/search";
import { getInTenant } from "../../core/db/tenant-scope";
import { inTransaction } from "../../core/db/transaction";
import type { DbOrTx, Tx } from "../../core/db/types";
import { ConflictError, NotFoundError, ValidationError, mapDatabaseError } from "../../core/errors";
import { assertFileReference } from "../../core/files/service";
import { normalizeBdMobile } from "@/lib/bd-phone";
import { isCalendarDate, todayInDhaka } from "@/lib/dates";
import { formatStudentId } from "@/lib/student-id";
import { audit } from "../audit/service";
import { createLogin } from "../auth/credentials";
import { resetUserPassword } from "../institute/users";
import { assignRoles } from "../rbac/service";
import { getStudentIdPattern } from "../settings/service";
import "./references";

export interface Actor {
  tenantId: string;
  userId: string;
}

export type Gender = "MALE" | "FEMALE" | "OTHER";
export type StudentStatus = "ACTIVE" | "ON_HOLD" | "COMPLETED" | "LEFT";
export type MembershipStatus = "ACTIVE" | "COMPLETED" | "LEFT";
export const GUARDIAN_RELATIONS = ["FATHER", "MOTHER", "BROTHER", "SISTER", "UNCLE", "AUNT", "GRANDPARENT", "OTHER"] as const;
export type GuardianRelation = (typeof GUARDIAN_RELATIONS)[number];

const UNIQUE = {
  students_tenant_code_lower_idx: { code: "CONFLICT_STUDENT_CODE", field: "studentCode", message: "Another student already has this ID." },
  users_tenant_username_lower_idx: { code: "CONFLICT_STUDENT_CODE", field: "studentCode", message: "Someone in this institute already signs in with this ID." },
  batch_memberships_active_unique: { code: "CONFLICT_ALREADY_IN_BATCH", field: "batchId", message: "The student is already in this batch." },
  batch_memberships_active_roll_unique: { code: "CONFLICT_ROLL_NUMBER", field: "rollNumber", message: "Another student in this batch has this roll number." },
};
const write = <T>(entity: string, fn: () => Promise<T>) =>
  fn().catch((err) => {
    throw mapDatabaseError(err, { entity, operation: "write", unique: UNIQUE }) ?? err;
  });

const record = (tx: DbOrTx, actor: Actor, action: string, resourceId: string, values: { oldValue?: Record<string, unknown> | null; newValue?: Record<string, unknown> | null } = {}) =>
  audit.record(tx, { tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action, resourceType: "STUDENT", resourceId, ...values });

// ---------------------------------------------------------------------------
// Field rules
// ---------------------------------------------------------------------------

export interface StudentFields {
  fullName: string;
  gender: Gender;
  dateOfBirth?: string | null;
  phone?: string | null;
  schoolName?: string | null;
  schoolClass?: string | null;
  address?: string | null;
  adminNote?: string | null;
  guardianName: string;
  guardianRelation: GuardianRelation;
  guardianPhone: string;
  photoFileId?: string | null;
}

function text(value: string | null | undefined, max: number, field: string, label: string): string | null {
  const t = value?.trim() || null;
  if (t && t.length > max) throw new ValidationError("VALIDATION_TEXT", `${label} can be at most ${max} characters.`, { field });
  return t;
}

function requiredText(value: string | undefined, max: number, field: string, label: string): string {
  const t = text(value, max, field, label);
  if (!t) throw new ValidationError("VALIDATION_REQUIRED", `${label} is required.`, { field });
  return t;
}

function mobile(value: string | null | undefined, field: string, required: boolean): string | null {
  const raw = value?.trim() || null;
  if (!raw) {
    if (required) throw new ValidationError("VALIDATION_REQUIRED", "The guardian's mobile number is required.", { field });
    return null;
  }
  const phone = normalizeBdMobile(raw);
  if (!phone) throw new ValidationError("VALIDATION_PHONE", "Enter a valid Bangladeshi mobile number (01XXXXXXXXX).", { field });
  return phone;
}

function calendarDate(value: string | null | undefined, field: string): string | null {
  const d = value?.trim() || null;
  if (d && !isCalendarDate(d)) throw new ValidationError("VALIDATION_DATE", "Enter a valid date.", { field });
  return d;
}

function cleanFields(input: StudentFields) {
  if (!["MALE", "FEMALE", "OTHER"].includes(input.gender)) throw new ValidationError("VALIDATION_REQUIRED", "Gender is required.", { field: "gender" });
  if (!GUARDIAN_RELATIONS.includes(input.guardianRelation)) {
    throw new ValidationError("VALIDATION_REQUIRED", "The guardian's relation is required.", { field: "guardianRelation" });
  }
  const dateOfBirth = calendarDate(input.dateOfBirth, "dateOfBirth");
  if (dateOfBirth && dateOfBirth > todayInDhaka()) throw new ValidationError("VALIDATION_DATE", "The date of birth can't be in the future.", { field: "dateOfBirth" });
  return {
    fullName: requiredText(input.fullName, 100, "fullName", "The name"),
    gender: input.gender,
    dateOfBirth,
    phone: mobile(input.phone, "phone", false),
    schoolName: text(input.schoolName, 150, "schoolName", "School or college"),
    schoolClass: text(input.schoolClass, 50, "schoolClass", "Class"),
    address: text(input.address, 500, "address", "The address"),
    adminNote: text(input.adminNote, 1000, "adminNote", "The note"),
    guardianName: requiredText(input.guardianName, 100, "guardianName", "The guardian's name"),
    guardianRelation: input.guardianRelation,
    guardianPhone: mobile(input.guardianPhone, "guardianPhone", true)!,
    photoFileId: input.photoFileId ?? null,
  };
}

/** An Admin-typed student ID: letters, digits, "-" and "/"; never readable as an email or mobile number. */
export function cleanStudentCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9/-]{0,29}$/.test(code)) {
    throw new ValidationError("VALIDATION_STUDENT_CODE", "Use up to 30 letters, digits, - or /, starting with a letter or digit.", { field: "studentCode" });
  }
  if (normalizeBdMobile(code)) throw new ValidationError("VALIDATION_STUDENT_CODE", "A student ID can't look like a mobile number.", { field: "studentCode" });
  return code;
}

// ---------------------------------------------------------------------------
// Student ID generation
// ---------------------------------------------------------------------------

async function nextSequence(tx: Tx, tenantId: string, scope: string, year: number): Promise<number> {
  await tx.insert(studentIdCounters).values({ tenantId, scope, year, nextValue: 1 }).onConflictDoNothing();
  // The UPDATE locks the counter row, so concurrent admissions in the same scope take numbers one at a time.
  const [row] = await tx
    .update(studentIdCounters)
    .set({ nextValue: sql`${studentIdCounters.nextValue} + 1` })
    .where(and(eq(studentIdCounters.tenantId, tenantId), eq(studentIdCounters.scope, scope), eq(studentIdCounters.year, year)))
    .returning({ value: studentIdCounters.nextValue });
  return row.value - 1;
}

async function codeTaken(tx: Tx, tenantId: string, code: string): Promise<boolean> {
  const [hit] = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(sql`lower(${users.username})`, code.toLowerCase())));
  return !!hit;
}

/** The next generated ID. A number is never reused; one already taken by an Admin-typed ID is skipped. */
async function generateStudentCode(tx: Tx, tenantId: string, course: { id: string; code: string } | null, admissionDate: string): Promise<string> {
  const pattern = await getStudentIdPattern(tx, tenantId);
  if (pattern.includeCourseCode && !course) {
    throw new ValidationError("VALIDATION_COURSE_REQUIRED", "Choose the course: your student ID pattern includes the course code.", { field: "courseId" });
  }
  const scope = pattern.includeCourseCode ? course!.id : "ALL";
  const year = Number(admissionDate.slice(0, 4));
  for (let attempt = 0; attempt < 1000; attempt++) {
    const code = formatStudentId(pattern, { courseCode: course?.code, year, sequence: await nextSequence(tx, tenantId, scope, year) });
    if (!(await codeTaken(tx, tenantId, code))) return code;
  }
  throw new ConflictError("CONFLICT_STUDENT_CODE", "Couldn't find a free student ID. Type one instead.");
}

// ---------------------------------------------------------------------------
// Admission and profile
// ---------------------------------------------------------------------------

export interface AdmitInput extends StudentFields {
  admissionDate?: string | null;
  courseId?: string | null;
  batchIds?: string[];
  /** An Admin-typed ID; generated from the pattern when absent. */
  studentCode?: string | null;
  temporaryPassword: string;
}

async function studentRoleId(tx: Tx, tenantId: string): Promise<string> {
  const [role] = await tx.select({ id: roles.id }).from(roles).where(and(eq(roles.tenantId, tenantId), eq(roles.name, "Student"), eq(roles.isSystem, true)));
  if (!role) throw new NotFoundError("ROLE");
  return role.id;
}

async function activeBatch(tx: DbOrTx, tenantId: string, batchId: string) {
  const batch = await getInTenant(tx, batches, tenantId, batchId, "BATCH");
  if (batch.status !== "ACTIVE") throw new ConflictError("CONFLICT_BATCH_ARCHIVED", `${batch.name} is archived.`, { field: "batchId" });
  return batch;
}

/**
 * One transaction: student ID → login (username = ID, Student role, temporary password) → student → status history →
 * batch memberships → audit. Joining a batch is optional; batches may belong to any course.
 */
export async function admitStudent(db: DbOrTx, actor: Actor, input: AdmitInput) {
  const fields = cleanFields(input);
  const admissionDate = calendarDate(input.admissionDate, "admissionDate") ?? todayInDhaka();
  const override = input.studentCode?.trim() ? cleanStudentCode(input.studentCode) : null;
  const batchIds = [...new Set(input.batchIds ?? [])];

  return inTransaction(db, async (tx) => {
    let course: { id: string; code: string } | null = null;
    if (input.courseId) {
      const row = await getInTenant(tx, courses, actor.tenantId, input.courseId, "COURSE");
      if (row.status !== "ACTIVE") throw new ConflictError("CONFLICT_COURSE_ARCHIVED", "This course is archived.", { field: "courseId" });
      course = { id: row.id, code: row.code };
    }
    if (fields.photoFileId) await assertFileReference(tx, actor.tenantId, fields.photoFileId, "STUDENT_PHOTO", "photoFileId");
    for (const batchId of batchIds) await activeBatch(tx, actor.tenantId, batchId);

    const studentCode = override ?? (await generateStudentCode(tx, actor.tenantId, course, admissionDate));
    if (override && (await codeTaken(tx, actor.tenantId, override))) {
      throw new ConflictError("CONFLICT_STUDENT_CODE", "Someone in this institute already signs in with this ID.", { field: "studentCode" });
    }
    const user = await write("STUDENT", () =>
      createLogin(tx, { tenantId: actor.tenantId, name: fields.fullName, username: studentCode, password: input.temporaryPassword }),
    );
    // Through the RBAC service, so nobody can create a login with access they don't hold themselves.
    await assignRoles(tx, { tenantId: actor.tenantId, actorUserId: actor.userId, targetUserId: user.id, roleIds: [await studentRoleId(tx, actor.tenantId)] });
    const [student] = await write("STUDENT", () =>
      tx
        .insert(students)
        .values({
          tenantId: actor.tenantId, userId: user.id, studentCode, ...fields, admissionDate, admissionCourseId: course?.id ?? null,
          createdBy: actor.userId, updatedBy: actor.userId,
        })
        .returning(),
    );
    await tx.insert(studentStatusHistory).values({ tenantId: actor.tenantId, studentId: student.id, fromStatus: null, toStatus: "ACTIVE", reason: "Admitted", changedBy: actor.userId });
    if (batchIds.length) {
      await tx.insert(batchMemberships).values(
        batchIds.map((batchId) => ({ tenantId: actor.tenantId, studentId: student.id, batchId, startedOn: admissionDate, createdBy: actor.userId, updatedBy: actor.userId })),
      );
    }
    await record(tx, actor, "STUDENT_ADMITTED", student.id, { newValue: { studentCode, fullName: fields.fullName, admissionDate, courseId: course?.id ?? null, batchIds } });
    // The only time the temporary password is returned; only its hash is stored.
    return { student: await getStudent(tx, actor.tenantId, student.id), temporaryPassword: input.temporaryPassword };
  });
}

/** Profile fields only. The ID, admission date and course are fixed at admission; status has its own action. */
export async function updateStudent(db: DbOrTx, actor: Actor, id: string, input: Partial<StudentFields>) {
  return inTransaction(db, async (tx) => {
    const existing = await getInTenant(tx, students, actor.tenantId, id, "STUDENT");
    const merged: StudentFields = {
      fullName: input.fullName ?? existing.fullName,
      gender: input.gender ?? existing.gender,
      dateOfBirth: input.dateOfBirth === undefined ? existing.dateOfBirth : input.dateOfBirth,
      phone: input.phone === undefined ? existing.phone : input.phone,
      schoolName: input.schoolName === undefined ? existing.schoolName : input.schoolName,
      schoolClass: input.schoolClass === undefined ? existing.schoolClass : input.schoolClass,
      address: input.address === undefined ? existing.address : input.address,
      adminNote: input.adminNote === undefined ? existing.adminNote : input.adminNote,
      guardianName: input.guardianName ?? existing.guardianName,
      guardianRelation: input.guardianRelation ?? existing.guardianRelation,
      guardianPhone: input.guardianPhone ?? existing.guardianPhone,
      photoFileId: input.photoFileId === undefined ? existing.photoFileId : input.photoFileId,
    };
    const fields = cleanFields(merged);
    if (fields.photoFileId && fields.photoFileId !== existing.photoFileId) {
      await assertFileReference(tx, actor.tenantId, fields.photoFileId, "STUDENT_PHOTO", "photoFileId");
    }
    await tx.update(students).set({ ...fields, updatedAt: new Date(), updatedBy: actor.userId }).where(and(eq(students.tenantId, actor.tenantId), eq(students.id, id)));
    if (fields.fullName !== existing.fullName) {
      await tx.update(users).set({ name: fields.fullName, updatedAt: new Date() }).where(and(eq(users.tenantId, actor.tenantId), eq(users.id, existing.userId)));
    }
    const changed = (Object.keys(fields) as (keyof typeof fields)[]).filter((k) => fields[k] !== existing[k]);
    if (changed.length) {
      await record(tx, actor, "STUDENT_UPDATED", id, {
        oldValue: Object.fromEntries(changed.map((k) => [k, existing[k]])),
        newValue: Object.fromEntries(changed.map((k) => [k, fields[k]])),
      });
    }
    return getStudent(tx, actor.tenantId, id);
  });
}

export async function resetStudentPassword(db: DbOrTx, actor: Actor, id: string, temporaryPassword: string) {
  return inTransaction(db, async (tx) => {
    const existing = await getInTenant(tx, students, actor.tenantId, id, "STUDENT");
    return resetUserPassword(tx, actor, existing.userId, temporaryPassword);
  });
}

// ---------------------------------------------------------------------------
// Overall status
// ---------------------------------------------------------------------------

const TRANSITIONS: Record<StudentStatus, readonly StudentStatus[]> = {
  ACTIVE: ["ON_HOLD", "COMPLETED", "LEFT"],
  ON_HOLD: ["ACTIVE", "COMPLETED", "LEFT"],
  COMPLETED: ["ACTIVE"],
  LEFT: ["ACTIVE"],
};

/** Why a status change isn't allowed, or null. Left needs a reason, and so does reactivation. */
export function statusChangeProblem(from: StudentStatus, to: StudentStatus, reason: string | null): { code: string; message: string } | null {
  if (from === to) return { code: "CONFLICT_STATUS_UNCHANGED", message: "The student already has this status." };
  if (!TRANSITIONS[from].includes(to)) return { code: "CONFLICT_STATUS_TRANSITION", message: "This status change isn't allowed." };
  if (!reason && (to === "LEFT" || from === "COMPLETED" || from === "LEFT")) {
    return { code: "VALIDATION_REASON_REQUIRED", message: to === "LEFT" ? "Give a reason for leaving." : "Give a reason for reactivating." };
  }
  return null;
}

/**
 * Changes the overall status. Only ACTIVE students can sign in, so any other status bans the login and ends its
 * sessions. Completed and Left close every active batch membership with the same status, today.
 */
export async function setStudentStatus(db: DbOrTx, actor: Actor, id: string, input: { status: StudentStatus; reason?: string | null }) {
  const reason = text(input.reason, 500, "reason", "The reason");
  return inTransaction(db, async (tx) => {
    const existing = await getInTenant(tx, students, actor.tenantId, id, "STUDENT");
    const problem = statusChangeProblem(existing.status, input.status, reason);
    if (problem) {
      throw problem.code.startsWith("VALIDATION") ? new ValidationError(problem.code, problem.message, { field: "reason" }) : new ConflictError(problem.code, problem.message);
    }
    const to = input.status;
    await tx.update(students).set({ status: to, updatedAt: new Date(), updatedBy: actor.userId }).where(and(eq(students.tenantId, actor.tenantId), eq(students.id, id)));
    await tx.insert(studentStatusHistory).values({ tenantId: actor.tenantId, studentId: id, fromStatus: existing.status, toStatus: to, reason, changedBy: actor.userId });

    let closed = 0;
    if (to === "COMPLETED" || to === "LEFT") {
      const today = todayInDhaka();
      const rows = await tx
        .update(batchMemberships)
        .set({ status: to, endedOn: sql`greatest(${batchMemberships.startedOn}, ${today}::date)`, updatedAt: new Date(), updatedBy: actor.userId })
        .where(and(eq(batchMemberships.tenantId, actor.tenantId), eq(batchMemberships.studentId, id), eq(batchMemberships.status, "ACTIVE")))
        .returning({ id: batchMemberships.id });
      closed = rows.length;
    }
    const banned = to !== "ACTIVE";
    await tx.update(users).set({ banned, bannedAt: banned ? new Date() : null, updatedAt: new Date() }).where(and(eq(users.tenantId, actor.tenantId), eq(users.id, existing.userId)));
    if (banned) await tx.delete(sessions).where(eq(sessions.userId, existing.userId));

    await record(tx, actor, "STUDENT_STATUS_CHANGED", id, { oldValue: { status: existing.status }, newValue: { status: to, reason, membershipsClosed: closed } });
    return getStudent(tx, actor.tenantId, id);
  });
}

// ---------------------------------------------------------------------------
// Batch memberships
// ---------------------------------------------------------------------------

function rollNumber(value: string | null | undefined): string | null {
  const roll = value?.trim() || null;
  if (roll && !/^[A-Za-z0-9-]{1,10}$/.test(roll)) {
    throw new ValidationError("VALIDATION_ROLL_NUMBER", "Use up to 10 letters, digits or -.", { field: "rollNumber" });
  }
  return roll;
}

/** Adds a current student (Active or On Hold) to a batch. A Completed or Left student is reactivated first. */
export async function addMembership(db: DbOrTx, actor: Actor, studentId: string, input: { batchId: string; startedOn?: string | null; rollNumber?: string | null }) {
  const startedOn = calendarDate(input.startedOn, "startedOn") ?? todayInDhaka();
  const roll = rollNumber(input.rollNumber);
  return inTransaction(db, async (tx) => {
    const student = await getInTenant(tx, students, actor.tenantId, studentId, "STUDENT");
    if (student.status === "COMPLETED" || student.status === "LEFT") {
      throw new ConflictError("CONFLICT_STUDENT_NOT_CURRENT", "This student has completed or left. Reactivate them first.");
    }
    const batch = await activeBatch(tx, actor.tenantId, input.batchId);
    const [row] = await write("BATCH_MEMBERSHIP", () =>
      tx
        .insert(batchMemberships)
        .values({ tenantId: actor.tenantId, studentId, batchId: batch.id, startedOn, rollNumber: roll, createdBy: actor.userId, updatedBy: actor.userId })
        .returning(),
    );
    await record(tx, actor, "STUDENT_BATCH_JOINED", studentId, { newValue: { batch: batch.name, startedOn, rollNumber: roll } });
    return row;
  });
}

async function activeMembership(tx: DbOrTx, tenantId: string, id: string) {
  const membership = await getInTenant(tx, batchMemberships, tenantId, id, "BATCH_MEMBERSHIP");
  if (membership.status !== "ACTIVE") throw new ConflictError("CONFLICT_MEMBERSHIP_CLOSED", "This batch membership has already ended.");
  return membership;
}

export async function setMembershipRoll(db: DbOrTx, actor: Actor, id: string, value: string | null) {
  const roll = rollNumber(value);
  return inTransaction(db, async (tx) => {
    const membership = await activeMembership(tx, actor.tenantId, id);
    const [row] = await write("BATCH_MEMBERSHIP", () =>
      tx.update(batchMemberships).set({ rollNumber: roll, updatedAt: new Date(), updatedBy: actor.userId }).where(and(eq(batchMemberships.tenantId, actor.tenantId), eq(batchMemberships.id, id))).returning(),
    );
    await record(tx, actor, "STUDENT_ROLL_CHANGED", membership.studentId, { oldValue: { rollNumber: membership.rollNumber }, newValue: { membershipId: id, rollNumber: roll } });
    return row;
  });
}

/** Ends one membership as Completed or Left. The student's overall status doesn't change. */
export async function endMembership(db: DbOrTx, actor: Actor, id: string, input: { status: "COMPLETED" | "LEFT"; endedOn?: string | null }) {
  const endedOn = calendarDate(input.endedOn, "endedOn") ?? todayInDhaka();
  return inTransaction(db, async (tx) => {
    const membership = await activeMembership(tx, actor.tenantId, id);
    if (endedOn < membership.startedOn) throw new ValidationError("VALIDATION_DATE", "The end date can't be before the student joined.", { field: "endedOn" });
    const [row] = await tx
      .update(batchMemberships)
      .set({ status: input.status, endedOn, updatedAt: new Date(), updatedBy: actor.userId })
      .where(and(eq(batchMemberships.tenantId, actor.tenantId), eq(batchMemberships.id, id)))
      .returning();
    await record(tx, actor, "STUDENT_BATCH_ENDED", membership.studentId, { newValue: { membershipId: id, status: input.status, endedOn } });
    return row;
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getStudent(db: DbOrTx, tenantId: string, id: string) {
  const student = await getInTenant(db, students, tenantId, id, "STUDENT");
  const [[login], admissionCourse, memberships, history] = await Promise.all([
    db
      .select({ username: users.username, mustChangePassword: users.mustChangePassword })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.id, student.userId))),
    student.admissionCourseId
      ? db.select({ id: courses.id, name: courses.name, code: courses.code }).from(courses).where(and(eq(courses.tenantId, tenantId), eq(courses.id, student.admissionCourseId)))
      : Promise.resolve([]),
    db
      .select({
        id: batchMemberships.id,
        batchId: batches.id,
        batchName: batches.name,
        batchStatus: batches.status,
        courseId: courses.id,
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
      .where(and(eq(batchMemberships.tenantId, tenantId), eq(batchMemberships.studentId, id)))
      .orderBy(sql`${batchMemberships.status} <> 'ACTIVE'`, desc(batchMemberships.startedOn), asc(batches.name)),
    db
      .select({
        id: studentStatusHistory.id,
        fromStatus: studentStatusHistory.fromStatus,
        toStatus: studentStatusHistory.toStatus,
        reason: studentStatusHistory.reason,
        changedAt: studentStatusHistory.changedAt,
        changedByName: users.name,
      })
      .from(studentStatusHistory)
      .leftJoin(users, and(eq(users.tenantId, studentStatusHistory.tenantId), eq(users.id, studentStatusHistory.changedBy)))
      .where(and(eq(studentStatusHistory.tenantId, tenantId), eq(studentStatusHistory.studentId, id)))
      .orderBy(desc(studentStatusHistory.changedAt)),
  ]);
  return {
    ...student,
    username: login?.username ?? null,
    mustChangePassword: login?.mustChangePassword ?? false,
    admissionCourse: admissionCourse[0] ?? null,
    memberships,
    statusHistory: history,
  };
}

export interface ListStudentsParams {
  q?: string;
  /** Defaults to ACTIVE; ALL includes every status. */
  status?: StudentStatus | "ALL";
  courseId?: string;
  batchId?: string;
  /** Only students in no active batch. */
  noBatch?: boolean;
  /** Search guardian and student mobile numbers too (only for viewers who may see contacts). */
  searchContacts?: boolean;
  page?: number;
  pageSize?: number;
}

const activeMembershipOf = (db: DbOrTx, extra?: ReturnType<typeof eq>) =>
  db
    .select({ one: sql`1` })
    .from(batchMemberships)
    .innerJoin(batches, and(eq(batches.tenantId, batchMemberships.tenantId), eq(batches.id, batchMemberships.batchId)))
    .where(and(eq(batchMemberships.tenantId, students.tenantId), eq(batchMemberships.studentId, students.id), eq(batchMemberships.status, "ACTIVE"), extra));

export async function listStudents(db: DbOrTx, tenantId: string, params: ListStudentsParams = {}) {
  const page = Math.max(1, Math.trunc(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(params.pageSize ?? 25)));
  const q = params.q?.trim();
  const pattern = q ? containsPattern(q) : null;
  const where = and(
    eq(students.tenantId, tenantId),
    params.status === "ALL" ? undefined : eq(students.status, params.status ?? "ACTIVE"),
    pattern
      ? or(
          ilike(students.fullName, pattern),
          ilike(students.studentCode, pattern),
          params.searchContacts ? ilike(students.guardianPhone, pattern) : undefined,
          params.searchContacts ? ilike(students.phone, pattern) : undefined,
        )
      : undefined,
    params.courseId ? exists(activeMembershipOf(db, eq(batches.courseId, params.courseId))) : undefined,
    params.batchId ? exists(activeMembershipOf(db, eq(batchMemberships.batchId, params.batchId))) : undefined,
    params.noBatch ? not(exists(activeMembershipOf(db))) : undefined,
  );
  // Outer columns are table-qualified by hand inside the subquery (Drizzle renders them bare in a single-table select).
  const currentBatches = sql<{ id: string; name: string }[]>`coalesce((
    select json_agg(json_build_object('id', b.id, 'name', b.name) order by b.name)
    from batch_memberships m join batches b on b.tenant_id = m.tenant_id and b.id = m.batch_id
    where m.tenant_id = "students"."tenant_id" and m.student_id = "students"."id" and m.status = 'ACTIVE'
  ), '[]'::json)`;
  const [items, [{ count }]] = await Promise.all([
    db
      .select({
        id: students.id,
        studentCode: students.studentCode,
        fullName: students.fullName,
        gender: students.gender,
        photoFileId: students.photoFileId,
        guardianName: students.guardianName,
        guardianPhone: students.guardianPhone,
        phone: students.phone,
        status: students.status,
        batches: currentBatches,
      })
      .from(students)
      .where(where)
      .orderBy(asc(students.fullName), asc(students.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(students).where(where),
  ]);
  return { items, total: count, page, pageSize };
}

/** A batch's current students, by roll number (numbers in numeric order) then name. */
export async function listBatchStudents(db: DbOrTx, tenantId: string, batchId: string) {
  await getInTenant(db, batches, tenantId, batchId, "BATCH");
  return db
    .select({
      membershipId: batchMemberships.id,
      rollNumber: batchMemberships.rollNumber,
      startedOn: batchMemberships.startedOn,
      id: students.id,
      studentCode: students.studentCode,
      fullName: students.fullName,
      status: students.status,
    })
    .from(batchMemberships)
    .innerJoin(students, and(eq(students.tenantId, batchMemberships.tenantId), eq(students.id, batchMemberships.studentId)))
    .where(and(eq(batchMemberships.tenantId, tenantId), eq(batchMemberships.batchId, batchId), eq(batchMemberships.status, "ACTIVE")))
    .orderBy(sql`${batchMemberships.rollNumber} is null`, sql`lpad(${batchMemberships.rollNumber}, 10, '0')`, asc(students.fullName));
}

