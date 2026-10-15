import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "../../core/testing/db";
import { attendanceClasses, attendanceMarks, auditLogs, instructors, leaveApplications, tenants, userRoles } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import { INSTITUTE_OWNER_ROLE, ROLE_TEMPLATES } from "../../core/rbac/catalog";
import { todayInDhaka } from "@/lib/dates";
import * as academic from "../academic/service";
import { createLogin } from "../auth/credentials";
import { seedBaselineRoles } from "../rbac/service";
import * as students from "../students/service";
import { addExtraClass, classesOn, getRegister, markNotHeld, saveRegister, weekdayOf, type Viewer } from "./registers";

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
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const yesterday = addDays(today, -1);
const tomorrow = addDays(today, 1);
const ADMIN = new Set(["academic.view", "attendance.view", "attendance.take", "attendance.manage"]);
const INSTRUCTOR = new Set(ROLE_TEMPLATES.find((t) => t.name === "Instructor")!.permissions);

async function setUp() {
  const [tenant] = await testDb.insert(tenants).values({ name: "Registers", subdomain: "registers", status: "ACTIVE" }).returning();
  const roleIds = await seedBaselineRoles(db, tenant.id);
  const owner = await createLogin(db, { tenantId: tenant.id, name: "Owner", email: "o@registers.test", password: "OwnerPass1" });
  await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: owner.id, roleId: roleIds[INSTITUTE_OWNER_ROLE] });
  const actor = { tenantId: tenant.id, userId: owner.id };
  const admin: Viewer = { ...actor, permissions: ADMIN };

  const hsc = await academic.createCourse(db, actor, { name: "HSC", code: "HSC", dueDay: 10 });
  const physics = await academic.createSubject(db, actor, hsc.id, { name: "Physics" });
  const chemistry = await academic.createSubject(db, actor, hsc.id, { name: "Chemistry" });
  const morning = await academic.createBatch(db, actor, hsc.id, { name: "Morning" });
  const phy = await academic.addBatchSubject(db, actor, morning.id, physics.id);
  const chem = await academic.addBatchSubject(db, actor, morning.id, chemistry.id);
  // Classes every day of the week, so "today" and "yesterday" always have one.
  for (const d of [today, yesterday]) {
    await academic.addScheduleSlot(db, actor, phy.id, { weekday: weekdayOf(d), startsAt: "09:00", endsAt: "10:00" });
    await academic.addScheduleSlot(db, actor, chem.id, { weekday: weekdayOf(d), startsAt: "10:30", endsAt: "11:30" });
  }

  const teacherLogin = await createLogin(db, { tenantId: tenant.id, name: "Rahim", email: "rahim@registers.test", password: "TeachPass1" });
  const [teacher] = await testDb.insert(instructors).values({ tenantId: tenant.id, userId: teacherLogin.id, fullName: "Rahim" }).returning();
  await academic.setBatchSubjectInstructors(db, actor, phy.id, [teacher.id]);
  const instructor: Viewer = { tenantId: tenant.id, userId: teacherLogin.id, permissions: INSTRUCTOR };

  const admit = async (fullName: string, admissionDate = addDays(today, -30)) =>
    (
      await students.admitStudent(db, actor, {
        fullName, gender: "FEMALE", guardianName: "G", guardianRelation: "MOTHER", guardianPhone: "01711000111", admissionDate, batchIds: [morning.id], temporaryPassword: "Student123",
      })
    ).student;
  return { tenant, actor, admin, instructor, morning, phy, chem, admit, owner };
}

const at = (bs: string, date = today, startsAt = "09:00") => ({ batchSubjectId: bs, date, startsAt });
const statusOf = (reg: Awaited<ReturnType<typeof getRegister>>, id: string) => reg.rows.find((r) => r.studentId === id)?.effective;

describe("a day's classes", () => {
  it("lists the weekly schedule's classes for everyone at the office, and only their own to an instructor", async () => {
    const s = await setUp();
    const all = await classesOn(db, s.admin, today);
    expect(all.map((c) => [c.subjectName, c.startsAt, c.state])).toEqual([
      ["Physics", "09:00", "NOT_TAKEN"],
      ["Chemistry", "10:30", "NOT_TAKEN"],
    ]);
    const own = await classesOn(db, s.instructor, today);
    expect(own.map((c) => c.subjectName)).toEqual(["Physics"]);
  });

  it("hides another batch subject's register from an instructor like another institute's (404)", async () => {
    const s = await setUp();
    await expect(getRegister(db, s.instructor, at(s.chem.id, today, "10:30"))).rejects.toMatchObject({ status: 404 });
    await expect(saveRegister(db, s.instructor, { ...at(s.chem.id, today, "10:30"), marks: [] })).rejects.toMatchObject({ status: 404 });
  });

  it("refuses a time with no class", async () => {
    const s = await setUp();
    await expect(getRegister(db, s.admin, at(s.phy.id, today, "15:00"))).rejects.toMatchObject({ status: 404 });
  });
});

