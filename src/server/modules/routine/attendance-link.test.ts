import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../core/testing/db";
import { setModules } from "../../core/testing/modules";
import { instructors, tenants, userRoles } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import { INSTITUTE_OWNER_ROLE, ROLE_TEMPLATES } from "../../core/rbac/catalog";
import { todayInDhaka } from "@/lib/dates";
import * as academic from "../academic/service";
import { classesOn, getRegister, saveRegister } from "../attendance/registers";
import { createLogin } from "../auth/credentials";
import { seedBaselineRoles } from "../rbac/service";
import * as students from "../students/service";
import { createChange, createHoliday, type Viewer } from "./service";

// Attendance follows the routine when both modules are on (D116), and a substitute takes that register (D121).

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;

beforeEach(async () => {
  await reset();
  await seedPlatformCatalog(testDb);
});
afterAll(async () => {
  await close();
});

const today = todayInDhaka();
const ADMIN = new Set(["academic.view", "routine.view", "routine.manage", "attendance.view", "attendance.take", "attendance.manage"]);
const INSTRUCTOR = new Set(ROLE_TEMPLATES.find((t) => t.name === "Instructor")!.permissions);

/** Morning: Physics (Rahim) 09:00 and Chemistry (Rahim) 11:00 every day; Salma teaches nothing. */
async function setUp(modules: ("attendance" | "routine")[] = ["attendance", "routine"]) {
  const [tenant] = await testDb.insert(tenants).values({ name: "Link", subdomain: "link", status: "ACTIVE" }).returning();
  await setModules(db, tenant.id, modules);
  const roleIds = await seedBaselineRoles(db, tenant.id);
  const owner = await createLogin(db, { tenantId: tenant.id, name: "Owner", email: "o@link.test", password: "OwnerPass1" });
  await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: owner.id, roleId: roleIds[INSTITUTE_OWNER_ROLE] });
  const actor = { tenantId: tenant.id, userId: owner.id };
  const teacher = async (name: string) => {
    const login = await createLogin(db, { tenantId: tenant.id, name, email: `${name.toLowerCase()}@link.test`, password: "TeachPass1" });
    const [row] = await testDb.insert(instructors).values({ tenantId: tenant.id, userId: login.id, fullName: name }).returning();
    return { ...row, viewer: { tenantId: tenant.id, userId: login.id, permissions: INSTRUCTOR } as Viewer };
  };
  const rahim = await teacher("Rahim");
  const salma = await teacher("Salma");
  const hsc = await academic.createCourse(db, actor, { name: "HSC", code: "HSC", dueDay: 10 });
  const physics = await academic.createSubject(db, actor, hsc.id, { name: "Physics" });
  const chemistry = await academic.createSubject(db, actor, hsc.id, { name: "Chemistry" });
  const morning = await academic.createBatch(db, actor, hsc.id, { name: "Morning" });
  const phy = await academic.addBatchSubject(db, actor, morning.id, physics.id);
  const chem = await academic.addBatchSubject(db, actor, morning.id, chemistry.id);
  await academic.setBatchSubjectInstructors(db, actor, phy.id, [rahim.id]);
  await academic.setBatchSubjectInstructors(db, actor, chem.id, [rahim.id]);
  for (const weekday of academic.WEEKDAYS) {
    await academic.addScheduleSlot(db, actor, phy.id, { weekday, startsAt: "09:00", endsAt: "10:00" });
    await academic.addScheduleSlot(db, actor, chem.id, { weekday, startsAt: "11:00", endsAt: "12:00" });
  }
  const { student } = await students.admitStudent(db, actor, {
    fullName: "Anika", gender: "FEMALE", guardianName: "G", guardianRelation: "MOTHER", guardianPhone: "01711000111", admissionDate: "2026-01-01", batchIds: [morning.id], temporaryPassword: "Student123",
  });
  return { admin: { ...actor, permissions: ADMIN } as Viewer, rahim, salma, phy, chem, student };
}

const at = (bs: string, startsAt: string) => ({ batchSubjectId: bs, date: today, startsAt });

