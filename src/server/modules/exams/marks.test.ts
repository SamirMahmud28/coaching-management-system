import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../core/testing/db";
import { auditLogs, exams, instructors, tenants, userRoles } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import { INSTITUTE_OWNER_ROLE, ROLE_TEMPLATES } from "../../core/rbac/catalog";
import * as academic from "../academic/service";
import { createLogin } from "../auth/credentials";
import { seedBaselineRoles } from "../rbac/service";
import * as students from "../students/service";
import { getRoster, saveMarks } from "./marks";
import { createExam, getExam, type Viewer } from "./setup";

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;

beforeEach(async () => {
  await reset();
  await seedPlatformCatalog(testDb);
});
afterAll(async () => {
  await close();
});

const ADMIN = new Set(["academic.view", "exams.view", "exams.manage", "exams.marks.enter", "exams.publish"]);
const INSTRUCTOR = new Set(ROLE_TEMPLATES.find((t) => t.name === "Instructor")!.permissions);

/** Morning and Evening sit "Model test"; Rahim teaches Physics in Morning only. */
async function setUp() {
  const [tenant] = await testDb.insert(tenants).values({ name: "Marks", subdomain: "marks", status: "ACTIVE" }).returning();
  const roleIds = await seedBaselineRoles(db, tenant.id);
  const owner = await createLogin(db, { tenantId: tenant.id, name: "Owner", email: "o@marks.test", password: "OwnerPass1" });
  await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: owner.id, roleId: roleIds[INSTITUTE_OWNER_ROLE] });
  const actor = { tenantId: tenant.id, userId: owner.id };
  const admin: Viewer = { ...actor, permissions: ADMIN };
  const hsc = await academic.createCourse(db, actor, { name: "HSC", code: "HSC", dueDay: 10 });
  const physics = await academic.createSubject(db, actor, hsc.id, { name: "Physics" });
  const chemistry = await academic.createSubject(db, actor, hsc.id, { name: "Chemistry" });
  const morning = await academic.createBatch(db, actor, hsc.id, { name: "Morning" });
  const evening = await academic.createBatch(db, actor, hsc.id, { name: "Evening" });
  const phy = await academic.addBatchSubject(db, actor, morning.id, physics.id);
  const teacherLogin = await createLogin(db, { tenantId: tenant.id, name: "Rahim", email: "rahim@marks.test", password: "TeachPass1" });
  const [teacher] = await testDb.insert(instructors).values({ tenantId: tenant.id, userId: teacherLogin.id, fullName: "Rahim" }).returning();
  await academic.setBatchSubjectInstructors(db, actor, phy.id, [teacher.id]);
  const instructor: Viewer = { tenantId: tenant.id, userId: teacherLogin.id, permissions: INSTRUCTOR };
  const admit = async (fullName: string, batchId: string, admissionDate = "2026-10-01") =>
    (
      await students.admitStudent(db, actor, {
        fullName, gender: "FEMALE", guardianName: "G", guardianRelation: "MOTHER", guardianPhone: "01711000111", admissionDate, batchIds: [batchId], temporaryPassword: "Student123",
      })
    ).student;
  const anika = await admit("Anika", morning.id);
  const bushra = await admit("Bushra", morning.id);
  const chaity = await admit("Chaity", evening.id);
  const dina = await admit("Dina", morning.id);
  await students.setStudentStatus(db, actor, dina.id, { status: "ON_HOLD" });
  const late = await admit("Esha", morning.id, "2026-11-05"); // joined after the exam
  const exam = await createExam(db, admin, {
    courseId: hsc.id, name: "Model test", kind: "MODEL", startsOn: "2026-11-01", endsOn: "2026-11-02", batchIds: [morning.id, evening.id],
    papers: [
      { subjectId: physics.id, fullMarks: "100", passMarks: "33", parts: [{ name: "Written", fullMarks: "70", passMarks: "23" }, { name: "MCQ", fullMarks: "30", passMarks: "10" }] },
      { subjectId: chemistry.id, fullMarks: "50", passMarks: "17" },
    ],
  });
  const physicsPaper = exam.papers.find((p) => p.subjectName === "Physics")!;
  const chemistryPaper = exam.papers.find((p) => p.subjectName === "Chemistry")!;
  const [written, mcq] = physicsPaper.parts;
  return { tenant, admin, instructor, exam, physicsPaper, chemistryPaper, written, mcq, anika, bushra, chaity, dina, late };
}

describe("the roster", () => {
  it("lists the exam batches' members on the first day, leaving On Hold students and later joiners off", async () => {
    const s = await setUp();
    const roster = await getRoster(db, s.admin, s.chemistryPaper.id);
    expect(roster.rows.map((r) => [r.batchName, r.fullName])).toEqual([
      ["Evening", "Chaity"],
      ["Morning", "Anika"],
      ["Morning", "Bushra"],
    ]);
    expect(roster).toMatchObject({ canEdit: true, reasonRequired: false });
  });

  it("shows an instructor only the batches where they teach the paper's subject; other papers are 404", async () => {
    const s = await setUp();
    const roster = await getRoster(db, s.instructor, s.physicsPaper.id);
    expect(roster.rows.map((r) => r.fullName)).toEqual(["Anika", "Bushra"]);
    await expect(getRoster(db, s.instructor, s.chemistryPaper.id)).rejects.toMatchObject({ status: 404 });
    const exam = await getExam(db, s.instructor, s.exam.id);
    expect(exam.papers.map((p) => [p.subjectName, p.canOpenMarks])).toEqual([
      ["Physics", true],
      ["Chemistry", false],
    ]);
  });
});

