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
import { saveGradeScale } from "./grading";
import { saveMarks } from "./marks";
import { examMarksheetDocument, examMeritListDocument } from "./result-documents";
import { getResults, myResults, publishExam } from "./results";
import { createExam, type Viewer } from "./setup";

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

/**
 * Morning (Anika, Bushra) and Evening (Chaity) sit a model test: Physics 100 (Written 70 / MCQ 30) and optional
 * Chemistry 50. Rahim teaches Physics in Morning.
 */
async function setUp() {
  const [tenant] = await testDb.insert(tenants).values({ name: "Results", subdomain: "results", status: "ACTIVE" }).returning();
  const roleIds = await seedBaselineRoles(db, tenant.id);
  const owner = await createLogin(db, { tenantId: tenant.id, name: "Owner", email: "o@results.test", password: "OwnerPass1" });
  await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: owner.id, roleId: roleIds[INSTITUTE_OWNER_ROLE] });
  const actor = { tenantId: tenant.id, userId: owner.id };
  const admin: Viewer = { ...actor, permissions: ADMIN };
  const hsc = await academic.createCourse(db, actor, { name: "HSC", code: "HSC", dueDay: 10 });
  const physics = await academic.createSubject(db, actor, hsc.id, { name: "Physics" });
  const chemistry = await academic.createSubject(db, actor, hsc.id, { name: "Chemistry" });
  const morning = await academic.createBatch(db, actor, hsc.id, { name: "Morning" });
  const evening = await academic.createBatch(db, actor, hsc.id, { name: "Evening" });
  const phy = await academic.addBatchSubject(db, actor, morning.id, physics.id);
  const teacherLogin = await createLogin(db, { tenantId: tenant.id, name: "Rahim", email: "rahim@results.test", password: "TeachPass1" });
  const [teacher] = await testDb.insert(instructors).values({ tenantId: tenant.id, userId: teacherLogin.id, fullName: "Rahim" }).returning();
  await academic.setBatchSubjectInstructors(db, actor, phy.id, [teacher.id]);
  const instructor: Viewer = { tenantId: tenant.id, userId: teacherLogin.id, permissions: INSTRUCTOR };
  const admit = async (fullName: string, batchId: string) =>
    (
      await students.admitStudent(db, actor, {
        fullName, gender: "FEMALE", guardianName: "G", guardianRelation: "MOTHER", guardianPhone: "01711000111", admissionDate: "2026-10-01", batchIds: [batchId], temporaryPassword: "Student123",
      })
    ).student;
  const anika = await admit("Anika", morning.id);
  const bushra = await admit("Bushra", morning.id);
  const chaity = await admit("Chaity", evening.id);
  const exam = await createExam(db, admin, {
    courseId: hsc.id, name: "Model test", kind: "MODEL", startsOn: "2026-11-01", endsOn: "2026-11-01", batchIds: [morning.id, evening.id],
    papers: [
      { subjectId: physics.id, fullMarks: "100", passMarks: "33", parts: [{ name: "Written", fullMarks: "70", passMarks: "23" }, { name: "MCQ", fullMarks: "30", passMarks: "10" }] },
      { subjectId: chemistry.id, fullMarks: "50", passMarks: "17", optional: true },
    ],
  });
  const phyPaper = exam.papers.find((p) => p.subjectName === "Physics")!;
  const chemPaper = exam.papers.find((p) => p.subjectName === "Chemistry")!;
  const [w, m] = phyPaper.parts;
  const physicsMark = (studentId: string, written: string, mcq: string) => ({ studentId, parts: [{ partId: w.id, obtained: written }, { partId: m.id, obtained: mcq }] });
  return { tenant, owner, admin, instructor, exam, phyPaper, chemPaper, physicsMark, anika, bushra, chaity, morning };
}

const row = (res: Awaited<ReturnType<typeof getResults>>, name: string) => res.rows.find((r) => r.fullName === name)!;

