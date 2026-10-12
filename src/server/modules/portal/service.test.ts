import sharp from "sharp";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../core/testing/db";
import { institutionProfiles, instructors, tenants, userRoles } from "../../core/db/schema";
import { INSTITUTE_OWNER_ROLE } from "../../core/rbac/catalog";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import { uploadFile } from "../../core/files/service";
import { LocalDiskStorage } from "../../core/files/storage";
import * as academic from "../academic/service";
import { createLogin } from "../auth/credentials";
import { createFilesHandlers } from "../files/http";
import { createTenantAuth } from "../auth/tenant-auth";
import { seedBaselineRoles } from "../rbac/service";
import * as students from "../students/service";
import { getDashboardCounts, getInstructorBatch, getInstructorHome, getPublicCatalog, getStudentHome, publicPageVisible } from "./service";

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;

beforeEach(async () => {
  await reset();
  await seedPlatformCatalog(testDb);
});
afterAll(async () => {
  await close();
});

const guardian = { guardianName: "Karim", guardianRelation: "FATHER" as const, guardianPhone: "01711000111" };

/** An institute with HSC (Physics, Chemistry), batches Morning and Evening, and an archived Old batch. */
async function institute(sub: string) {
  const [tenant] = await testDb.insert(tenants).values({ name: sub, subdomain: sub, status: "ACTIVE" }).returning();
  const roleIds = await seedBaselineRoles(db, tenant.id);
  const owner = await createLogin(db, { tenantId: tenant.id, name: "Owner", email: `owner@${sub}.test`, password: "OwnerPass1" });
  await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: owner.id, roleId: roleIds[INSTITUTE_OWNER_ROLE] });
  const actor = { tenantId: tenant.id, userId: owner.id };
  const teacher = async (name: string) => {
    const login = await createLogin(db, { tenantId: tenant.id, name, email: `${name.toLowerCase()}@${sub}.test`, password: "TeachPass1" });
    const [row] = await testDb.insert(instructors).values({ tenantId: tenant.id, userId: login.id, fullName: name }).returning();
    return { ...row, userId: login.id };
  };
  const hsc = await academic.createCourse(db, actor, { name: "HSC 2026", code: "HSC26", description: "Science group" });
  const physics = await academic.createSubject(db, actor, hsc.id, { name: "Physics" });
  const chemistry = await academic.createSubject(db, actor, hsc.id, { name: "Chemistry" });
  const morning = await academic.createBatch(db, actor, hsc.id, { name: "Morning" });
  const evening = await academic.createBatch(db, actor, hsc.id, { name: "Evening" });
  const old = await academic.createBatch(db, actor, hsc.id, { name: "Old" });
  const mPhysics = await academic.addBatchSubject(db, actor, morning.id, physics.id);
  const mChemistry = await academic.addBatchSubject(db, actor, morning.id, chemistry.id);
  const ePhysics = await academic.addBatchSubject(db, actor, evening.id, physics.id);
  const oPhysics = await academic.addBatchSubject(db, actor, old.id, physics.id);
  const rahim = await teacher("Rahim");
  const karim = await teacher("Karim");
  await academic.setBatchSubjectInstructors(db, actor, mPhysics.id, [rahim.id]);
  await academic.setBatchSubjectInstructors(db, actor, mChemistry.id, [karim.id]);
  await academic.setBatchSubjectInstructors(db, actor, ePhysics.id, [karim.id]);
  await academic.setBatchSubjectInstructors(db, actor, oPhysics.id, [rahim.id]);
  await academic.addScheduleSlot(db, actor, mPhysics.id, { weekday: "SUN", startsAt: "16:00", endsAt: "17:00" });
  await academic.addScheduleSlot(db, actor, mPhysics.id, { weekday: "SAT", startsAt: "09:00", endsAt: "10:00" });
  await academic.addScheduleSlot(db, actor, mChemistry.id, { weekday: "SAT", startsAt: "10:00", endsAt: "11:00" });
  await academic.updateBatch(db, actor, old.id, { status: "ARCHIVED" });
  const admit = async (fullName: string, batchIds: string[], extra: Partial<students.AdmitInput> = {}) =>
    (await students.admitStudent(db, actor, { fullName, gender: "FEMALE", ...guardian, batchIds, temporaryPassword: "Student123", ...extra })).student;
  return { tenant, actor, hsc, physics, morning, evening, old, rahim, karim, admit };
}

