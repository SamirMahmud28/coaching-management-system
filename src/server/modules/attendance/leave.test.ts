import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../core/testing/db";
import { auditLogs, tenants, userRoles } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import { INSTITUTE_OWNER_ROLE } from "../../core/rbac/catalog";
import { todayInDhaka } from "@/lib/dates";
import * as academic from "../academic/service";
import { createLogin } from "../auth/credentials";
import { seedBaselineRoles } from "../rbac/service";
import * as students from "../students/service";
import { applyForLeave, decideLeave, enterLeave, listLeave, myLeave, revokeLeave, withdrawLeave } from "./leave";
import { classesOn, getRegister, saveRegister, weekdayOf, type Viewer } from "./registers";

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

async function setUp() {
  const [tenant] = await testDb.insert(tenants).values({ name: "Leave", subdomain: "leave", status: "ACTIVE" }).returning();
  const roleIds = await seedBaselineRoles(db, tenant.id);
  const owner = await createLogin(db, { tenantId: tenant.id, name: "Owner", email: "o@leave.test", password: "OwnerPass1" });
  await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: owner.id, roleId: roleIds[INSTITUTE_OWNER_ROLE] });
  const actor = { tenantId: tenant.id, userId: owner.id };
  const admin: Viewer = { ...actor, permissions: new Set(["academic.view", "attendance.view", "attendance.take", "attendance.manage"]) };
  const hsc = await academic.createCourse(db, actor, { name: "HSC", code: "HSC", dueDay: 10 });
  const physics = await academic.createSubject(db, actor, hsc.id, { name: "Physics" });
  const batch = await academic.createBatch(db, actor, hsc.id, { name: "Morning" });
  const phy = await academic.addBatchSubject(db, actor, batch.id, physics.id);
  for (const d of [today, yesterday]) await academic.addScheduleSlot(db, actor, phy.id, { weekday: weekdayOf(d), startsAt: "09:00", endsAt: "10:00" });
  const admit = async (fullName: string) =>
    (
      await students.admitStudent(db, actor, {
        fullName, gender: "FEMALE", guardianName: "G", guardianRelation: "MOTHER", guardianPhone: "01711000111", admissionDate: addDays(today, -60), batchIds: [batch.id], temporaryPassword: "Student123",
      })
    ).student;
  const anika = await admit("Anika");
  const bushra = await admit("Bushra");
  const asStudent = (s: { userId: string }) => ({ tenantId: tenant.id, userId: s.userId });
  return { tenant, actor, admin, phy, anika, bushra, asStudent };
}

const at = (bs: string, date: string) => ({ batchSubjectId: bs, date, startsAt: "09:00" });
const effectiveOf = async (s: Awaited<ReturnType<typeof setUp>>, studentId: string, date: string) =>
  (await getRegister(db, s.admin, at(s.phy.id, date))).rows.find((r) => r.studentId === studentId)!.effective;

describe("a student's application", () => {
  it("waits for a decision, may go at most 7 days back, and can't overlap another", async () => {
    const s = await setUp();
    await expect(applyForLeave(db, s.asStudent(s.anika), { fromDate: addDays(today, -8), toDate: today, reason: "Fever" })).rejects.toMatchObject({ code: "VALIDATION_LEAVE_TOO_EARLY" });
    await expect(applyForLeave(db, s.asStudent(s.anika), { fromDate: today, toDate: yesterday, reason: "Fever" })).rejects.toMatchObject({ code: "VALIDATION_DATE_ORDER" });
    await expect(applyForLeave(db, s.asStudent(s.anika), { fromDate: today, toDate: today, reason: "  " })).rejects.toMatchObject({ code: "VALIDATION_REASON_REQUIRED" });
    const leave = await applyForLeave(db, s.asStudent(s.anika), { fromDate: addDays(today, -7), toDate: addDays(today, 30), reason: "Fever" });
    expect(leave).toMatchObject({ status: "PENDING", source: "STUDENT" });
    await expect(applyForLeave(db, s.asStudent(s.anika), { fromDate: addDays(today, 30), toDate: addDays(today, 31), reason: "Trip" })).rejects.toMatchObject({ code: "CONFLICT_LEAVE_OVERLAP" });
    // Pending leave doesn't excuse anything.
    expect(await effectiveOf(s, s.anika.id, today)).toBe("PRESENT");
  });

  it("can be withdrawn by its student while pending, and only then; another student's is a 404", async () => {
    const s = await setUp();
    const leave = await applyForLeave(db, s.asStudent(s.anika), { fromDate: today, toDate: today, reason: "Fever" });
    await expect(withdrawLeave(db, s.asStudent(s.bushra), leave.id)).rejects.toMatchObject({ status: 404 });
    await withdrawLeave(db, s.asStudent(s.anika), leave.id);
    await expect(withdrawLeave(db, s.asStudent(s.anika), leave.id)).rejects.toMatchObject({ code: "CONFLICT_LEAVE_STATE" });
    // Withdrawn leave no longer blocks the days.
    const again = await applyForLeave(db, s.asStudent(s.anika), { fromDate: today, toDate: today, reason: "Fever" });
    await decideLeave(db, s.actor, again.id, { decision: "APPROVE" });
    await expect(withdrawLeave(db, s.asStudent(s.anika), again.id)).rejects.toMatchObject({ code: "CONFLICT_LEAVE_STATE" });
  });

  it("shows the student their applications and the decision note, without staff names", async () => {
    const s = await setUp();
    const leave = await applyForLeave(db, s.asStudent(s.anika), { fromDate: today, toDate: addDays(today, 2), reason: "Wedding" });
    await decideLeave(db, s.actor, leave.id, { decision: "REJECT", note: "Exam week" });
    const [mine] = await myLeave(db, s.tenant.id, s.anika.userId);
    expect(mine).toMatchObject({ status: "REJECTED", decisionNote: "Exam week", days: 3 });
    expect(mine).not.toHaveProperty("decidedByName");
    expect(await myLeave(db, s.tenant.id, s.bushra.userId)).toEqual([]);
    await expect(myLeave(db, s.tenant.id, s.actor.userId)).rejects.toMatchObject({ status: 404 });
  });
});