describe("results and the combined merit list", () => {
  it("grades each student, adds the optional bonus, and ranks all batches together", async () => {
    const s = await setUp();
    await saveMarks(db, s.admin, s.phyPaper.id, { entries: [s.physicsMark(s.anika.id, "50", "22"), s.physicsMark(s.bushra.id, "60", "25"), s.physicsMark(s.chaity.id, "50", "22")] });
    await saveMarks(db, s.admin, s.chemPaper.id, { entries: [{ studentId: s.anika.id, obtained: "45" }] });

    const res = await getResults(db, s.admin, s.exam.id);
    // Bushra 85 (A+ 5.00); Anika 72 + optional 45/50 = 117 (A 4.00 + bonus 3.0 → capped 5.00); Chaity 72 (A 4.00).
    expect(row(res, "Anika").outcome).toMatchObject({ status: "COMPLETE", totalObtained: 117, gpa: 5, grade: "A+", passed: true });
    expect(row(res, "Bushra").outcome).toMatchObject({ totalObtained: 85, gpa: 5 });
    expect(res.rows.map((r) => [r.fullName, r.position])).toEqual([
      ["Anika", 1],
      ["Bushra", 2],
      ["Chaity", 3],
    ]);
    expect(res.summary).toMatchObject({ sitting: 3, passed: 3, failed: 0, pending: 0, highest: 117 });
  });

  it("shows an instructor their batches with the combined positions", async () => {
    const s = await setUp();
    await saveMarks(db, s.admin, s.phyPaper.id, { entries: [s.physicsMark(s.anika.id, "40", "15"), s.physicsMark(s.bushra.id, "40", "15"), s.physicsMark(s.chaity.id, "65", "28")] });
    const mine = await getResults(db, s.instructor, s.exam.id);
    expect(mine.rows.map((r) => [r.fullName, r.position])).toEqual([
      ["Anika", 2],
      ["Bushra", 2],
    ]);
    expect(mine.batches.map((b) => b.name)).toEqual(["Morning"]);
  });
});

describe("publishing", () => {
  it("is refused while a compulsory mark is missing, naming who; an empty optional paper is fine", async () => {
    const s = await setUp();
    await saveMarks(db, s.admin, s.phyPaper.id, { entries: [s.physicsMark(s.anika.id, "50", "20"), { studentId: s.bushra.id, absent: true }] });
    await expect(publishExam(db, s.admin, s.exam.id)).rejects.toMatchObject({ code: "CONFLICT_MARKS_MISSING", message: expect.stringContaining("Chaity (Physics)") });
    await saveMarks(db, s.admin, s.phyPaper.id, { entries: [s.physicsMark(s.chaity.id, "30", "8")] });
    const published = await publishExam(db, s.admin, s.exam.id);
    expect(published).toMatchObject({ sitting: 3, passed: 1, failed: 1, absent: 1 });
    await expect(publishExam(db, s.admin, s.exam.id)).rejects.toMatchObject({ code: "CONFLICT_EXAM_PUBLISHED" });
    expect((await testDb.select().from(auditLogs).where(eq(auditLogs.action, "EXAM_PUBLISHED")))).toHaveLength(1);
  });

  it("freezes the grading scale: a later scale change leaves published grades alone; a correction still updates them", async () => {
    const s = await setUp();
    await saveMarks(db, s.admin, s.phyPaper.id, { entries: [s.physicsMark(s.anika.id, "60", "22"), s.physicsMark(s.bushra.id, "50", "20"), s.physicsMark(s.chaity.id, "40", "15")] });
    await publishExam(db, s.admin, s.exam.id);
    expect(row(await getResults(db, s.admin, s.exam.id), "Anika").outcome.grade).toBe("A+"); // 82%
    await saveGradeScale(db, s.admin, [{ grade: "A+", minPercent: 90, gradePoint: 5 }, { grade: "A", minPercent: 33, gradePoint: 4 }, { grade: "F", minPercent: 0, gradePoint: 0 }]);
    expect(row(await getResults(db, s.admin, s.exam.id), "Anika").outcome.grade).toBe("A+");

    await saveMarks(db, s.admin, s.phyPaper.id, { entries: [s.physicsMark(s.anika.id, "50", "22")], reason: "Re-checked" });
    expect(row(await getResults(db, s.admin, s.exam.id), "Anika").outcome).toMatchObject({ totalObtained: 72, grade: "A" });
  });
});

