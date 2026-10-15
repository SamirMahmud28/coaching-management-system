import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../core/testing/db";
import { instructors, tenants, userRoles } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import { INSTITUTE_OWNER_ROLE } from "../../core/rbac/catalog";
import { addDays, todayInDhaka } from "@/lib/dates";
import * as academic from "../academic/service";
import { createLogin } from "../auth/credentials";
import { seedBaselineRoles } from "../rbac/service";
import * as students from "../students/service";
import { addTopic, updateTopic } from "./lessons";
import { myLessonProgress, upcomingChangesForInstructor, upcomingChangesForStudent } from "./portal";
import { createChange, createHoliday, type Viewer } from "./service";

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
const ADMIN = new Set(["academic.view", "routine.view", "routine.manage", "lessons.manage"]);

async function setUp() {
  const [tenant] = await testDb.insert(tenants).values({ name: "Portal", subdomain: "portal-r", status: "ACTIVE" }).returning();
  const roleIds = await seedBaselineRoles(db, tenant.id);
  const owner = await createLogin(db, { tenantId: tenant.id, name: "Owner", email: "o@portal-r.test", password: "OwnerPass1" });
  await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: owner.id, roleId: roleIds[INSTITUTE_OWNER_ROLE] });
  const actor = { tenantId: tenant.id, userId: owner.id };
  const admin: Viewer = { ...actor, permissions: ADMIN };
  const teacher = async (name: string) => {
    const login = await createLogin(db, { tenantId: tenant.id, name, email: `${name.toLowerCase()}@portal-r.test`, password: "TeachPass1" });
    const [row] = await testDb.insert(instructors).values({ tenantId: tenant.id, userId: login.id, fullName: name }).returning();
    return { ...row, userId: login.id };
  };
  const rahim = await teacher("Rahim");
  const salma = await teacher("Salma");
  const hsc = await academic.createCourse(db, actor, { name: "HSC", code: "HSC", dueDay: 10 });
  const physics = await academic.createSubject(db, actor, hsc.id, { name: "Physics" });
  const morning = await academic.createBatch(db, actor, hsc.id, { name: "Morning" });
  const evening = await academic.createBatch(db, actor, hsc.id, { name: "Evening" });
  const mPhy = await academic.addBatchSubject(db, actor, morning.id, physics.id);
  const ePhy = await academic.addBatchSubject(db, actor, evening.id, physics.id);
  await academic.setBatchSubjectInstructors(db, actor, mPhy.id, [rahim.id]);
  for (const weekday of academic.WEEKDAYS) {
    await academic.addScheduleSlot(db, actor, mPhy.id, { weekday, startsAt: "09:00", endsAt: "10:00" });
    await academic.addScheduleSlot(db, actor, ePhy.id, { weekday, startsAt: "16:00", endsAt: "17:00" });
  }
  const { student } = await students.admitStudent(db, actor, {
    fullName: "Anika", gender: "FEMALE", guardianName: "G", guardianRelation: "MOTHER", guardianPhone: "01711000111", admissionDate: "2026-01-01", batchIds: [morning.id], temporaryPassword: "Student123",
  });
  return { tenantId: tenant.id, admin, rahim, salma, mPhy, ePhy, student };
}

describe("portal routine views", () => {
  it("shows a student the changes to their own batches only, in the next two weeks", async () => {
    const s = await setUp();
    await createChange(db, s.admin, { batchSubjectId: s.mPhy.id, classDate: addDays(today, 1), startsAt: "09:00", kind: "CANCEL", reason: "Instructor ill" });
    await createChange(db, s.admin, { batchSubjectId: s.ePhy.id, classDate: addDays(today, 1), startsAt: "16:00", kind: "CANCEL", reason: "Other batch" });
    await createHoliday(db, s.admin, { name: "Victory Day", fromDate: addDays(today, 3) });
    await createChange(db, s.admin, { batchSubjectId: s.mPhy.id, classDate: addDays(today, 20), startsAt: "09:00", kind: "CANCEL", reason: "Too far ahead" });
    const changes = await upcomingChangesForStudent(db, s.tenantId, s.student.userId!);
    expect(changes.map((c) => [c.date, c.status, c.reason])).toEqual([
      [addDays(today, 1), "CANCELLED", "Instructor ill"],
      [addDays(today, 3), "HOLIDAY", "Victory Day"],
    ]);
  });

  it("shows an instructor changes to the classes they teach and the ones they cover", async () => {
    const s = await setUp();
    await createChange(db, s.admin, { batchSubjectId: s.mPhy.id, classDate: addDays(today, 2), startsAt: "09:00", kind: "SUBSTITUTE", substituteInstructorId: s.salma.id });
    expect((await upcomingChangesForInstructor(db, s.tenantId, s.rahim.userId)).map((c) => c.substituteName)).toEqual(["Salma"]);
    expect((await upcomingChangesForInstructor(db, s.tenantId, s.salma.userId)).map((c) => [c.subjectName, c.date])).toEqual([["Physics", addDays(today, 2)]]);
  });

  it("shows a student the lesson progress of their batches' subjects that have plans", async () => {
    const s = await setUp();
    const t1 = await addTopic(db, s.admin, s.mPhy.id, { title: "Vectors" });
    await addTopic(db, s.admin, s.mPhy.id, { title: "Motion", targetDate: addDays(today, -1) });
    await addTopic(db, s.admin, s.ePhy.id, { title: "Other batch" });
    await updateTopic(db, s.admin, t1.id, { status: "COMPLETED" });
    const plans = await myLessonProgress(db, s.tenantId, s.student.userId!);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ subjectName: "Physics", batchName: "Morning", progress: { total: 2, completed: 1, overdue: 1, percent: 50 } });
    expect(plans[0].topics.map((t) => [t.title, t.status, t.overdue])).toEqual([
      ["Vectors", "COMPLETED", false],
      ["Motion", "PENDING", true],
    ]);
  });
});