describe("approval and its effect on registers", () => {
  it("excuses registers already taken and starts later ones Excused; rejection changes nothing", async () => {
    const s = await setUp();
    await saveRegister(db, s.admin, { ...at(s.phy.id, yesterday), marks: [{ studentId: s.anika.id, status: "ABSENT" }, { studentId: s.bushra.id, status: "ABSENT" }], reason: "Paper register" });
    const a = await applyForLeave(db, s.asStudent(s.anika), { fromDate: yesterday, toDate: today, reason: "Fever" });
    const b = await applyForLeave(db, s.asStudent(s.bushra), { fromDate: yesterday, toDate: yesterday, reason: "Fever" });

    const approved = await decideLeave(db, s.actor, a.id, { decision: "APPROVE", note: "Get well" });
    expect(approved).toMatchObject({ status: "APPROVED", classesExcused: 1 });
    await decideLeave(db, s.actor, b.id, { decision: "REJECT" });
    await expect(decideLeave(db, s.actor, a.id, { decision: "REJECT" })).rejects.toMatchObject({ code: "CONFLICT_LEAVE_STATE" });

    expect(await effectiveOf(s, s.anika.id, yesterday)).toBe("EXCUSED");
    expect(await effectiveOf(s, s.bushra.id, yesterday)).toBe("ABSENT");
    expect(await effectiveOf(s, s.anika.id, today)).toBe("EXCUSED"); // not taken yet: starts Excused
    const [day] = await classesOn(db, s.admin, yesterday);
    expect(day.counts).toEqual({ present: 0, absent: 1, late: 0, excused: 1 });
    expect(await testDb.select().from(auditLogs).where(eq(auditLogs.action, "LEAVE_APPROVED"))).toHaveLength(1);
  });

  it("lets the office enter leave for any dates, approved at once", async () => {
    const s = await setUp();
    await saveRegister(db, s.admin, { ...at(s.phy.id, yesterday), marks: [], reason: "Paper register" });
    const leave = await enterLeave(db, s.actor, s.anika.id, { fromDate: addDays(today, -30), toDate: yesterday, reason: "Guardian phoned" });
    expect(leave).toMatchObject({ status: "APPROVED", source: "OFFICE", classesExcused: 1 });
    expect(await effectiveOf(s, s.anika.id, yesterday)).toBe("EXCUSED");
    await expect(enterLeave(db, s.actor, s.anika.id, { fromDate: yesterday, toDate: today, reason: "Again" })).rejects.toMatchObject({ code: "CONFLICT_LEAVE_OVERLAP" });
    expect((await listLeave(db, s.tenant.id, { status: "APPROVED" })).map((l) => l.appliedByName)).toEqual(["Owner"]);
  });
});

describe("revoking approved leave", () => {
  it("needs a reason and puts each class back as it was marked, or unmarked", async () => {
    const s = await setUp();
    await saveRegister(db, s.admin, { ...at(s.phy.id, yesterday), marks: [{ studentId: s.anika.id, status: "LATE" }], reason: "Paper register" });
    const leave = await enterLeave(db, s.actor, s.anika.id, { fromDate: yesterday, toDate: today, reason: "Fever" });
    // Taken while on leave: nobody marked Anika, so she has no status of her own.
    await saveRegister(db, s.admin, { ...at(s.phy.id, today), marks: [] });
    expect(await effectiveOf(s, s.anika.id, today)).toBe("EXCUSED");

    await expect(revokeLeave(db, s.actor, leave.id, { reason: " " })).rejects.toMatchObject({ code: "VALIDATION_REASON_REQUIRED" });
    const revoked = await revokeLeave(db, s.actor, leave.id, { reason: "She attended" });
    expect(revoked).toMatchObject({ status: "REVOKED", classesRestored: 2 });
    expect(await effectiveOf(s, s.anika.id, yesterday)).toBe("LATE");
    expect(await effectiveOf(s, s.anika.id, today)).toBeNull();
    await expect(revokeLeave(db, s.actor, leave.id, { reason: "Again" })).rejects.toMatchObject({ code: "CONFLICT_LEAVE_STATE" });
    const [log] = await testDb.select().from(auditLogs).where(eq(auditLogs.action, "LEAVE_REVOKED"));
    expect(log.newValue).toMatchObject({ reason: "She attended", classesRestored: 2 });
  });
});