describe("instructor portal (D24, D60)", () => {
  it("lists only the active batches the instructor teaches, the subjects they teach there, and their week", async () => {
    const a = await institute("inst-a");
    await a.admit("Anika", [a.morning.id]);
    const home = await getInstructorHome(db, a.tenant.id, a.rahim.userId);
    expect(home.batches).toEqual([expect.objectContaining({ name: "Morning", courseCode: "HSC26", mySubjects: ["Physics"], studentCount: 1 })]);
    expect(home.week.map((w) => [w.weekday, w.startsAt, w.subjectName, w.batchName])).toEqual([
      ["SAT", "09:00", "Physics", "Morning"],
      ["SUN", "16:00", "Physics", "Morning"],
    ]);
    const karim = await getInstructorHome(db, a.tenant.id, a.karim.userId);
    expect(karim.batches.map((b) => [b.name, b.mySubjects])).toEqual([
      ["Evening", ["Physics"]],
      ["Morning", ["Chemistry"]],
    ]);
  });

  it("shows a taught batch's roster with only roll, ID, name, photo and school; any other batch is not found", async () => {
    const a = await institute("inst-a");
    const b = await institute("inst-b");
    await a.admit("Anika", [a.morning.id], { schoolName: "Holy Cross", schoolClass: "HSC 1st year", phone: "01811000222", address: "Dhaka", adminNote: "Private" });
    const left = await a.admit("Bashir", [a.morning.id]);
    await students.setStudentStatus(db, a.actor, left.id, { status: "LEFT", reason: "Moved" });

    const batch = await getInstructorBatch(db, a.tenant.id, a.rahim.userId, a.morning.id);
    expect(batch.subjects.map((s) => [s.subjectName, s.instructors])).toEqual([
      ["Chemistry", ["Karim"]],
      ["Physics", ["Rahim"]],
    ]);
    expect(batch.students).toHaveLength(1);
    expect(Object.keys(batch.students[0]).sort()).toEqual(["fullName", "id", "photoFileId", "rollNumber", "schoolClass", "schoolName", "status", "studentCode"]);
    expect(batch.students[0]).toMatchObject({ fullName: "Anika", schoolName: "Holy Cross" });
    expect(JSON.stringify(batch)).not.toMatch(/01811000222|01711000111|Karim Uddin|Private|Dhaka/);

    await expect(getInstructorBatch(db, a.tenant.id, a.rahim.userId, a.evening.id)).rejects.toMatchObject({ code: "NOT_FOUND_BATCH" }); // not theirs
    await expect(getInstructorBatch(db, a.tenant.id, a.rahim.userId, a.old.id)).rejects.toMatchObject({ code: "NOT_FOUND_BATCH" }); // archived
    await expect(getInstructorBatch(db, a.tenant.id, a.rahim.userId, b.morning.id)).rejects.toMatchObject({ code: "NOT_FOUND_BATCH" }); // other institute
    await expect(getInstructorHome(db, b.tenant.id, a.rahim.userId)).rejects.toMatchObject({ code: "NOT_FOUND_INSTRUCTOR" });
  });
});

describe("student portal (D27)", () => {
  it("shows the student's own record without the staff note, their batches with instructors and times, and their week", async () => {
    const a = await institute("inst-a");
    const me = await a.admit("Anika", [a.morning.id, a.evening.id], { adminNote: "Pays late", phone: "01811000222" });
    await a.admit("Someone Else", [a.morning.id]);
    const evening = me.memberships.find((m) => m.batchName === "Evening")!;
    await students.endMembership(db, a.actor, evening.id, { status: "COMPLETED" });

    const home = await getStudentHome(db, a.tenant.id, me.userId);
    expect(home.profile).toMatchObject({ fullName: "Anika", studentCode: me.studentCode, phone: "01811000222", guardianPhone: "01711000111" });
    expect(home.profile).not.toHaveProperty("adminNote");
    expect(home.batches).toEqual([
      expect.objectContaining({
        batchName: "Morning",
        subjects: [
          { subjectName: "Chemistry", instructors: ["Karim"], slots: [{ weekday: "SAT", startsAt: "10:00", endsAt: "11:00" }] },
          { subjectName: "Physics", instructors: ["Rahim"], slots: [{ weekday: "SAT", startsAt: "09:00", endsAt: "10:00" }, { weekday: "SUN", startsAt: "16:00", endsAt: "17:00" }] },
        ],
      }),
    ]);
    expect(home.pastBatches).toEqual([expect.objectContaining({ batchName: "Evening", status: "COMPLETED" })]);
    expect(home.week.map((w) => `${w.weekday} ${w.startsAt} ${w.subjectName}`)).toEqual(["SAT 09:00 Physics", "SAT 10:00 Chemistry", "SUN 16:00 Physics"]);
    expect(JSON.stringify(home)).not.toContain("Someone Else");
  });

  it("finds nothing for a login that isn't this institute's student", async () => {
    const a = await institute("inst-a");
    const b = await institute("inst-b");
    const me = await a.admit("Anika", []);
    await expect(getStudentHome(db, b.tenant.id, me.userId)).rejects.toMatchObject({ code: "NOT_FOUND_STUDENT" });
    await expect(getStudentHome(db, a.tenant.id, a.rahim.userId)).rejects.toMatchObject({ code: "NOT_FOUND_STUDENT" });
  });
});

