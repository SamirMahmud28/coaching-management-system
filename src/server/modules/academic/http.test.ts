import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "../../core/testing/db";
import { auditLogs, batchSubjectInstructors, batchSubjects, instructors, scheduleSlots, tenants, userRoles } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import { INSTITUTE_OWNER_ROLE } from "../../core/rbac/catalog";
import { createLogin } from "../auth/credentials";
import { createTenantAuth } from "../auth/tenant-auth";
import { seedBaselineRoles } from "../rbac/service";
import { createAcademicHandlers } from "./http";
import { academicReferences } from "./references";

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;
const host = { baseDomain: "localhost:3000", platformHost: "admin.localhost:3000" };
const auth = createTenantAuth(db, { secret: "test-secret-".padEnd(40, "x"), host, protocol: "http" });
const h = createAcademicHandlers({ db, auth, host });

// Stands in for another module's table that refers to batches (students' memberships).
let batchInUse: string | null = null;
academicReferences.register("BATCH", "TEST_MEMBERSHIP", async (_db, _tenantId, id) => (id === batchInUse ? 3 : 0));

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
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

async function institute(sub: string) {
  const [tenant] = await testDb.insert(tenants).values({ name: sub, subdomain: sub, status: "ACTIVE" }).returning();
  const roleIds = await seedBaselineRoles(db, tenant.id);
  const owner = await createLogin(db, { tenantId: tenant.id, name: "Owner", email: `owner@${sub}.test`, password: "OwnerPass1", mustChangePassword: false });
  await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: owner.id, roleId: roleIds[INSTITUTE_OWNER_ROLE] });
  await testDb.update(tenants).set({ ownerUserId: owner.id }).where(eq(tenants.id, tenant.id));
  const withRole = async (roleId: string, email: string) => {
    const user = await createLogin(db, { tenantId: tenant.id, name: email, email, password: "SomePass1", mustChangePassword: false });
    await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: user.id, roleId });
    return signIn(sub, email, "SomePass1");
  };
  const instructor = async (fullName: string, status: "ACTIVE" | "INACTIVE" = "ACTIVE") => {
    const user = await createLogin(db, { tenantId: tenant.id, name: fullName, email: `${fullName.toLowerCase().replace(/\W/g, "")}@${sub}.test`, password: "TeachPass1", mustChangePassword: false });
    const [row] = await testDb.insert(instructors).values({ tenantId: tenant.id, userId: user.id, fullName, status }).returning();
    return row;
  };
  return { sub, tenant, roleIds, cookie: await signIn(sub, `owner@${sub}.test`, "OwnerPass1"), withRole, instructor };
}
type Institute = Awaited<ReturnType<typeof institute>>;

async function call(res: Promise<Response>) {
  const r = await res;
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
}
const createCourse = (i: Institute, body: object = { name: "HSC 2026 Science", code: "HSC26", due_day: 10 }, cookie = i.cookie) =>
  call(h.createCourse(req(i.sub, "POST", "/api/v1/courses", { cookie, body })));
const createSubject = (i: Institute, courseId: string, name: string) =>
  call(h.createSubject(req(i.sub, "POST", `/api/v1/courses/${courseId}/subjects`, { cookie: i.cookie, body: { name } }), { id: courseId }));
const createBatch = (i: Institute, courseId: string, name: string) =>
  call(h.createBatch(req(i.sub, "POST", `/api/v1/courses/${courseId}/batches`, { cookie: i.cookie, body: { name } }), { id: courseId }));
const addSubject = (i: Institute, batchId: string, subjectId: string) =>
  call(h.addBatchSubject(req(i.sub, "POST", `/api/v1/batches/${batchId}/subjects`, { cookie: i.cookie, body: { subject_id: subjectId } }), { id: batchId }));
const setInstructors = (i: Institute, batchSubjectId: string, ids: string[]) =>
  call(h.setInstructors(req(i.sub, "PUT", `/api/v1/batch-subjects/${batchSubjectId}/instructors`, { cookie: i.cookie, body: { instructor_ids: ids } }), { id: batchSubjectId }));
const addSlot = (i: Institute, batchSubjectId: string, weekday: string, startsAt: string, endsAt: string) =>
  call(h.addSlot(req(i.sub, "POST", `/api/v1/batch-subjects/${batchSubjectId}/slots`, { cookie: i.cookie, body: { weekday, starts_at: startsAt, ends_at: endsAt } }), { id: batchSubjectId }));