describe("students and printing", () => {
  it("shows a student only published results, with their position", async () => {
    const s = await setUp();
    await saveMarks(db, s.admin, s.phyPaper.id, { entries: [s.physicsMark(s.anika.id, "60", "22"), s.physicsMark(s.bushra.id, "50", "20"), s.physicsMark(s.chaity.id, "40", "15")] });
    expect((await myResults(db, s.tenant.id, s.anika.userId)).results).toEqual([]);
    await publishExam(db, s.admin, s.exam.id);
    const mine = await myResults(db, s.tenant.id, s.anika.userId);
    expect(mine.results).toHaveLength(1);
    expect(mine.results[0]).toMatchObject({ exam: { name: "Model test" }, sitting: 3, row: { position: 1, outcome: { passed: true } } });
  });

  it("prints marksheets only once published: a student gets only their own; an instructor only their batches", async () => {
    const s = await setUp();
    await saveMarks(db, s.admin, s.phyPaper.id, { entries: [s.physicsMark(s.anika.id, "60", "22"), s.physicsMark(s.bushra.id, "50", "20"), s.physicsMark(s.chaity.id, "40", "15")] });
    const selection = examMarksheetDocument.parseSelection({ exam: s.exam.id }, { kind: "all" });
    const ctx = { tenantId: s.tenant.id, selection, limit: 500, permissions: ADMIN, userId: s.owner.id };
    await expect(examMarksheetDocument.load(db, { ...ctx, scope: { kind: "all" } })).rejects.toMatchObject({ code: "VALIDATION_NOT_PUBLISHED" });
    await publishExam(db, s.admin, s.exam.id);
    expect((await examMarksheetDocument.load(db, { ...ctx, scope: { kind: "all" } })).records).toHaveLength(3);
    const own = await examMarksheetDocument.load(db, { ...ctx, scope: { kind: "self", userId: s.anika.userId! }, permissions: new Set(["exams.self.view"]), userId: s.anika.userId! });
    expect(own.records.map((r) => r.data.row.fullName)).toEqual(["Anika"]);
    const theirs = await examMarksheetDocument.load(db, { ...ctx, scope: { kind: "all" }, permissions: INSTRUCTOR, userId: s.instructor.userId });
    expect(theirs.records.map((r) => r.data.row.fullName).sort()).toEqual(["Anika", "Bushra"]);
    const merit = await examMeritListDocument.load(db, { ...ctx, scope: { kind: "all" } });
    expect(merit.records[0].data.rows).toHaveLength(3);
  });

  it("keeps a published exam's results for a student who leaves later", async () => {
    const s = await setUp();
    await saveMarks(db, s.admin, s.phyPaper.id, { entries: [s.physicsMark(s.anika.id, "60", "22"), s.physicsMark(s.bushra.id, "50", "20"), s.physicsMark(s.chaity.id, "40", "15")] });
    await publishExam(db, s.admin, s.exam.id);
    await students.setStudentStatus(db, { tenantId: s.tenant.id, userId: s.owner.id }, s.bushra.id, { status: "LEFT", reason: "Moved" });
    expect((await getResults(db, s.admin, s.exam.id)).rows.map((r) => r.fullName)).toContain("Bushra");
    expect((await testDb.select().from(exams).where(eq(exams.id, s.exam.id)))[0].publishedScale).not.toBeNull();
  });
});
