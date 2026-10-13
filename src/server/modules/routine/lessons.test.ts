import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../core/testing/db";
import { instructors, tenants, userRoles } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import { INSTITUTE_OWNER_ROLE, ROLE_TEMPLATES } from "../../core/rbac/catalog";
import { addDays, todayInDhaka } from "@/lib/dates";
import * as academic from "../academic/service";
import { createLogin } from "../auth/credentials";
import { seedBaselineRoles } from "../rbac/service";
import { addTopic, copyPlan, deleteTopic, lessonOverview, lessonPlan, reorderTopics, summarise, updateTopic } from "./lessons";
import type { Viewer } from "./service";

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
const INSTRUCTOR = new Set(ROLE_TEMPLATES.find((t) => t.name === "Instructor")!.permissions);

/** Morning: Physics (Rahim) and Chemistry (Karim). Evening: Physics (Karim). */
async function setUp() {
  const [tenant] = await testDb.insert(tenants).values({ name: "Lessons", subdomain: "lessons", status: "ACTIVE" }).returning();
  const roleIds = await seedBaselineRoles(db, tenant.id);
  const owner = await createLogin(db, { tenantId: tenant.id, name: "Owner", email: "o@lessons.test", password: "OwnerPass1" });
  await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: owner.id, roleId: roleIds[INSTITUTE_OWNER_ROLE] });
  const actor = { tenantId: tenant.id, userId: owner.id };
  const teacher = async (name: string) => {
    const login = await createLogin(db, { tenantId: tenant.id, name, email: `${name.toLowerCase()}@lessons.test`, password: "TeachPass1" });
    const [row] = await testDb.insert(instructors).values({ tenantId: tenant.id, userId: login.id, fullName: name }).returning();
    return { ...row, viewer: { tenantId: tenant.id, userId: login.id, permissions: INSTRUCTOR } as Viewer };
  };
  const rahim = await teacher("Rahim");
  const karim = await teacher("Karim");
  const hsc = await academic.createCourse(db, actor, { name: "HSC", code: "HSC", dueDay: 10 });
  const physics = await academic.createSubject(db, actor, hsc.id, { name: "Physics" });
  const chemistry = await academic.createSubject(db, actor, hsc.id, { name: "Chemistry" });
  const morning = await academic.createBatch(db, actor, hsc.id, { name: "Morning" });
  const evening = await academic.createBatch(db, actor, hsc.id, { name: "Evening" });
  const mPhy = await academic.addBatchSubject(db, actor, morning.id, physics.id);
  const mChem = await academic.addBatchSubject(db, actor, morning.id, chemistry.id);
  const ePhy = await academic.addBatchSubject(db, actor, evening.id, physics.id);
  await academic.setBatchSubjectInstructors(db, actor, mPhy.id, [rahim.id]);
  await academic.setBatchSubjectInstructors(db, actor, mChem.id, [karim.id]);
  await academic.setBatchSubjectInstructors(db, actor, ePhy.id, [karim.id]);
  return { admin: { ...actor, permissions: ADMIN } as Viewer, rahim, karim, mPhy, mChem, ePhy };
}

