import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../core/testing/db";
import { instructors, tenants, userRoles } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import { INSTITUTE_OWNER_ROLE, ROLE_TEMPLATES } from "../../core/rbac/catalog";
import { todayInDhaka } from "@/lib/dates";
import * as academic from "../academic/service";
import { createLogin } from "../auth/credentials";
import { seedBaselineRoles } from "../rbac/service";
import * as students from "../students/service";
import { enterLeave } from "./leave";
import { markNotHeld, saveRegister, weekdayOf, type Viewer } from "./registers";
import { attendanceRegisterDocument } from "./register-document";
import { cleanRange, dailyAbsentees, lowAttendance, monthRange, monthlyRegister, myAttendance, reportOptions, studentHistory } from "./reports";

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
const ADMIN = new Set(["academic.view", "attendance.view", "attendance.take", "attendance.manage", "attendance.report.view", "students.contact.view"]);
const INSTRUCTOR = new Set(ROLE_TEMPLATES.find((t) => t.name === "Instructor")!.permissions);

/**
 * One batch with Physics (taught by Rahim) and Chemistry. Yesterday: Physics taken (Anika Present, Bushra Absent,
 * Chaity Late) and Chemistry taken (Anika Absent, Bushra Absent, Chaity on leave). Today: Physics not held.
 */
async function setUp() {
  const [tenant] = await testDb.insert(tenants).values({ name: "Reports", subdomain: "reports", status: "ACTIVE" }).returning();
  const roleIds = await seedBaselineRoles(db, tenant.id);
  const owner = await createLogin(db, { tenantId: tenant.id, name: "Owner", email: "o@reports.test", password: "OwnerPass1" });
  await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: owner.id, roleId: roleIds[INSTITUTE_OWNER_ROLE] });
  const actor = { tenantId: tenant.id, userId: owner.id };
  const admin: Viewer = { ...actor, permissions: ADMIN };
  const hsc = await academic.createCourse(db, actor, { name: "HSC", code: "HSC", dueDay: 10 });
  const physics = await academic.createSubject(db, actor, hsc.id, { name: "Physics" });
  const chemistry = await academic.createSubject(db, actor, hsc.id, { name: "Chemistry" });
  const morning = await academic.createBatch(db, actor, hsc.id, { name: "Morning" });
  const evening = await academic.createBatch(db, actor, hsc.id, { name: "Evening" });
  const phy = await academic.addBatchSubject(db, actor, morning.id, physics.id);
  const chem = await academic.addBatchSubject(db, actor, morning.id, chemistry.id);
  await academic.addBatchSubject(db, actor, evening.id, physics.id);
  for (const d of [today, yesterday]) {
    await academic.addScheduleSlot(db, actor, phy.id, { weekday: weekdayOf(d), startsAt: "09:00", endsAt: "10:00" });
    await academic.addScheduleSlot(db, actor, chem.id, { weekday: weekdayOf(d), startsAt: "10:30", endsAt: "11:30" });
  }
  const teacherLogin = await createLogin(db, { tenantId: tenant.id, name: "Rahim", email: "rahim@reports.test", password: "TeachPass1" });
  const [teacher] = await testDb.insert(instructors).values({ tenantId: tenant.id, userId: teacherLogin.id, fullName: "Rahim" }).returning();
  await academic.setBatchSubjectInstructors(db, actor, phy.id, [teacher.id]);
  const instructor: Viewer = { tenantId: tenant.id, userId: teacherLogin.id, permissions: INSTRUCTOR };

  const admit = async (fullName: string, batchId = morning.id) =>
    (
      await students.admitStudent(db, actor, {
        fullName, gender: "FEMALE", guardianName: `${fullName}'s mother`, guardianRelation: "MOTHER", guardianPhone: "01711000111", admissionDate: addDays(today, -60), batchIds: [batchId], temporaryPassword: "Student123",
      })
    ).student;
  const anika = await admit("Anika");
  const bushra = await admit("Bushra");
  const chaity = await admit("Chaity");
  const dina = await admit("Dina", evening.id);

  const reason = "Paper register";
  await saveRegister(db, admin, { batchSubjectId: phy.id, date: yesterday, startsAt: "09:00", reason, marks: [{ studentId: bushra.id, status: "ABSENT" }, { studentId: chaity.id, status: "LATE" }] });
  await enterLeave(db, actor, chaity.id, { fromDate: yesterday, toDate: yesterday, reason: "Fever" }); // excuses her Physics too
  await saveRegister(db, admin, { batchSubjectId: chem.id, date: yesterday, startsAt: "10:30", reason, marks: [{ studentId: anika.id, status: "ABSENT" }, { studentId: bushra.id, status: "ABSENT" }] });
  await markNotHeld(db, admin, { batchSubjectId: phy.id, date: today, startsAt: "09:00", reason: "Holiday" });
  return { tenant, admin, instructor, morning, evening, phy, chem, anika, bushra, chaity, dina };
}

