import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../core/testing/db";
import { auditLogs, instructors, tenants, userRoles } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import { INSTITUTE_OWNER_ROLE, ROLE_TEMPLATES } from "../../core/rbac/catalog";
import { addDays, todayInDhaka, weekdayOf } from "@/lib/dates";
import * as academic from "../academic/service";
import { createLogin } from "../auth/credentials";
import { seedBaselineRoles } from "../rbac/service";
import { batchWeek, createChange, createHoliday, dayView, instructorWeek, listChanges, routineOptions, withdrawChange, withdrawHoliday, type Viewer } from "./service";

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
const tomorrow = addDays(today, 1);
const yesterday = addDays(today, -1);
const ADMIN = new Set(["academic.view", "routine.view", "routine.manage", "lessons.manage"]);
const INSTRUCTOR = new Set(ROLE_TEMPLATES.find((t) => t.name === "Instructor")!.permissions);

/** Morning: Physics (Rahim) daily 09:00–10:00 and Chemistry (Karim) daily 10:30–11:30. Evening: Math (Rahim) daily 16:00–17:00. */
async function setUp() {
  const [tenant] = await testDb.insert(tenants).values({ name: "Routine", subdomain: "routine", status: "ACTIVE" }).returning();
  const roleIds = await seedBaselineRoles(db, tenant.id);
  const owner = await createLogin(db, { tenantId: tenant.id, name: "Owner", email: "o@routine.test", password: "OwnerPass1" });
  await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: owner.id, roleId: roleIds[INSTITUTE_OWNER_ROLE] });
  const actor = { tenantId: tenant.id, userId: owner.id };
  const admin: Viewer = { ...actor, permissions: ADMIN };
  const teacher = async (name: string) => {
    const login = await createLogin(db, { tenantId: tenant.id, name, email: `${name.toLowerCase()}@routine.test`, password: "TeachPass1" });
    const [row] = await testDb.insert(instructors).values({ tenantId: tenant.id, userId: login.id, fullName: name }).returning();
    return { ...row, viewer: { tenantId: tenant.id, userId: login.id, permissions: INSTRUCTOR } as Viewer };
  };
  const rahim = await teacher("Rahim");
  const karim = await teacher("Karim");
  const salma = await teacher("Salma");
  const hsc = await academic.createCourse(db, actor, { name: "HSC", code: "HSC", dueDay: 10 });
  const [physics, chemistry, math] = await Promise.all(["Physics", "Chemistry", "Math"].map((name) => academic.createSubject(db, actor, hsc.id, { name })));
  const morning = await academic.createBatch(db, actor, hsc.id, { name: "Morning" });
  const evening = await academic.createBatch(db, actor, hsc.id, { name: "Evening" });
  const phy = await academic.addBatchSubject(db, actor, morning.id, physics.id);
  const chem = await academic.addBatchSubject(db, actor, morning.id, chemistry.id);
  const mth = await academic.addBatchSubject(db, actor, evening.id, math.id);
  await academic.setBatchSubjectInstructors(db, actor, phy.id, [rahim.id]);
  await academic.setBatchSubjectInstructors(db, actor, chem.id, [karim.id]);
  await academic.setBatchSubjectInstructors(db, actor, mth.id, [rahim.id]);
  for (const weekday of academic.WEEKDAYS) {
    await academic.addScheduleSlot(db, actor, phy.id, { weekday, startsAt: "09:00", endsAt: "10:00" });
    await academic.addScheduleSlot(db, actor, chem.id, { weekday, startsAt: "10:30", endsAt: "11:30" });
    await academic.addScheduleSlot(db, actor, mth.id, { weekday, startsAt: "16:00", endsAt: "17:00" });
  }
  return { tenant, admin, rahim, karim, salma, morning, evening, phy, chem, mth };
}

const at = (cs: { date: string; startsAt: string; subjectName: string; status: string }[], date: string) => cs.filter((c) => c.date === date).map((c) => [c.startsAt, c.subjectName, c.status]);