describe("lesson plans (D118–D120)", () => {
  it("lets the subject's instructor build and update their plan; Completed records the date; Overdue is derived", async () => {
    const s = await setUp();
    const ch1 = await addTopic(db, s.rahim.viewer, s.mPhy.id, { title: "Ch 1: Vectors", startDate: addDays(today, -20), targetDate: addDays(today, -5) });
    const ch2 = await addTopic(db, s.rahim.viewer, s.mPhy.id, { title: "Ch 2: Motion", targetDate: addDays(today, 10) });
    await expect(addTopic(db, s.rahim.viewer, s.mPhy.id, { title: "Bad", startDate: today, targetDate: addDays(today, -1) })).rejects.toMatchObject({ code: "VALIDATION_DATE_ORDER" });

    let plan = await lessonPlan(db, s.rahim.viewer, s.mPhy.id);
    expect(plan.topics.map((t) => [t.title, t.status, t.overdue])).toEqual([
      ["Ch 1: Vectors", "PENDING", true],
      ["Ch 2: Motion", "PENDING", false],
    ]);
    await updateTopic(db, s.rahim.viewer, ch1.id, { status: "COMPLETED" });
    await updateTopic(db, s.rahim.viewer, ch2.id, { status: "ONGOING" });
    plan = await lessonPlan(db, s.rahim.viewer, s.mPhy.id);
    expect(plan.topics[0]).toMatchObject({ status: "COMPLETED", completedOn: today, overdue: false });
    expect(plan.progress).toMatchObject({ total: 2, completed: 1, ongoing: 1, overdue: 0, percent: 50 });

    await updateTopic(db, s.rahim.viewer, ch1.id, { status: "ONGOING" });
    expect((await lessonPlan(db, s.rahim.viewer, s.mPhy.id)).topics[0]).toMatchObject({ completedOn: null, overdue: true });
    await reorderTopics(db, s.rahim.viewer, s.mPhy.id, [ch2.id, ch1.id]);
    expect((await lessonPlan(db, s.rahim.viewer, s.mPhy.id)).topics.map((t) => t.title)).toEqual(["Ch 2: Motion", "Ch 1: Vectors"]);
    await deleteTopic(db, s.rahim.viewer, ch2.id);
    expect((await lessonPlan(db, s.admin, s.mPhy.id)).topics).toHaveLength(1);
  });

  it("lets an instructor see their batches' plans but edit only the subjects they teach (D24)", async () => {
    const s = await setUp();
    const topic = await addTopic(db, s.admin, s.mChem.id, { title: "Ch 1: Atoms" });
    expect((await lessonPlan(db, s.rahim.viewer, s.mChem.id)).editable).toBe(false); // same batch, Karim's subject
    await expect(updateTopic(db, s.rahim.viewer, topic.id, { status: "ONGOING" })).rejects.toMatchObject({ status: 403 });
    await expect(lessonPlan(db, s.rahim.viewer, s.ePhy.id)).rejects.toMatchObject({ status: 404 }); // not his batch
    expect((await lessonOverview(db, s.rahim.viewer)).map((p) => [p.batchName, p.subjectName, p.editable])).toEqual([
      ["Morning", "Chemistry", false],
      ["Morning", "Physics", true],
    ]);
  });

  it("lets the office copy another batch's plan of the same subject: titles only, all Pending", async () => {
    const s = await setUp();
    const ch1 = await addTopic(db, s.admin, s.mPhy.id, { title: "Ch 1: Vectors", targetDate: addDays(today, 3) });
    await updateTopic(db, s.admin, ch1.id, { status: "COMPLETED" });
    await addTopic(db, s.admin, s.mPhy.id, { title: "Ch 2: Motion" });
    expect((await lessonPlan(db, s.admin, s.ePhy.id)).copySources.map((c) => c.batchName)).toEqual(["Morning"]);
    expect(await copyPlan(db, s.admin, s.ePhy.id, s.mPhy.id)).toEqual({ copied: 2 });
    expect((await lessonPlan(db, s.admin, s.ePhy.id)).topics.map((t) => [t.title, t.status, t.targetDate])).toEqual([
      ["Ch 1: Vectors", "PENDING", null],
      ["Ch 2: Motion", "PENDING", null],
    ]);
    await expect(copyPlan(db, s.admin, s.mChem.id, s.mPhy.id)).rejects.toMatchObject({ code: "VALIDATION_COPY_SOURCE" });
    await expect(copyPlan(db, s.karim.viewer, s.ePhy.id, s.mPhy.id)).rejects.toMatchObject({ status: 403 });
  });

  it("summarises progress", () => {
    expect(summarise([], today)).toMatchObject({ total: 0, percent: null });
    expect(summarise([{ status: "COMPLETED", targetDate: null }, { status: "PENDING", targetDate: addDays(today, -1) }, { status: "ONGOING", targetDate: today }], today)).toEqual({
      total: 3, completed: 1, ongoing: 1, overdue: 1, percent: 33,
    });
  });
});