describe("Attendance follows the routine (D116)", () => {
  it("shows a cancelled class as not held with the reason, and refuses its register", async () => {
    const s = await setUp();
    await createChange(db, s.admin, { batchSubjectId: s.phy.id, classDate: today, startsAt: "09:00", kind: "CANCEL", reason: "Instructor ill" });
    const day = await classesOn(db, s.rahim.viewer, today);
    expect(day.find((c) => c.subjectName === "Physics")).toMatchObject({ state: "NOT_HELD", notHeldReason: "Cancelled in the routine: Instructor ill", classId: null });
    expect(await getRegister(db, s.admin, at(s.phy.id, "09:00"))).toMatchObject({ state: "NOT_HELD", canEdit: false });
    await expect(saveRegister(db, s.admin, { ...at(s.phy.id, "09:00"), marks: [] })).rejects.toMatchObject({ code: "CONFLICT_ROUTINE_CHANGED" });
  });

  it("moves a rescheduled class's register to its new time", async () => {
    const s = await setUp();
    await createChange(db, s.admin, { batchSubjectId: s.phy.id, classDate: today, startsAt: "09:00", kind: "RESCHEDULE", newDate: today, newStartsAt: "15:00", newEndsAt: "16:00" });
    const day = await classesOn(db, s.rahim.viewer, today);
    expect(day.map((c) => [c.subjectName, c.startsAt, c.state, c.routineNote])).toEqual([
      ["Chemistry", "11:00", "NOT_TAKEN", null],
      ["Physics", "15:00", "NOT_TAKEN", `Moved from ${today}, 09:00`],
    ]);
    const saved = await saveRegister(db, s.rahim.viewer, { ...at(s.phy.id, "15:00"), marks: [{ studentId: s.student.id, status: "LATE" }] });
    expect(saved).toMatchObject({ state: "TAKEN", startsAt: "15:00", endsAt: "16:00" });
    await expect(saveRegister(db, s.admin, { ...at(s.phy.id, "09:00"), marks: [] })).rejects.toMatchObject({ code: "CONFLICT_ROUTINE_CHANGED" });
  });

  it("shows holiday classes as not held, but keeps a register taken before the routine changed", async () => {
    const s = await setUp();
    await saveRegister(db, s.admin, { ...at(s.chem.id, "11:00"), marks: [] });
    await createHoliday(db, s.admin, { name: "Victory Day", fromDate: today });
    const day = await classesOn(db, s.admin, today);
    expect(day.find((c) => c.subjectName === "Physics")).toMatchObject({ state: "NOT_HELD", notHeldReason: "Holiday: Victory Day" });
    expect(day.find((c) => c.subjectName === "Chemistry")).toMatchObject({ state: "TAKEN" });
  });

  it("changes nothing while the Routine module is off", async () => {
    const s = await setUp(["attendance"]);
    await setModules(db, s.admin.tenantId, ["routine"]);
    await createChange(db, s.admin, { batchSubjectId: s.phy.id, classDate: today, startsAt: "09:00", kind: "CANCEL", reason: "Rain" });
    await setModules(db, s.admin.tenantId, ["routine"], false);
    expect((await classesOn(db, s.admin, today)).find((c) => c.subjectName === "Physics")).toMatchObject({ state: "NOT_TAKEN", notHeldReason: null });
    await expect(saveRegister(db, s.admin, { ...at(s.phy.id, "09:00"), marks: [] })).resolves.toMatchObject({ state: "TAKEN" });
  });
});

describe("a substitute takes that register (D121)", () => {
  it("shows the substitute only the class they cover and lets both them and the regular instructor take it", async () => {
    const s = await setUp();
    await createChange(db, s.admin, { batchSubjectId: s.phy.id, classDate: today, startsAt: "09:00", kind: "SUBSTITUTE", substituteInstructorId: s.salma.id });
    const salmaDay = await classesOn(db, s.salma.viewer, today);
    expect(salmaDay.map((c) => [c.subjectName, c.startsAt, c.routineNote])).toEqual([["Physics", "09:00", "Substitute: Salma"]]);
    await saveRegister(db, s.salma.viewer, { ...at(s.phy.id, "09:00"), marks: [{ studentId: s.student.id, status: "ABSENT" }] });
    await expect(getRegister(db, s.salma.viewer, at(s.chem.id, "11:00"))).rejects.toMatchObject({ status: 404 });
    // The regular instructor can still change it the same day.
    await expect(saveRegister(db, s.rahim.viewer, { ...at(s.phy.id, "09:00"), marks: [{ studentId: s.student.id, status: "PRESENT" }] })).resolves.toMatchObject({ state: "TAKEN" });
  });
});