describe("taking a register", () => {
  it("starts everyone Present, leaves On Hold students off, and shows approved leave as Excused", async () => {
    const s = await setUp();
    const anika = await s.admit("Anika");
    const bushra = await s.admit("Bushra");
    const chaity = await s.admit("Chaity");
    await students.setStudentStatus(db, s.actor, chaity.id, { status: "ON_HOLD" });
    const late = await s.admit("Dina", tomorrow); // joins after today
    await testDb.insert(leaveApplications).values({
      tenantId: s.tenant.id, studentId: bushra.id, fromDate: yesterday, toDate: today, reason: "Fever", source: "OFFICE", status: "APPROVED", appliedBy: s.owner.id,
    });

    const reg = await getRegister(db, s.instructor, at(s.phy.id));
    expect(reg).toMatchObject({ state: "NOT_TAKEN", canEdit: true, reasonRequired: false });
    expect(reg.rows.map((r) => r.fullName)).toEqual(["Anika", "Bushra"]);
    expect(statusOf(reg, anika.id)).toBe("PRESENT");
    expect(reg.rows.find((r) => r.studentId === bushra.id)).toMatchObject({ onLeave: true, effective: "EXCUSED" });
    expect(statusOf(reg, late.id)).toBeUndefined();
  });

  it("saves the exceptions, records every student, and audits the first save as taken", async () => {
    const s = await setUp();
    const anika = await s.admit("Anika");
    const bushra = await s.admit("Bushra");
    const saved = await saveRegister(db, s.instructor, { ...at(s.phy.id), marks: [{ studentId: bushra.id, status: "ABSENT" }] });
    expect(saved.state).toBe("TAKEN");
    expect(statusOf(saved, anika.id)).toBe("PRESENT"); // not sent, still recorded as Present
    expect(statusOf(saved, bushra.id)).toBe("ABSENT");
    expect(await testDb.select().from(attendanceMarks)).toHaveLength(2);

    const day = await classesOn(db, s.admin, today);
    expect(day.find((c) => c.subjectName === "Physics")).toMatchObject({ state: "TAKEN", counts: { present: 1, absent: 1, late: 0, excused: 0 } });
    const logs = await testDb.select().from(auditLogs).where(eq(auditLogs.action, "ATTENDANCE_TAKEN"));
    expect(logs).toHaveLength(1);
  });

  it("audits same-day changes with the old and new status, and ignores a save that changes nothing", async () => {
    const s = await setUp();
    const anika = await s.admit("Anika");
    await saveRegister(db, s.instructor, { ...at(s.phy.id), marks: [{ studentId: anika.id, status: "PRESENT" }] });
    await saveRegister(db, s.instructor, { ...at(s.phy.id), marks: [{ studentId: anika.id, status: "PRESENT" }] });
    expect(await testDb.select().from(auditLogs).where(eq(auditLogs.action, "ATTENDANCE_CORRECTED"))).toHaveLength(0);
    await saveRegister(db, s.instructor, { ...at(s.phy.id), marks: [{ studentId: anika.id, status: "LATE" }] });
    const [log] = await testDb.select().from(auditLogs).where(eq(auditLogs.action, "ATTENDANCE_CORRECTED"));
    expect(log.oldValue).toMatchObject({ changes: [{ studentId: anika.id, status: "PRESENT" }] });
    expect(log.newValue).toMatchObject({ changes: [{ studentId: anika.id, status: "LATE" }], reason: null });
  });

  it("refuses a student who isn't on the batch", async () => {
    const s = await setUp();
    const anika = await s.admit("Anika");
    await students.setStudentStatus(db, s.actor, anika.id, { status: "ON_HOLD" });
    await expect(saveRegister(db, s.admin, { ...at(s.phy.id), marks: [{ studentId: anika.id, status: "ABSENT" }] })).rejects.toMatchObject({ code: "VALIDATION_NOT_ON_REGISTER" });
  });
});