const getBatch = (i: Institute, id: string, cookie = i.cookie) => call(h.getBatch(req(i.sub, "GET", `/api/v1/batches/${id}`, { cookie }), { id }));

/** A course with Physics and Chemistry, and a batch teaching Physics. */
async function setUp(i: Institute) {
  const course = (await createCourse(i)).body;
  const physics = (await createSubject(i, course.id, "Physics")).body;
  const chemistry = (await createSubject(i, course.id, "Chemistry")).body;
  const batch = (await createBatch(i, course.id, "Morning")).body;
  const batchPhysics = (await addSubject(i, batch.id, physics.id)).body;
  return { course, physics, chemistry, batch, batchPhysics };
}

describe("academic API: access", () => {
  it("lets the Accountant view but not change; instructors and students get 403, signed-out 401", async () => {
    const a = await institute("inst-a");
    const { course } = await setUp(a);
    const accountant = await a.withRole(a.roleIds.Accountant, "acc@a.test");
    expect((await call(h.listCourses(req("inst-a", "GET", "/api/v1/courses", { cookie: accountant })))).status).toBe(200);
    expect((await call(h.getCourse(req("inst-a", "GET", `/api/v1/courses/${course.id}`, { cookie: accountant }), { id: course.id }))).status).toBe(200);
    expect((await createCourse(a, { name: "SSC", code: "SSC" }, accountant)).status).toBe(403);

    for (const role of ["Instructor", "Student"] as const) {
      const cookie = await a.withRole(a.roleIds[role], `${role}@a.test`);
      expect((await call(h.listCourses(req("inst-a", "GET", "/api/v1/courses", { cookie })))).status).toBe(403);
      expect((await call(h.listBatches(req("inst-a", "GET", "/api/v1/batches", { cookie })))).status).toBe(403);
    }
    expect((await call(h.listCourses(req("inst-a", "GET", "/api/v1/courses")))).status).toBe(401);
    expect((await call(h.assignableInstructors(req("inst-a", "GET", "/api/v1/academic/assignable-instructors", { cookie: accountant })))).status).toBe(403);
  });

  it("allows reads but refuses changes while the institute is suspended", async () => {
    const a = await institute("inst-a");
    await setUp(a);
    await testDb.update(tenants).set({ status: "SUSPENDED" }).where(eq(tenants.id, a.tenant.id));
    expect((await call(h.listCourses(req("inst-a", "GET", "/api/v1/courses", { cookie: a.cookie })))).status).toBe(200);
    const res = await createCourse(a, { name: "SSC", code: "SSC" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("TENANT_SUSPENDED");
  });

  it("treats another institute's ids, and malformed ids, as not found (404)", async () => {
    const a = await institute("inst-a");
    const b = await institute("inst-b");
    const mine = await setUp(a);
    const theirs = await setUp(b);
    const theirTeacher = await b.instructor("Rahim");

    const id = theirs.course.id;
    expect((await call(h.getCourse(req("inst-a", "GET", `/api/v1/courses/${id}`, { cookie: a.cookie }), { id }))).status).toBe(404);
    expect((await call(h.updateCourse(req("inst-a", "PATCH", `/api/v1/courses/${id}`, { cookie: a.cookie, body: { name: "Mine now" } }), { id }))).status).toBe(404);
    expect((await call(h.deleteCourse(req("inst-a", "DELETE", `/api/v1/courses/${id}`, { cookie: a.cookie }), { id }))).status).toBe(404);
    expect((await createSubject(a, id, "Biology")).status).toBe(404);
    expect((await createBatch(a, id, "Evening")).status).toBe(404);
    expect((await getBatch(a, theirs.batch.id)).status).toBe(404);
    expect((await addSubject(a, mine.batch.id, theirs.chemistry.id)).status).toBe(404);
    expect((await addSubject(a, theirs.batch.id, mine.chemistry.id)).status).toBe(404);
    expect((await setInstructors(a, theirs.batchPhysics.id, [])).status).toBe(404);
    expect((await setInstructors(a, mine.batchPhysics.id, [theirTeacher.id])).status).toBe(404);
    expect((await addSlot(a, theirs.batchPhysics.id, "SAT", "16:00", "17:00")).status).toBe(404);
    expect((await call(h.deleteSubject(req("inst-a", "DELETE", "/x", { cookie: a.cookie }), { id: theirs.chemistry.id }))).status).toBe(404);
    expect((await call(h.getCourse(req("inst-a", "GET", "/api/v1/courses/not-a-uuid", { cookie: a.cookie }), { id: "not-a-uuid" }))).status).toBe(404);

    const list = await call(h.listCourses(req("inst-a", "GET", "/api/v1/courses", { cookie: a.cookie })));
    expect(list.body.map((c: { id: string }) => c.id)).toEqual([mine.course.id]);
  });
});

describe("academic API: courses and subjects", () => {
  it("creates a course with a normalised code, and refuses bad codes, due days and duplicates", async () => {
    const a = await institute("inst-a");
    const created = await createCourse(a, { name: "HSC 2026 Science", code: " hsc26 ", due_day: 31 });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: "HSC 2026 Science", code: "HSC26", due_day: 31, status: "ACTIVE" });

    expect((await createCourse(a, { name: "X", code: "26HSC" })).body.error.code).toBe("VALIDATION_COURSE_CODE");
    expect((await createCourse(a, { name: "X", code: "HSC-26" })).body.error.code).toBe("VALIDATION_COURSE_CODE");
    expect((await createCourse(a, { name: "X", code: "X1", due_day: 30 })).body.error.code).toBe("VALIDATION_DUE_DAY");
    expect((await createCourse(a, { name: "hsc 2026 science", code: "OTHER" })).body.error.code).toBe("CONFLICT_COURSE_NAME");
    expect((await createCourse(a, { name: "Other", code: "HSC26" })).body.error.code).toBe("CONFLICT_COURSE_CODE");

    // The same name and code are fine in another institute.
    const b = await institute("inst-b");
    expect((await createCourse(b, { name: "HSC 2026 Science", code: "HSC26" })).status).toBe(201);
  });

  it("lists courses with counts of active subjects and batches, and edits a course", async () => {
    const a = await institute("inst-a");
    const { course } = await setUp(a);
    const list = await call(h.listCourses(req("inst-a", "GET", "/api/v1/courses", { cookie: a.cookie })));
    expect(list.body).toEqual([expect.objectContaining({ id: course.id, subject_count: 2, batch_count: 1 })]);
    const detail = await call(h.getCourse(req("inst-a", "GET", "/x", { cookie: a.cookie }), { id: course.id }));
    expect(detail.body.subjects.map((s: { name: string }) => s.name)).toEqual(["Chemistry", "Physics"]);
    expect(detail.body.batches).toEqual([expect.objectContaining({ name: "Morning", subject_count: 1 })]);

    const edited = await call(h.updateCourse(req("inst-a", "PATCH", "/x", { cookie: a.cookie, body: { name: "HSC 2026", due_day: null } }), { id: course.id }));
    expect(edited.body).toMatchObject({ name: "HSC 2026", code: "HSC26", due_day: null });
    const [entry] = await testDb.select().from(auditLogs).where(and(eq(auditLogs.action, "COURSE_UPDATED"), eq(auditLogs.resourceId, course.id)));
    expect(entry.oldValue).toMatchObject({ name: "HSC 2026 Science", dueDay: 10 });
  });

  it("archives a course, after which no subjects or batches can be added until it's restored", async () => {
    const a = await institute("inst-a");
    const { course } = await setUp(a);
    const archive = (status: string) => call(h.setCourseStatus(req("inst-a", "PATCH", "/x", { cookie: a.cookie, body: { status } }), { id: course.id }));
    expect((await archive("ARCHIVED")).body.status).toBe("ARCHIVED");
    expect((await createSubject(a, course.id, "Biology")).body.error.code).toBe("CONFLICT_COURSE_ARCHIVED");
    expect((await createBatch(a, course.id, "Evening")).body.error.code).toBe("CONFLICT_COURSE_ARCHIVED");
    const active = await call(h.listCourses(req("inst-a", "GET", "/api/v1/courses?status=ACTIVE", { cookie: a.cookie })));
    expect(active.body).toHaveLength(0);
    expect((await archive("ACTIVE")).body.status).toBe("ACTIVE");
    expect((await createSubject(a, course.id, "Biology")).status).toBe(201);
    const actions = (await testDb.select().from(auditLogs).where(eq(auditLogs.resourceId, course.id))).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["COURSE_CREATED", "COURSE_ARCHIVED", "COURSE_RESTORED"]));
  });

  it("deletes only an unused course or subject; anything in use must be archived instead", async () => {
    const a = await institute("inst-a");
    const { course, physics, chemistry } = await setUp(a);
    const delCourse = (id: string) => call(h.deleteCourse(req("inst-a", "DELETE", "/x", { cookie: a.cookie }), { id }));
    const delSubject = (id: string) => call(h.deleteSubject(req("inst-a", "DELETE", "/x", { cookie: a.cookie }), { id }));

    const refused = await delCourse(course.id);
    expect(refused.body.error.code).toBe("CONFLICT_COURSE_IN_USE");
    expect(refused.body.error.details.references).toEqual(expect.arrayContaining([{ type: "SUBJECT", count: 2 }, { type: "BATCH", count: 1 }]));
    expect((await delSubject(physics.id)).body.error.code).toBe("CONFLICT_SUBJECT_IN_USE"); // taught in the Morning batch
    expect((await delSubject(chemistry.id)).status).toBe(204);

    const empty = (await createCourse(a, { name: "Spoken English", code: "ENG" })).body;
    expect((await delCourse(empty.id)).status).toBe(204);
  });

  it("archives a subject: a batch can't take it on any more", async () => {
    const a = await institute("inst-a");
    const { chemistry, batch } = await setUp(a);
    const res = await call(h.updateSubject(req("inst-a", "PATCH", "/x", { cookie: a.cookie, body: { status: "ARCHIVED" } }), { id: chemistry.id }));
    expect(res.body.status).toBe("ARCHIVED");
    expect((await addSubject(a, batch.id, chemistry.id)).body.error.code).toBe("CONFLICT_SUBJECT_ARCHIVED");
  });
});