describe("dashboard counts", () => {
  it("counts students by status, and active batches, courses and instructors", async () => {
    const a = await institute("inst-a");
    await a.admit("A", []);
    const held = await a.admit("B", []);
    await students.setStudentStatus(db, a.actor, held.id, { status: "ON_HOLD" });
    await institute("inst-b").then((b) => b.admit("Elsewhere", []));
    expect(await getDashboardCounts(db, a.tenant.id)).toEqual({ students: { total: 2, active: 1, onHold: 1 }, activeBatches: 2, activeInstructors: 2, activeCourses: 1 });
  });
});

describe("public page (D58, D59)", () => {
  it("lists active courses, subjects and batches with class times, but no instructor names", async () => {
    const a = await institute("inst-a");
    const archived = await academic.createCourse(db, a.actor, { name: "Old course", code: "OLD" });
    await academic.setCourseStatus(db, a.actor, archived.id, "ARCHIVED");
    const catalog = await getPublicCatalog(db, a.tenant.id);
    expect(catalog.profile).toMatchObject({ name: "inst-a", hasLogo: false });
    expect(catalog.courses).toEqual([
      {
        name: "HSC 2026",
        description: "Science group",
        subjects: ["Chemistry", "Physics"],
        batches: [
          { name: "Evening", classes: [] },
          {
            name: "Morning",
            classes: [
              { weekday: "SAT", startsAt: "09:00", endsAt: "10:00", subjectName: "Physics" },
              { weekday: "SAT", startsAt: "10:00", endsAt: "11:00", subjectName: "Chemistry" },
              { weekday: "SUN", startsAt: "16:00", endsAt: "17:00", subjectName: "Physics" },
            ],
          },
        ],
      },
    ]);
    expect(JSON.stringify(catalog)).not.toMatch(/Rahim|Karim|Old/);
  });

  it("is shown for Active and Suspended institutes only, and so is the logo", async () => {
    expect(["PENDING", "ACTIVE", "SUSPENDED", "DEACTIVATED"].filter((s) => publicPageVisible(s as never))).toEqual(["ACTIVE", "SUSPENDED"]);

    const a = await institute("inst-a");
    const storage = new LocalDiskStorage(await mkdtemp(path.join(os.tmpdir(), "cms-files-")));
    const host = { baseDomain: "localhost:3000", platformHost: "admin.localhost:3000" };
    const files = createFilesHandlers({ db, auth: createTenantAuth(db, { secret: "test-secret-".padEnd(40, "x"), host, protocol: "http" }), host, storage });
    const logo = () => files.publicLogo(new Request("http://inst-a.localhost:3000/api/public/logo", { headers: { host: "inst-a.localhost:3000" } }));

    expect((await logo()).status).toBe(404); // no logo yet
    const bytes = await sharp({ create: { width: 40, height: 40, channels: 4, background: "#0a0" } }).png().toBuffer();
    const file = await uploadFile(db, storage, a.actor, { category: "LOGO", filename: "logo.png", bytes });
    await testDb.insert(institutionProfiles).values({ tenantId: a.tenant.id, displayName: "Inst A", logoFileId: file.id });
    const served = await logo();
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("cache-control")).toBe("public, max-age=300");

    await testDb.update(tenants).set({ status: "SUSPENDED" }).where(eq(tenants.id, a.tenant.id));
    expect((await logo()).status).toBe(200);
    await testDb.update(tenants).set({ status: "DEACTIVATED" }).where(eq(tenants.id, a.tenant.id));
    expect((await logo()).status).toBe(404);
  });
});