describe("the class-day rule", () => {
  it("lets an instructor take or change a register only on its day", async () => {
    const s = await setUp();
    await s.admit("Anika");
    const past = await getRegister(db, s.instructor, at(s.phy.id, yesterday));
    expect(past).toMatchObject({ canEdit: false });
    expect(past.whyNot).toMatch(/Ask an Admin/);
    await expect(saveRegister(db, s.instructor, { ...at(s.phy.id, yesterday), marks: [] })).rejects.toMatchObject({ code: "CONFLICT_REGISTER_LOCKED" });
    await expect(markNotHeld(db, s.instructor, { ...at(s.phy.id, yesterday), reason: "Ill" })).rejects.toMatchObject({ code: "CONFLICT_REGISTER_LOCKED" });
  });

  it("lets Owner/Admin take or correct a past register, with a reason that is audited", async () => {
    const s = await setUp();
    const anika = await s.admit("Anika");
    expect(await getRegister(db, s.admin, at(s.phy.id, yesterday))).toMatchObject({ canEdit: true, reasonRequired: true });
    await expect(saveRegister(db, s.admin, { ...at(s.phy.id, yesterday), marks: [] })).rejects.toMatchObject({ code: "VALIDATION_REASON_REQUIRED" });
    await saveRegister(db, s.admin, { ...at(s.phy.id, yesterday), marks: [], reason: "Register was on paper" });
    await saveRegister(db, s.admin, { ...at(s.phy.id, yesterday), marks: [{ studentId: anika.id, status: "ABSENT" }], reason: "Guardian confirmed" });
    const [log] = await testDb.select().from(auditLogs).where(eq(auditLogs.action, "ATTENDANCE_CORRECTED"));
    expect(log.newValue).toMatchObject({ reason: "Guardian confirmed", date: yesterday });
  });

  it("never allows a future class", async () => {
    const s = await setUp();
    await academic.addScheduleSlot(db, s.actor, s.phy.id, { weekday: weekdayOf(tomorrow), startsAt: "07:00", endsAt: "08:00" });
    await expect(saveRegister(db, s.admin, { ...at(s.phy.id, tomorrow, "07:00"), marks: [], reason: "x" })).rejects.toMatchObject({ code: "CONFLICT_REGISTER_LOCKED" });
  });
});

describe("no class held and extra classes", () => {
  it("records a class that didn't happen, with a reason, and lets it be taken after all", async () => {
    const s = await setUp();
    await s.admit("Anika");
    await expect(markNotHeld(db, s.instructor, { ...at(s.phy.id), reason: " " })).rejects.toMatchObject({ code: "VALIDATION_REASON_REQUIRED" });
    const reg = await markNotHeld(db, s.instructor, { ...at(s.phy.id), reason: "Instructor ill" });
    expect(reg).toMatchObject({ state: "NOT_HELD", notHeldReason: "Instructor ill" });
    expect((await classesOn(db, s.admin, today))[0]).toMatchObject({ state: "NOT_HELD", counts: null });
    const taken = await saveRegister(db, s.instructor, { ...at(s.phy.id), marks: [] });
    expect(taken).toMatchObject({ state: "TAKEN", notHeldReason: null });
  });

  it("adds a one-off class that is then taken like any other, but not over an existing one", async () => {
    const s = await setUp();
    const anika = await s.admit("Anika");
    await addExtraClass(db, s.instructor, { batchSubjectId: s.phy.id, date: today, startsAt: "17:00", endsAt: "18:00" });
    await expect(addExtraClass(db, s.instructor, { batchSubjectId: s.phy.id, date: today, startsAt: "09:00", endsAt: "10:00" })).rejects.toMatchObject({ code: "CONFLICT_CLASS_EXISTS" });
    await expect(addExtraClass(db, s.instructor, { batchSubjectId: s.chem.id, date: today, startsAt: "17:00", endsAt: "18:00" })).rejects.toMatchObject({ status: 404 });
    await expect(addExtraClass(db, s.admin, { batchSubjectId: s.phy.id, date: today, startsAt: "18:00", endsAt: "17:00" })).rejects.toMatchObject({ code: "VALIDATION_TIME_ORDER" });

    const own = await classesOn(db, s.instructor, today);
    expect(own.map((c) => [c.startsAt, c.source, c.state])).toEqual([
      ["09:00", "SCHEDULED", "NOT_TAKEN"],
      ["17:00", "EXTRA", "OPEN"],
    ]);
    const saved = await saveRegister(db, s.instructor, { ...at(s.phy.id, today, "17:00"), marks: [{ studentId: anika.id, status: "LATE" }] });
    expect(saved).toMatchObject({ source: "EXTRA", state: "TAKEN", endsAt: "18:00" });
    const classes = await testDb.select().from(attendanceClasses).where(and(eq(attendanceClasses.tenantId, s.tenant.id), eq(attendanceClasses.source, "EXTRA")));
    expect(classes).toHaveLength(1);
  });
});