describe("the timetable views (D114, D24)", () => {
  it("shows a batch's week, an instructor's week and the institute's day", async () => {
    const s = await setUp();
    const week = await batchWeek(db, s.admin, s.morning.id, { from: today });
    expect(week.classes).toHaveLength(14);
    expect(at(week.classes, today)).toEqual([
      ["09:00", "Physics", "SCHEDULED"],
      ["10:30", "Chemistry", "SCHEDULED"],
    ]);
    const rahimWeek = await instructorWeek(db, s.admin, s.rahim.id, { from: today, days: 1 });
    expect(rahimWeek.classes.map((c) => c.subjectName)).toEqual(["Physics", "Math"]);
    expect((await dayView(db, s.admin, today)).classes).toHaveLength(3);
  });

  it("limits an instructor to their batches and their own week", async () => {
    const s = await setUp();
    expect((await routineOptions(db, s.karim.viewer)).batches.map((b) => b.name)).toEqual(["Morning"]);
    await expect(batchWeek(db, s.karim.viewer, s.evening.id, { from: today })).rejects.toMatchObject({ status: 404 });
    await expect(instructorWeek(db, s.karim.viewer, s.rahim.id, { from: today })).rejects.toMatchObject({ status: 404 });
    expect((await dayView(db, s.karim.viewer, today)).classes.map((c) => c.subjectName)).toEqual(["Physics", "Chemistry"]);
  });
});

describe("changes (D114, D115, D122)", () => {
  it("cancels a class with a reason, and withdrawing it brings the class back", async () => {
    const s = await setUp();
    await expect(createChange(db, s.admin, { batchSubjectId: s.phy.id, classDate: tomorrow, startsAt: "09:00", kind: "CANCEL" })).rejects.toMatchObject({ code: "VALIDATION_REASON_REQUIRED" });
    const change = await createChange(db, s.admin, { batchSubjectId: s.phy.id, classDate: tomorrow, startsAt: "09:00", kind: "CANCEL", reason: "Instructor ill" });
    expect(at((await batchWeek(db, s.admin, s.morning.id, { from: tomorrow, days: 1 })).classes, tomorrow)[0]).toEqual(["09:00", "Physics", "CANCELLED"]);
    await expect(createChange(db, s.admin, { batchSubjectId: s.phy.id, classDate: tomorrow, startsAt: "09:00", kind: "SUBSTITUTE", substituteInstructorId: s.salma.id })).rejects.toMatchObject({ code: "CONFLICT_CLASS_CHANGED" });
    await withdrawChange(db, s.admin, change.id);
    expect(at((await batchWeek(db, s.admin, s.morning.id, { from: tomorrow, days: 1 })).classes, tomorrow)[0]).toEqual(["09:00", "Physics", "SCHEDULED"]);
    expect((await testDb.select().from(auditLogs).where(eq(auditLogs.resourceType, "ROUTINE_CHANGE"))).map((l) => l.action).sort()).toEqual(["ROUTINE_CHANGE_ADDED", "ROUTINE_CHANGE_WITHDRAWN"]);
  });

  it("reschedules only to a free time, never onto a holiday", async () => {
    const s = await setUp();
    const base = { batchSubjectId: s.phy.id, classDate: tomorrow, startsAt: "09:00", kind: "RESCHEDULE" as const, newDate: tomorrow };
    // Rahim teaches Math in Evening at 16:00.
    await expect(createChange(db, s.admin, { ...base, newStartsAt: "16:30", newEndsAt: "17:30" })).rejects.toMatchObject({ code: "CONFLICT_INSTRUCTOR_CLASH", message: expect.stringContaining("Math (Evening)") });
    await createChange(db, s.admin, { ...base, newStartsAt: "17:00", newEndsAt: "18:00" });
    const day = (await batchWeek(db, s.admin, s.morning.id, { from: tomorrow, days: 1 })).classes;
    expect(at(day, tomorrow)).toEqual([
      ["09:00", "Physics", "MOVED_AWAY"],
      ["10:30", "Chemistry", "SCHEDULED"],
      ["17:00", "Physics", "MOVED_IN"],
    ]);
    // Moving Math to 17:00 now clashes with the rescheduled Physics.
    await expect(createChange(db, s.admin, { batchSubjectId: s.mth.id, classDate: tomorrow, startsAt: "16:00", kind: "RESCHEDULE", newDate: tomorrow, newStartsAt: "17:30", newEndsAt: "18:30" })).rejects.toMatchObject({ code: "CONFLICT_INSTRUCTOR_CLASH" });

    const later = addDays(today, 5);
    await createHoliday(db, s.admin, { name: "Victory Day", fromDate: later });
    await expect(createChange(db, s.admin, { batchSubjectId: s.chem.id, classDate: tomorrow, startsAt: "10:30", kind: "RESCHEDULE", newDate: later, newStartsAt: "12:00", newEndsAt: "13:00" })).rejects.toMatchObject({ code: "CONFLICT_HOLIDAY" });
  });

  it("gives a class an active, free substitute who doesn't already teach it", async () => {
    const s = await setUp();
    const base = { batchSubjectId: s.phy.id, classDate: tomorrow, startsAt: "09:00", kind: "SUBSTITUTE" as const };
    await expect(createChange(db, s.admin, { ...base, substituteInstructorId: s.rahim.id })).rejects.toMatchObject({ code: "VALIDATION_SUBSTITUTE" });
    await createChange(db, s.admin, { ...base, substituteInstructorId: s.salma.id });
    const [cls] = (await batchWeek(db, s.admin, s.morning.id, { from: tomorrow, days: 1 })).classes;
    expect(cls).toMatchObject({ status: "SCHEDULED", substituteName: "Salma", instructors: [{ name: "Salma" }], regularInstructors: [{ name: "Rahim" }] });
    expect((await instructorWeek(db, s.admin, s.salma.id, { from: tomorrow, days: 1 })).classes.map((c) => c.subjectName)).toEqual(["Physics"]);
    // With Salma covering Physics, Rahim is free at 09:00 tomorrow, so his Math class can move there.
    await createChange(db, s.admin, { batchSubjectId: s.mth.id, classDate: tomorrow, startsAt: "16:00", kind: "RESCHEDULE", newDate: tomorrow, newStartsAt: "09:30", newEndsAt: "10:30" });
    // Rahim's Math is now at 09:30 tomorrow (a moved-in class counts), so moving another of his classes to 09:00 clashes.
    await expect(
      createChange(db, s.admin, { batchSubjectId: s.mth.id, classDate: addDays(tomorrow, 1), startsAt: "16:00", kind: "RESCHEDULE", newDate: tomorrow, newStartsAt: "09:00", newEndsAt: "10:00" }),
    ).rejects.toMatchObject({ code: "CONFLICT_INSTRUCTOR_CLASH" });
  });

  it("needs a reason for any change to a past class, and refuses a time with no class", async () => {
    const s = await setUp();
    await expect(createChange(db, s.admin, { batchSubjectId: s.phy.id, classDate: yesterday, startsAt: "09:00", kind: "SUBSTITUTE", substituteInstructorId: s.salma.id })).rejects.toMatchObject({ code: "VALIDATION_REASON_REQUIRED" });
    await createChange(db, s.admin, { batchSubjectId: s.phy.id, classDate: yesterday, startsAt: "09:00", kind: "SUBSTITUTE", substituteInstructorId: s.salma.id, reason: "Recorded late" });
    await expect(createChange(db, s.admin, { batchSubjectId: s.phy.id, classDate: tomorrow, startsAt: "12:00", kind: "CANCEL", reason: "x" })).rejects.toMatchObject({ status: 404 });
    expect(weekdayOf(yesterday)).toBeTruthy();
  });
});