describe("academic API: batches", () => {
  it("adds only the course's own subjects to a batch, once each", async () => {
    const a = await institute("inst-a");
    const { batch, physics, chemistry } = await setUp(a);
    const other = (await createCourse(a, { name: "SSC 2026", code: "SSC26" })).body;
    const english = (await createSubject(a, other.id, "English")).body;

    expect((await addSubject(a, batch.id, english.id)).body.error.code).toBe("VALIDATION_SUBJECT_COURSE");
    expect((await addSubject(a, batch.id, physics.id)).body.error.code).toBe("CONFLICT_BATCH_SUBJECT_EXISTS");
    expect((await addSubject(a, batch.id, chemistry.id)).status).toBe(201);
    // Even bypassing the service, the database refuses a subject from another course.
    await expect(testDb.insert(batchSubjects).values({ tenantId: a.tenant.id, courseId: batch.course_id, batchId: batch.id, subjectId: english.id })).rejects.toThrow();
  });

  it("names batches uniquely within a course and archives them", async () => {
    const a = await institute("inst-a");
    const { course, batch } = await setUp(a);
    expect((await createBatch(a, course.id, "morning")).body.error.code).toBe("CONFLICT_BATCH_NAME");
    const other = (await createCourse(a, { name: "SSC 2026", code: "SSC26" })).body;
    expect((await createBatch(a, other.id, "Morning")).status).toBe(201);

    const archived = await call(h.updateBatch(req("inst-a", "PATCH", "/x", { cookie: a.cookie, body: { status: "ARCHIVED" } }), { id: batch.id }));
    expect(archived.body.status).toBe("ARCHIVED");
    const listed = await call(h.listBatches(req("inst-a", "GET", `/api/v1/batches?course_id=${course.id}&status=ACTIVE`, { cookie: a.cookie })));
    expect(listed.body).toHaveLength(0);
  });

  it("assigns active instructors to a batch subject and shows them with the schedule", async () => {
    const a = await institute("inst-a");
    const { batch, batchPhysics } = await setUp(a);
    const rahim = await a.instructor("Rahim");
    const karim = await a.instructor("Karim");
    const gone = await a.instructor("Gone", "INACTIVE");

    expect((await setInstructors(a, batchPhysics.id, [rahim.id, karim.id, rahim.id])).status).toBe(204);
    expect((await setInstructors(a, batchPhysics.id, [gone.id])).body.error.code).toBe("CONFLICT_INSTRUCTOR_INACTIVE");
    expect((await addSlot(a, batchPhysics.id, "SUN", "16:00", "17:30")).status).toBe(201);
    expect((await addSlot(a, batchPhysics.id, "SAT", "9:00", "10:00")).body.error.code).toBe("VALIDATION_TIME");
    expect((await addSlot(a, batchPhysics.id, "SAT", "09:00", "10:00")).status).toBe(201);

    const got = await getBatch(a, batch.id);
    expect(got.body.course).toMatchObject({ code: "HSC26" });
    expect(got.body.subjects).toEqual([
      expect.objectContaining({
        subject_name: "Physics",
        instructors: [expect.objectContaining({ full_name: "Karim" }), expect.objectContaining({ full_name: "Rahim" })],
        slots: [expect.objectContaining({ weekday: "SAT", starts_at: "09:00", ends_at: "10:00" }), expect.objectContaining({ weekday: "SUN", starts_at: "16:00", ends_at: "17:30" })],
      }),
    ]);

    const picker = await call(h.assignableInstructors(req("inst-a", "GET", "/x", { cookie: a.cookie })));
    expect(picker.body.map((i: { full_name: string }) => i.full_name)).toEqual(["Karim", "Rahim"]);

    // Deactivated after being assigned: can stay on the list until removed, but can't be added back.
    await testDb.update(instructors).set({ status: "INACTIVE" }).where(eq(instructors.id, rahim.id));
    expect((await setInstructors(a, batchPhysics.id, [rahim.id])).status).toBe(204);
    expect((await setInstructors(a, batchPhysics.id, [])).status).toBe(204);
    expect(await testDb.select().from(batchSubjectInstructors)).toHaveLength(0);
    expect((await setInstructors(a, batchPhysics.id, [rahim.id])).body.error.code).toBe("CONFLICT_INSTRUCTOR_INACTIVE");
  });

  it("validates class times and refuses two classes of a subject starting together", async () => {
    const a = await institute("inst-a");
    const { batchPhysics } = await setUp(a);
    expect((await addSlot(a, batchPhysics.id, "MON", "17:00", "16:00")).body.error.code).toBe("VALIDATION_TIME_ORDER");
    expect((await addSlot(a, batchPhysics.id, "MON", "17:00", "17:00")).body.error.code).toBe("VALIDATION_TIME_ORDER");
    expect((await addSlot(a, batchPhysics.id, "XYZ", "16:00", "17:00")).body.error.code).toBe("VALIDATION_REQUEST");
    expect((await addSlot(a, batchPhysics.id, "MON", "16:00", "17:00")).status).toBe(201);
    expect((await addSlot(a, batchPhysics.id, "MON", "16:00", "18:00")).body.error.code).toBe("CONFLICT_SLOT_EXISTS");
  });

  it("refuses a class time when an instructor already teaches at an overlapping time", async () => {
    const a = await institute("inst-a");
    const { course, batchPhysics, chemistry } = await setUp(a);
    const evening = (await createBatch(a, course.id, "Evening")).body;
    const eveningChem = (await addSubject(a, evening.id, chemistry.id)).body;
    const rahim = await a.instructor("Rahim");
    await setInstructors(a, batchPhysics.id, [rahim.id]);
    await setInstructors(a, eveningChem.id, [rahim.id]);

    expect((await addSlot(a, batchPhysics.id, "SAT", "16:00", "17:00")).status).toBe(201);
    const clash = await addSlot(a, eveningChem.id, "SAT", "16:30", "17:30");
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("CONFLICT_INSTRUCTOR_CLASH");
    expect(clash.body.error.message).toBe("Rahim already teaches Physics (Morning) on Saturday, 16:00–17:00.");
    expect(clash.body.error.details.clashes).toEqual([{ instructorName: "Rahim", batchName: "Morning", subjectName: "Physics", weekday: "SAT", startsAt: "16:00", endsAt: "17:00" }]);
    // The same subject can't meet twice at overlapping times either.
    expect((await addSlot(a, batchPhysics.id, "SAT", "16:30", "17:30")).body.error.code).toBe("CONFLICT_INSTRUCTOR_CLASH");
    // Back-to-back classes and other days are fine.
    expect((await addSlot(a, eveningChem.id, "SAT", "17:00", "18:00")).status).toBe(201);
    expect((await addSlot(a, eveningChem.id, "SAT", "15:00", "16:00")).status).toBe(201);
    expect((await addSlot(a, eveningChem.id, "SUN", "16:00", "17:00")).status).toBe(201);
    expect(await testDb.select().from(scheduleSlots)).toHaveLength(4);
  });

  it("refuses to assign an instructor who teaches elsewhere at the subject's class times", async () => {
    const a = await institute("inst-a");
    const { course, batchPhysics, chemistry } = await setUp(a);
    const evening = (await createBatch(a, course.id, "Evening")).body;
    const eveningChem = (await addSubject(a, evening.id, chemistry.id)).body;
    const rahim = await a.instructor("Rahim");
    const karim = await a.instructor("Karim");
    await setInstructors(a, batchPhysics.id, [rahim.id]);
    await addSlot(a, batchPhysics.id, "MON", "10:00", "11:00");
    await addSlot(a, eveningChem.id, "MON", "10:30", "11:30");

    const refused = await setInstructors(a, eveningChem.id, [karim.id, rahim.id]);
    expect(refused.body.error.code).toBe("CONFLICT_INSTRUCTOR_CLASH");
    expect(await testDb.select().from(batchSubjectInstructors).where(eq(batchSubjectInstructors.batchSubjectId, eveningChem.id))).toHaveLength(0);
    expect((await setInstructors(a, eveningChem.id, [karim.id])).status).toBe(204);
  });

  it("ignores archived batches, but refuses to restore one whose classes now clash", async () => {
    const a = await institute("inst-a");
    const { course, batch, batchPhysics, chemistry } = await setUp(a);
    const rahim = await a.instructor("Rahim");
    await setInstructors(a, batchPhysics.id, [rahim.id]);
    await addSlot(a, batchPhysics.id, "TUE", "18:00", "19:00");
    const setBatchStatus = (id: string, status: string) => call(h.updateBatch(req("inst-a", "PATCH", "/x", { cookie: a.cookie, body: { status } }), { id }));
    expect((await setBatchStatus(batch.id, "ARCHIVED")).status).toBe(200);

    const evening = (await createBatch(a, course.id, "Evening")).body;
    const eveningChem = (await addSubject(a, evening.id, chemistry.id)).body;
    await setInstructors(a, eveningChem.id, [rahim.id]);
    expect((await addSlot(a, eveningChem.id, "TUE", "18:00", "19:00")).status).toBe(201); // Morning is archived

    const restore = await setBatchStatus(batch.id, "ACTIVE");
    expect(restore.body.error.code).toBe("CONFLICT_INSTRUCTOR_CLASH");
    expect(restore.body.error.message).toContain("Chemistry (Evening)");
  });

  it("removes a slot, and removes a batch subject together with its instructors and schedule", async () => {
    const a = await institute("inst-a");
    const { batch, batchPhysics } = await setUp(a);
    const rahim = await a.instructor("Rahim");
    await setInstructors(a, batchPhysics.id, [rahim.id]);
    const slot = (await addSlot(a, batchPhysics.id, "SAT", "16:00", "17:00")).body;
    await addSlot(a, batchPhysics.id, "MON", "16:00", "17:00");

    expect((await call(h.removeSlot(req("inst-a", "DELETE", "/x", { cookie: a.cookie }), { id: slot.id }))).status).toBe(204);
    expect(await testDb.select().from(scheduleSlots)).toHaveLength(1);
    expect((await call(h.removeBatchSubject(req("inst-a", "DELETE", "/x", { cookie: a.cookie }), { id: batchPhysics.id }))).status).toBe(204);
    expect(await testDb.select().from(scheduleSlots)).toHaveLength(0);
    expect(await testDb.select().from(batchSubjectInstructors)).toHaveLength(0);
    expect((await getBatch(a, batch.id)).body.subjects).toEqual([]);
  });

  it("deletes an unused batch, but not one another module refers to", async () => {
    const a = await institute("inst-a");
    const { batch } = await setUp(a);
    const delBatch = () => call(h.deleteBatch(req("inst-a", "DELETE", "/x", { cookie: a.cookie }), { id: batch.id }));
    batchInUse = batch.id;
    const refused = await delBatch();
    expect(refused.body.error.code).toBe("CONFLICT_BATCH_IN_USE");
    expect(refused.body.error.details.references).toEqual([{ type: "TEST_MEMBERSHIP", count: 3 }]);
    batchInUse = null;
    expect((await delBatch()).status).toBe(204);
    expect(await testDb.select().from(batchSubjects)).toHaveLength(0);
  });
});
