import sharp from "sharp";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../core/testing/db";
import { auditLogs, batchMemberships, instructors, permissions, rolePermissions, roles, studentIdSettings, students, tenants, userRoles } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import { canViewFile, uploadFile } from "../../core/files/service";
import { LocalDiskStorage } from "../../core/files/storage";
import { INSTITUTE_OWNER_ROLE } from "../../core/rbac/catalog";
import { resolvePortal } from "../../core/rbac/portal";
import { todayInDhaka } from "@/lib/dates";
import * as academic from "../academic/service";
import { createAcademicHandlers } from "../academic/http";
import { createLogin } from "../auth/credentials";
import { createTenantAuth } from "../auth/tenant-auth";
import { getActivePermissions } from "../authorization/service";
import { seedBaselineRoles } from "../rbac/service";
import { createStudentHandlers } from "./http";

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;
const host = { baseDomain: "localhost:3000", platformHost: "admin.localhost:3000" };
const auth = createTenantAuth(db, { secret: "test-secret-".padEnd(40, "x"), host, protocol: "http" });
const h = createStudentHandlers({ db, auth, host });
const academicHandlers = createAcademicHandlers({ db, auth, host });

beforeEach(async () => {
  await reset();
  await seedPlatformCatalog(testDb);
});
afterAll(async () => {
  await close();
});