describe("monthly batch register (D88)", () => {
  it("shows taken classes as columns, each student's effective status, totals and percentage", async () => {
    const s = await setUp();
    const month = yesterday.slice(0, 7);
    const reg = await monthlyRegister(db, s.admin, { batchId: s.morning.id, month });
    expect(reg.classes.map((c) => [c.date, c.subjectName])).toEqual([
      [yesterday, "Physics"],
      [yesterday, "Chemistry"],
    ]);
    if (today.slice(0, 7) === month) expect(reg.notHeld).toBe(1);
    const row = (id: string) => reg.rows.find((r) => r.studentId === id)!;
    expect(row(s.anika.id)).toMatchObject({ statuses: ["PRESENT", "ABSENT"], percentage: 50 });
    expect(row(s.bushra.id)).toMatchObject({ statuses: ["ABSENT", "ABSENT"], percentage: 0 });
    expect(row(s.chaity.id)).toMatchObject({ statuses: ["EXCUSED", "EXCUSED"], excused: 2, percentage: null });
    expect(reg.rows.map((r) => r.fullName)).not.toContain("Dina");
  });

  it("shows an instructor only the subjects they teach, and refuses a batch they don't teach", async () => {
    const s = await setUp();
    const reg = await monthlyRegister(db, s.instructor, { batchId: s.morning.id, month: yesterday.slice(0, 7) });
    expect(reg.classes.map((c) => c.subjectName)).toEqual(["Physics"]);
    await expect(monthlyRegister(db, s.instructor, { batchId: s.evening.id, month: yesterday.slice(0, 7) })).rejects.toMatchObject({ status: 404 });
    expect((await reportOptions(db, s.instructor)).batches.map((b) => b.name)).toEqual(["Morning"]);
  });

  it("prints the same register, scoped to the person printing", async () => {
    const s = await setUp();
    const selection = attendanceRegisterDocument.parseSelection({ batch_id: s.morning.id, month: yesterday.slice(0, 7) }, { kind: "all" });
    const loaded = await attendanceRegisterDocument.load(db, { tenantId: s.tenant.id, scope: { kind: "all" }, selection, limit: 2, permissions: s.instructor.permissions, userId: s.instructor.userId });
    expect(loaded.records[0].data.classes.map((c) => c.subjectName)).toEqual(["Physics"]);
    expect(() => attendanceRegisterDocument.parseSelection({ batch_id: s.morning.id, month: "2026-13" }, { kind: "all" })).toThrow();
  });

  it("validates months and ranges", () => {
    expect(monthRange("2028-02")).toMatchObject({ from: "2028-02-01", to: "2028-02-29", label: "February 2028" });
    expect(() => cleanRange("2026-10-12", "2026-10-01")).toThrow();
    expect(() => cleanRange("2025-01-01", "2026-10-01")).toThrow();
  });
});

describe("low attendance and daily absentees (D88)", () => {
  it("lists students below the percentage, lowest first, with guardian mobiles only with contact access", async () => {
    const s = await setUp();
    const range = { from: yesterday, to: today };
    const low = await lowAttendance(db, s.admin, { range, below: 75 });
    expect(low.rows.map((r) => [r.fullName, r.percentage])).toEqual([
      ["Bushra", 0],
      ["Anika", 50],
    ]);
    expect(low.rows[0].guardianPhone).toBe("01711000111");
    const noContacts = await lowAttendance(db, { ...s.admin, permissions: new Set([...ADMIN].filter((p) => p !== "students.contact.view")) }, { range, below: 75 });
    expect(noContacts.rows.every((r) => r.guardianPhone === null)).toBe(true);
    // An instructor's list counts only their subject: Anika was Present in Physics.
    expect((await lowAttendance(db, s.instructor, { range, below: 75 })).rows.map((r) => r.fullName)).toEqual(["Bushra"]);
    await expect(lowAttendance(db, s.admin, { range, below: 0 })).rejects.toMatchObject({ code: "VALIDATION_PERCENT" });
  });

  it("lists who was absent on a day with the classes missed; leave isn't absence", async () => {
    const s = await setUp();
    const day = await dailyAbsentees(db, s.admin, { date: yesterday });
    expect(day.rows.map((r) => [r.fullName, r.missed.map((m) => m.subjectName)])).toEqual([
      ["Anika", ["Chemistry"]],
      ["Bushra", ["Physics", "Chemistry"]],
    ]);
    const mine = await dailyAbsentees(db, s.instructor, { date: yesterday });
    expect(mine.rows.map((r) => [r.fullName, r.guardianPhone])).toEqual([["Bushra", null]]); // instructors never see guardian mobiles (D24)
  });
});

describe("a student's history (D88) and My attendance (D27)", () => {
  it("gives staff the classes with totals per subject; an instructor only for students they teach", async () => {
    const s = await setUp();
    const h = await studentHistory(db, s.admin, s.anika.id, { from: yesterday, to: today });
    expect(h.overall).toMatchObject({ present: 1, absent: 1, percentage: 50 });
    expect(h.bySubject.map((b) => [b.subjectName, b.percentage])).toEqual([
      ["Physics", 100],
      ["Chemistry", 0],
    ]);
    expect(h.entries[0]).toMatchObject({ subjectName: "Chemistry", status: "ABSENT" }); // newest first
    expect((await studentHistory(db, s.instructor, s.anika.id, { from: yesterday, to: today })).bySubject.map((b) => b.subjectName)).toEqual(["Physics"]);
    await expect(studentHistory(db, s.instructor, s.dina.id, { from: yesterday, to: today })).rejects.toMatchObject({ status: 404 });
  });

  it("shows a student their own attendance and leave-excused classes", async () => {
    const s = await setUp();
    const mine = await myAttendance(db, s.tenant.id, s.chaity.userId);
    expect(mine.overall).toMatchObject({ excused: 2, percentage: null });
    expect(mine.entries.every((e) => e.onLeave)).toBe(true);
    await expect(myAttendance(db, s.tenant.id, s.admin.userId)).rejects.toMatchObject({ status: 404 });
  });
});