describe("holidays (D114)", () => {
  it("closes every class on those days, can't overlap another, and can be withdrawn", async () => {
    const s = await setUp();
    const holiday = await createHoliday(db, s.admin, { name: "Eid", fromDate: tomorrow, toDate: addDays(tomorrow, 1) });
    await expect(createHoliday(db, s.admin, { name: "Other", fromDate: addDays(tomorrow, 1) })).rejects.toMatchObject({ code: "CONFLICT_HOLIDAY_OVERLAP" });
    const day = (await dayView(db, s.admin, tomorrow)).classes;
    expect(day.every((c) => c.status === "HOLIDAY" && c.reason === "Eid")).toBe(true);
    const listed = await listChanges(db, s.admin);
    expect(listed.holidays.map((h) => h.name)).toEqual(["Eid"]);
    await withdrawHoliday(db, s.admin, holiday.id);
    expect((await dayView(db, s.admin, tomorrow)).classes.every((c) => c.status === "SCHEDULED")).toBe(true);
  });

  it("lists upcoming changes with names for the office and an instructor's batches only for them", async () => {
    const s = await setUp();
    await createChange(db, s.admin, { batchSubjectId: s.mth.id, classDate: tomorrow, startsAt: "16:00", kind: "CANCEL", reason: "Exam hall booked" });
    expect((await listChanges(db, s.admin)).changes).toMatchObject([{ kind: "CANCEL", batchName: "Evening", subjectName: "Math", reason: "Exam hall booked" }]);
    expect((await listChanges(db, s.karim.viewer)).changes).toEqual([]);
  });
});