const HOST = (sub: string) => `${sub}.localhost:3000`;
function req(sub: string, method: string, p: string, opts: { body?: unknown; cookie?: string } = {}) {
  return new Request(`http://${HOST(sub)}${p}`, {
    method,
    headers: { host: HOST(sub), origin: `http://${HOST(sub)}`, "content-type": "application/json", ...(opts.cookie ? { cookie: opts.cookie } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}
async function signIn(sub: string, identifier: string, password: string) {
  const res = await auth.handler(
    new Request(`http://${HOST(sub)}/api/auth/tenant/sign-in`, {
      method: "POST",
      headers: { host: HOST(sub), origin: `http://${HOST(sub)}`, "content-type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    }),
  );
  return { status: res.status, cookie: res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") };
}

async function institute(sub: string) {
  const [tenant] = await testDb.insert(tenants).values({ name: sub, subdomain: sub, status: "ACTIVE" }).returning();
  const roleIds = await seedBaselineRoles(db, tenant.id);
  const owner = await createLogin(db, { tenantId: tenant.id, name: "Owner", email: `owner@${sub}.test`, password: "OwnerPass1", mustChangePassword: false });
  await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: owner.id, roleId: roleIds[INSTITUTE_OWNER_ROLE] });
  await testDb.update(tenants).set({ ownerUserId: owner.id }).where(eq(tenants.id, tenant.id));
  const actor = { tenantId: tenant.id, userId: owner.id };
  const withRole = async (roleId: string, email: string) => {
    const user = await createLogin(db, { tenantId: tenant.id, name: email, email, password: "SomePass1", mustChangePassword: false });
    await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: user.id, roleId });
    return { user, cookie: (await signIn(sub, email, "SomePass1")).cookie };
  };
  const course = (name: string, code: string) => academic.createCourse(db, actor, { name, code });
  const batch = (courseId: string, name: string) => academic.createBatch(db, actor, courseId, { name });
  return { sub, tenant, roleIds, owner, actor, cookie: (await signIn(sub, `owner@${sub}.test`, "OwnerPass1")).cookie, withRole, course, batch };
}
type Institute = Awaited<ReturnType<typeof institute>>;

async function call(res: Promise<Response>) {
  const r = await res;
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
}
const newStudent = {
  full_name: "Rahim Uddin",
  gender: "MALE",
  guardian_name: "Karim Uddin",
  guardian_relation: "FATHER",
  guardian_phone: "+880 1711-000111",
  phone: "01811000222",
  address: "Mirpur, Dhaka",
  school_name: "Dhaka College",
  school_class: "HSC 1st year",
  temporary_password: "Student1234",
};
const admit = (i: Institute, body: object = {}, cookie = i.cookie) =>
  call(h.admit(req(i.sub, "POST", "/api/v1/students", { cookie, body: { ...newStudent, ...body } })));
const get = (i: Institute, id: string, cookie = i.cookie) => call(h.get(req(i.sub, "GET", `/api/v1/students/${id}`, { cookie }), { id }));
const setStatus = (i: Institute, id: string, status: string, reason?: string) =>
  call(h.setStatus(req(i.sub, "PATCH", "/x", { cookie: i.cookie, body: { status, reason } }), { id }));
const join = (i: Institute, id: string, batchId: string, extra: object = {}) =>
  call(h.addMembership(req(i.sub, "POST", "/x", { cookie: i.cookie, body: { batch_id: batchId, ...extra } }), { id }));
const list = (i: Institute, query = "", cookie = i.cookie) => call(h.list(req(i.sub, "GET", `/api/v1/students${query}`, { cookie })));
const year = Number(todayInDhaka().slice(0, 4));

describe("students API: access", () => {
  it("lets the Accountant view students with contacts but not admit; instructors and students get 403", async () => {
    const a = await institute("inst-a");
    const { body } = await admit(a);
    const accountant = await a.withRole(a.roleIds.Accountant, "acc@a.test");
    expect((await list(a, "", accountant.cookie)).body.items[0]).toMatchObject({ full_name: "Rahim Uddin", guardian_phone: "01711000111" });
    expect((await admit(a, {}, accountant.cookie)).status).toBe(403);
    expect((await setStatus({ ...a, cookie: accountant.cookie }, body.student.id, "ON_HOLD")).status).toBe(403);

    for (const role of ["Instructor", "Student"] as const) {
      const { cookie } = await a.withRole(a.roleIds[role], `${role}@a.test`);
      expect((await list(a, "", cookie)).status).toBe(403);
      expect((await get(a, body.student.id, cookie)).status).toBe(403);
    }
    expect((await list(a, "", "")).status).toBe(401);
  });

  it("hides mobile numbers and the address from viewers without contact access, and won't let them edit them", async () => {
    const a = await institute("inst-a");
    const { body } = await admit(a);
    const [clerkRole] = await testDb.insert(roles).values({ tenantId: a.tenant.id, name: "Front desk" }).returning();
    const perms = await testDb.select().from(permissions);
    await testDb.insert(rolePermissions).values(["students.view", "students.update"].map((n) => ({ tenantId: a.tenant.id, roleId: clerkRole.id, permissionId: perms.find((p) => p.name === n)!.id })));
    const clerk = await a.withRole(clerkRole.id, "desk@a.test");

    expect((await get(a, body.student.id, clerk.cookie)).body).toMatchObject({ full_name: "Rahim Uddin", guardian_name: "Karim Uddin", guardian_phone: null, phone: null, address: null });
    expect((await list(a, "", clerk.cookie)).body.items[0]).toMatchObject({ guardian_phone: null, phone: null });
    expect((await list(a, "?q=1711", clerk.cookie)).body.items).toHaveLength(0); // can't search by a number they can't see
    expect((await list(a, "?q=1711")).body.items).toHaveLength(1);

    const edit = (b: object) => call(h.update(req("inst-a", "PATCH", "/x", { cookie: clerk.cookie, body: b }), { id: body.student.id }));
    expect((await edit({ guardian_phone: "01999999999" })).status).toBe(403);
    expect((await edit({ school_class: "HSC 2nd year" })).body).toMatchObject({ school_class: "HSC 2nd year", guardian_phone: null });
  });

  it("refuses admission while the institute is suspended", async () => {
    const a = await institute("inst-a");
    await testDb.update(tenants).set({ status: "SUSPENDED" }).where(eq(tenants.id, a.tenant.id));
    const res = await admit(a);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("TENANT_SUSPENDED");
    expect((await list(a)).status).toBe(200);
  });

  it("treats another institute's students, courses and batches as not found (404)", async () => {
    const a = await institute("inst-a");
    const b = await institute("inst-b");
    const mine = (await admit(a)).body.student;
    const theirs = (await admit(b)).body.student;
    const theirCourse = await b.course("HSC", "HSC");
    const theirBatch = await b.batch(theirCourse.id, "Morning");
    const myBatch = await a.batch((await a.course("HSC", "HSC")).id, "Morning");

    expect((await get(a, theirs.id)).status).toBe(404);
    expect((await call(h.update(req("inst-a", "PATCH", "/x", { cookie: a.cookie, body: { full_name: "X" } }), { id: theirs.id }))).status).toBe(404);
    expect((await setStatus(a, theirs.id, "ON_HOLD")).status).toBe(404);
    expect((await call(h.resetPassword(req("inst-a", "POST", "/x", { cookie: a.cookie, body: { temporary_password: "NewPass123" } }), { id: theirs.id }))).status).toBe(404);
    expect((await join(a, theirs.id, myBatch.id)).status).toBe(404);
    expect((await join(a, mine.id, theirBatch.id)).status).toBe(404);
    expect((await admit(a, { course_id: theirCourse.id })).status).toBe(404);
    expect((await admit(a, { batch_ids: [theirBatch.id] })).status).toBe(404);
    expect((await call(h.batchStudents(req("inst-a", "GET", "/x", { cookie: a.cookie }), { id: theirBatch.id }))).status).toBe(404);
    const [theirMembership] = await testDb.insert(batchMemberships).values({ tenantId: b.tenant.id, studentId: theirs.id, batchId: theirBatch.id, startedOn: "2026-01-01" }).returning();
    expect((await call(h.setRoll(req("inst-a", "PATCH", "/x", { cookie: a.cookie, body: { roll_number: "1" } }), { id: theirMembership.id }))).status).toBe(404);
    expect((await call(h.endMembership(req("inst-a", "POST", "/x", { cookie: a.cookie, body: { status: "LEFT" } }), { id: theirMembership.id }))).status).toBe(404);
    expect((await list(a)).body.items.map((s: { id: string }) => s.id)).toEqual([mine.id]);
  });
});

describe("students API: admission and student IDs", () => {
  it("admits a student whose login signs in by student ID into the student portal", async () => {
    const a = await institute("inst-a");
    const res = await admit(a);
    expect(res.status).toBe(201);
    expect(res.body.student).toMatchObject({
      student_code: `${year}-0001`, username: `${year}-0001`, full_name: "Rahim Uddin", status: "ACTIVE", guardian_phone: "01711000111",
      admission_date: todayInDhaka(), must_change_password: true, memberships: [],
    });
    expect(res.body.temporary_password).toBe("Student1234");
    expect(res.body.student.status_history).toEqual([expect.objectContaining({ from_status: null, to_status: "ACTIVE", reason: "Admitted" })]);

    expect((await signIn("inst-a", `${year}-0001`, "Student1234")).status).toBe(200);
    const { permissions: perms } = await getActivePermissions(db, a.tenant.id, res.body.student.user_id);
    expect(resolvePortal(perms)).toBe("student");
    expect((await testDb.select().from(auditLogs).where(eq(auditLogs.action, "STUDENT_ADMITTED")))).toHaveLength(1);
  });

  it("requires the name, gender and guardian contacts, and validates numbers and dates", async () => {
    const a = await institute("inst-a");
    const code = async (b: object) => (await admit(a, b)).body.error.code;
    expect(await code({ full_name: " " })).toBe("VALIDATION_REQUIRED");
    expect(await code({ gender: undefined })).toBe("VALIDATION_REQUEST");
    expect(await code({ guardian_name: "" })).toBe("VALIDATION_REQUIRED");
    expect(await code({ guardian_phone: "" })).toBe("VALIDATION_REQUIRED");
    expect(await code({ guardian_phone: "12345" })).toBe("VALIDATION_PHONE");
    expect(await code({ phone: "02-9999999" })).toBe("VALIDATION_PHONE");
    expect(await code({ date_of_birth: "2010-02-30" })).toBe("VALIDATION_DATE");
    expect(await code({ date_of_birth: "2999-01-01" })).toBe("VALIDATION_DATE");
    expect(await code({ temporary_password: "short" })).toBe("VALIDATION_TEMP_PASSWORD");
    expect(await testDb.select().from(students)).toHaveLength(0); // nothing half-created
  });

  it("builds IDs from the pattern: course code, admission year, a number per course per year", async () => {
    const a = await institute("inst-a");
    await testDb.insert(studentIdSettings).values({ tenantId: a.tenant.id, prefix: "KC", includeCourseCode: true, separator: "-", sequenceWidth: 4 });
    const hsc = await a.course("HSC 2026", "HSC26");
    const ssc = await a.course("SSC 2026", "SSC26");
    const id = async (b: object) => (await admit(a, b)).body.student?.student_code;

    expect((await admit(a)).body.error.code).toBe("VALIDATION_COURSE_REQUIRED");
    expect(await id({ course_id: hsc.id, admission_date: "2026-01-10" })).toBe("KC-HSC26-2026-0001");
    expect(await id({ course_id: hsc.id, admission_date: "2026-03-01" })).toBe("KC-HSC26-2026-0002");
    expect(await id({ course_id: ssc.id, admission_date: "2026-03-01" })).toBe("KC-SSC26-2026-0001");
    expect(await id({ course_id: hsc.id, admission_date: "2025-12-31" })).toBe("KC-HSC26-2025-0001");
    // An Admin-typed ID is kept as typed (upper-cased); the generator skips a number it has taken.
    expect(await id({ course_id: hsc.id, admission_date: "2026-04-01", student_code: "kc-hsc26-2026-0003" })).toBe("KC-HSC26-2026-0003");
    expect(await id({ course_id: hsc.id, admission_date: "2026-04-01" })).toBe("KC-HSC26-2026-0004");

    expect((await admit(a, { course_id: hsc.id, student_code: "KC-HSC26-2026-0001" })).body.error.code).toBe("CONFLICT_STUDENT_CODE");
    expect((await admit(a, { course_id: hsc.id, student_code: "01711000111" })).body.error.code).toBe("VALIDATION_STUDENT_CODE");
    expect((await admit(a, { course_id: hsc.id, student_code: "a@b" })).body.error.code).toBe("VALIDATION_STUDENT_CODE");
    // The admission course can't then be deleted or have its code changed.
    const del = await call(academicHandlers.deleteCourse(req("inst-a", "DELETE", "/x", { cookie: a.cookie }), { id: ssc.id }));
    expect(del.body.error.code).toBe("CONFLICT_COURSE_IN_USE");
    const recode = await call(academicHandlers.updateCourse(req("inst-a", "PATCH", "/x", { cookie: a.cookie, body: { code: "SSC27" } }), { id: ssc.id }));
    expect(recode.body.error.code).toBe("CONFLICT_COURSE_IN_USE");
  });

  it("hands out distinct numbers to simultaneous admissions", async () => {
    const a = await institute("inst-a");
    const results = await Promise.all(Array.from({ length: 6 }, (_, n) => admit(a, { full_name: `Student ${n}` })));
    expect(results.map((r) => r.status)).toEqual(Array(6).fill(201));
    expect(results.map((r) => r.body.student.student_code).sort()).toEqual([1, 2, 3, 4, 5, 6].map((n) => `${year}-000${n}`));
  });

  it("admits into batches of any course, optionally, refusing archived batches", async () => {
    const a = await institute("inst-a");
    const hsc = await a.course("HSC", "HSC");
    const ict = await a.course("ICT", "ICT");
    const morning = await a.batch(hsc.id, "Morning");
    const ictBatch = await a.batch(ict.id, "Weekend");
    const archived = await a.batch(hsc.id, "Old");
    await academic.updateBatch(db, a.actor, archived.id, { status: "ARCHIVED" });

    const res = await admit(a, { course_id: hsc.id, batch_ids: [morning.id, ictBatch.id], admission_date: "2026-02-01" });
    expect(res.body.student.memberships.map((m: { batch_name: string; course_code: string; started_on: string }) => [m.batch_name, m.course_code, m.started_on]).sort()).toEqual([
      ["Morning", "HSC", "2026-02-01"],
      ["Weekend", "ICT", "2026-02-01"],
    ]);
    expect((await admit(a, { batch_ids: [archived.id] })).body.error.code).toBe("CONFLICT_BATCH_ARCHIVED");
    expect((await list(a, `?batch_id=${ictBatch.id}`)).body.items).toHaveLength(1);
    expect((await list(a, `?course_id=${hsc.id}`)).body.items[0].batches.map((b: { name: string }) => b.name)).toEqual(["Morning", "Weekend"]);
    await admit(a, { full_name: "No Batch Yet" });
    expect((await list(a, "?no_batch=true")).body.items.map((s: { full_name: string }) => s.full_name)).toEqual(["No Batch Yet"]);
  });

  it("edits the profile, keeping the login name in step, but never the ID, admission date or course", async () => {
    const a = await institute("inst-a");
    const { student } = (await admit(a)).body;
    const edit = (b: object) => call(h.update(req("inst-a", "PATCH", "/x", { cookie: a.cookie, body: b }), { id: student.id }));
    const res = await edit({ full_name: "Rahim Uddin Khan", guardian_phone: "01999000111", admin_note: "Pays late" });
    expect(res.body).toMatchObject({ full_name: "Rahim Uddin Khan", guardian_phone: "01999000111", admin_note: "Pays late", student_code: student.student_code });
    for (const field of ["student_code", "admission_date", "course_id", "status"]) {
      expect((await edit({ [field]: "x" })).body.error.code).toBe("VALIDATION_FIELD_NOT_EDITABLE");
    }
    const [entry] = await testDb.select().from(auditLogs).where(eq(auditLogs.action, "STUDENT_UPDATED"));
    expect(entry.oldValue).toEqual({ fullName: "Rahim Uddin", guardianPhone: "01711000111", adminNote: null });
  });
});

describe("students API: status", () => {
  it("only lets Active students sign in; On Hold blocks sign-in and keeps memberships", async () => {
    const a = await institute("inst-a");
    const morning = await a.batch((await a.course("HSC", "HSC")).id, "Morning");
    const { student } = (await admit(a, { batch_ids: [morning.id] })).body;
    const session = await signIn("inst-a", student.student_code, "Student1234");
    expect(session.status).toBe(200);

    const held = await setStatus(a, student.id, "ON_HOLD");
    expect(held.body).toMatchObject({ status: "ON_HOLD", memberships: [expect.objectContaining({ status: "ACTIVE" })] });
    expect((await signIn("inst-a", student.student_code, "Student1234")).status).not.toBe(200);
    expect((await setStatus(a, student.id, "ACTIVE")).body.status).toBe("ACTIVE");
    expect((await signIn("inst-a", student.student_code, "Student1234")).status).toBe(200);
  });

  it("closes active memberships when a student completes or leaves, and needs reasons for leaving and returning", async () => {
    const a = await institute("inst-a");
    const hsc = await a.course("HSC", "HSC");
    const morning = await a.batch(hsc.id, "Morning");
    const evening = await a.batch(hsc.id, "Evening");
    const { student } = (await admit(a, { batch_ids: [morning.id, evening.id], admission_date: "2026-01-01" })).body;

    expect((await setStatus(a, student.id, "LEFT")).body.error.code).toBe("VALIDATION_REASON_REQUIRED");
    const left = await setStatus(a, student.id, "LEFT", "Moved to Chattogram");
    expect(left.body.memberships.map((m: { status: string; ended_on: string }) => [m.status, m.ended_on])).toEqual([
      ["LEFT", todayInDhaka()],
      ["LEFT", todayInDhaka()],
    ]);
    expect((await setStatus(a, student.id, "COMPLETED")).body.error.code).toBe("CONFLICT_STATUS_TRANSITION");
    expect((await join(a, student.id, morning.id)).body.error.code).toBe("CONFLICT_STUDENT_NOT_CURRENT");
    expect((await setStatus(a, student.id, "ACTIVE")).body.error.code).toBe("VALIDATION_REASON_REQUIRED");

    const back = await setStatus(a, student.id, "ACTIVE", "Came back for the test batch");
    expect(back.body.status).toBe("ACTIVE");
    expect(back.body.memberships.every((m: { status: string }) => m.status === "LEFT")).toBe(true); // stay closed
    expect(back.body.status_history.map((h: { to_status: string; reason: string }) => [h.to_status, h.reason])).toEqual([
      ["ACTIVE", "Came back for the test batch"],
      ["LEFT", "Moved to Chattogram"],
      ["ACTIVE", "Admitted"],
    ]);
    expect((await join(a, student.id, morning.id)).status).toBe(201); // rejoins with a new membership
  });
});

describe("students API: batch memberships", () => {
  it("adds, numbers and ends memberships; ending one doesn't change the overall status", async () => {
    const a = await institute("inst-a");
    const hsc = await a.course("HSC", "HSC");
    const morning = await a.batch(hsc.id, "Morning");
    const s1 = (await admit(a, { full_name: "Anika" })).body.student;
    const s2 = (await admit(a, { full_name: "Bashir" })).body.student;
    const s3 = (await admit(a, { full_name: "Chaity" })).body.student;

    const m1 = (await join(a, s1.id, morning.id, { roll_number: "10" })).body;
    expect((await join(a, s1.id, morning.id)).body.error.code).toBe("CONFLICT_ALREADY_IN_BATCH");
    expect((await join(a, s2.id, morning.id, { roll_number: "10" })).body.error.code).toBe("CONFLICT_ROLL_NUMBER");
    await join(a, s2.id, morning.id, { roll_number: "2" });
    await join(a, s3.id, morning.id);
    const roster = await call(h.batchStudents(req("inst-a", "GET", "/x", { cookie: a.cookie }), { id: morning.id }));
    expect(roster.body.map((r: { full_name: string; roll_number: string | null }) => [r.roll_number, r.full_name])).toEqual([
      ["2", "Bashir"],
      ["10", "Anika"],
      [null, "Chaity"],
    ]);

    expect((await call(h.setRoll(req("inst-a", "PATCH", "/x", { cookie: a.cookie, body: { roll_number: "1" } }), { id: m1.id }))).body.roll_number).toBe("1");
    const ended = await call(h.endMembership(req("inst-a", "POST", "/x", { cookie: a.cookie, body: { status: "COMPLETED" } }), { id: m1.id }));
    expect(ended.status).toBe(204);
    expect((await get(a, s1.id)).body).toMatchObject({ status: "ACTIVE", memberships: [expect.objectContaining({ status: "COMPLETED", ended_on: todayInDhaka() })] });
    expect((await call(h.endMembership(req("inst-a", "POST", "/x", { cookie: a.cookie, body: { status: "LEFT" } }), { id: m1.id }))).body.error.code).toBe("CONFLICT_MEMBERSHIP_CLOSED");
    expect((await call(h.endMembership(req("inst-a", "POST", "/x", { cookie: a.cookie, body: { status: "LEFT", ended_on: "2000-01-01" } }), { id: roster.body[0].membership_id }))).body.error.code).toBe("VALIDATION_DATE");
  });

  it("keeps a batch with students from being deleted", async () => {
    const a = await institute("inst-a");
    const morning = await a.batch((await a.course("HSC", "HSC")).id, "Morning");
    await admit(a, { batch_ids: [morning.id] });
    const res = await call(academicHandlers.deleteBatch(req("inst-a", "DELETE", "/x", { cookie: a.cookie }), { id: morning.id }));
    expect(res.body.error.code).toBe("CONFLICT_BATCH_IN_USE");
    expect(res.body.error.details.references).toEqual([{ type: "BATCH_MEMBERSHIP", count: 1 }]);
  });
});

describe("student photos", () => {
  it("are visible to staff, the student themself, and instructors who teach the student's batch", async () => {
    const a = await institute("inst-a");
    const storage = new LocalDiskStorage(await mkdtemp(path.join(os.tmpdir(), "cms-files-")));
    const bytes = await sharp({ create: { width: 60, height: 80, channels: 3, background: "#888" } }).jpeg().toBuffer();
    const photo = await uploadFile(db, storage, a.actor, { category: "STUDENT_PHOTO", filename: "p.jpg", bytes });
    const hsc = await a.course("HSC", "HSC");
    const physics = await academic.createSubject(db, a.actor, hsc.id, { name: "Physics" });
    const morning = await a.batch(hsc.id, "Morning");
    const batchPhysics = await academic.addBatchSubject(db, a.actor, morning.id, physics.id);
    const { student } = (await admit(a, { photo_file_id: photo.id, batch_ids: [morning.id] })).body;

    const teacherLogin = await createLogin(db, { tenantId: a.tenant.id, name: "T", email: "t@a.test", password: "TeachPass1" });
    const [teacher] = await testDb.insert(instructors).values({ tenantId: a.tenant.id, userId: teacherLogin.id, fullName: "Teacher" }).returning();
    const otherLogin = await createLogin(db, { tenantId: a.tenant.id, name: "O", email: "o@a.test", password: "TeachPass1" });
    await testDb.insert(instructors).values({ tenantId: a.tenant.id, userId: otherLogin.id, fullName: "Other" });
    await academic.setBatchSubjectInstructors(db, a.actor, batchPhysics.id, [teacher.id]);

    const as = (userId: string, perms: string[]) => canViewFile(db, { tenantId: a.tenant.id, userId, permissions: new Set(perms) }, photo);
    expect(await as(a.owner.id, ["students.view"])).toBe(true);
    expect(await as(student.user_id, ["student.self.view"])).toBe(true);
    expect(await as(teacherLogin.id, ["batches.own.view"])).toBe(true);
    expect(await as(otherLogin.id, ["batches.own.view"])).toBe(false);
    const someoneElse = (await admit(a, { full_name: "Someone Else" })).body.student;
    expect(await as(someoneElse.user_id, ["student.self.view"])).toBe(false);

    // Once the student leaves the batch, its instructor no longer sees the photo.
    await setStatus(a, student.id, "LEFT", "Moved");
    expect(await as(teacherLogin.id, ["batches.own.view"])).toBe(false);
  });
});