describe("entering marks", () => {
  it("saves part marks, a paper mark and Absent; validates; and changes nothing on a repeat", async () => {
    const s = await setUp();
    await saveMarks(db, s.instructor, s.physicsPaper.id, {
      entries: [
        { studentId: s.anika.id, parts: [{ partId: s.written.id, obtained: "60.5" }, { partId: s.mcq.id, obtained: "21.25" }] },
        { studentId: s.bushra.id, absent: true },
      ],
    });
    const roster = await getRoster(db, s.admin, s.physicsPaper.id);
    expect(roster.rows.find((r) => r.fullName === "Anika")!.mark).toMatchObject({ absent: false, parts: { [s.written.id]: "60.50", [s.mcq.id]: "21.25" } });
    expect(roster.rows.find((r) => r.fullName === "Bushra")!.mark).toMatchObject({ absent: true });

    await expect(saveMarks(db, s.instructor, s.physicsPaper.id, { entries: [{ studentId: s.anika.id, parts: [{ partId: s.mcq.id, obtained: "31" }] }] })).rejects.toMatchObject({ code: "VALIDATION_MARKS_ABOVE_FULL" });
    await expect(saveMarks(db, s.instructor, s.physicsPaper.id, { entries: [{ studentId: s.anika.id, parts: [{ partId: s.mcq.id, obtained: "2.255" }] }] })).rejects.toMatchObject({ code: "VALIDATION_MARKS" });
    await expect(saveMarks(db, s.admin, s.chemistryPaper.id, { entries: [{ studentId: s.anika.id, absent: true, obtained: "20" }] })).rejects.toMatchObject({ code: "VALIDATION_ABSENT_WITH_MARKS" });
    await expect(saveMarks(db, s.instructor, s.physicsPaper.id, { entries: [{ studentId: s.chaity.id, absent: true }] })).rejects.toMatchObject({ code: "VALIDATION_NOT_ON_ROSTER" });
    await expect(saveMarks(db, s.admin, s.chemistryPaper.id, { entries: [{ studentId: s.dina.id, obtained: "20" }] })).rejects.toMatchObject({ code: "VALIDATION_NOT_ON_ROSTER" });

    const repeat = await saveMarks(db, s.instructor, s.physicsPaper.id, {
      entries: [{ studentId: s.anika.id, parts: [{ partId: s.mcq.id, obtained: "21.25" }, { partId: s.written.id, obtained: "60.50" }] }],
    });
    expect(repeat.saved).toBe(0);
    expect(await testDb.select().from(auditLogs).where(eq(auditLogs.action, "EXAM_MARKS_ENTERED"))).toHaveLength(1);
  });

  it("locks the paper's setup once it has marks, and clears a mark in a draft", async () => {
    const s = await setUp();
    await saveMarks(db, s.admin, s.chemistryPaper.id, { entries: [{ studentId: s.chaity.id, obtained: "40" }] });
    expect((await getExam(db, s.admin, s.exam.id)).papers.find((p) => p.subjectName === "Chemistry")).toMatchObject({ locked: true, markCount: 1 });
    await saveMarks(db, s.admin, s.chemistryPaper.id, { entries: [{ studentId: s.chaity.id, clear: true }] });
    expect((await getRoster(db, s.admin, s.chemistryPaper.id)).rows.find((r) => r.fullName === "Chaity")!.mark).toBeNull();
  });
});

describe("after publishing", () => {
  it("refuses instructors, and lets Owner/Admin correct with a reason, audited with old and new", async () => {
    const s = await setUp();
    await saveMarks(db, s.admin, s.chemistryPaper.id, { entries: [{ studentId: s.anika.id, obtained: "30" }] });
    await testDb.update(exams).set({ state: "PUBLISHED", publishedAt: new Date(), publishedScale: [] }).where(eq(exams.id, s.exam.id));

    expect(await getRoster(db, s.instructor, s.physicsPaper.id)).toMatchObject({ canEdit: false, whyNot: expect.stringMatching(/Owner or Admin/) });
    await expect(saveMarks(db, s.instructor, s.physicsPaper.id, { entries: [{ studentId: s.anika.id, absent: true }] })).rejects.toMatchObject({ code: "CONFLICT_EXAM_PUBLISHED" });
    await expect(saveMarks(db, s.admin, s.chemistryPaper.id, { entries: [{ studentId: s.anika.id, obtained: "35" }] })).rejects.toMatchObject({ code: "VALIDATION_REASON_REQUIRED" });
    await expect(saveMarks(db, s.admin, s.chemistryPaper.id, { entries: [{ studentId: s.anika.id, clear: true }], reason: "x" })).rejects.toMatchObject({ code: "CONFLICT_EXAM_PUBLISHED" });

    await saveMarks(db, s.admin, s.chemistryPaper.id, { entries: [{ studentId: s.anika.id, obtained: "35" }], reason: "Re-checked the script" });
    const [log] = await testDb.select().from(auditLogs).where(eq(auditLogs.action, "EXAM_MARKS_CORRECTED"));
    expect(log.oldValue).toMatchObject({ marks: [{ studentId: s.anika.id, mark: "30.00" }] });
    expect(log.newValue).toMatchObject({ reason: "Re-checked the script", marks: [{ studentId: s.anika.id, mark: "35.00" }] });
  });
});
