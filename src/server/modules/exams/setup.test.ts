import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../core/testing/db";
import { auditLogs, examMarks, instructors, tenants, userRoles } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import { INSTITUTE_OWNER_ROLE, ROLE_TEMPLATES } from "../../core/rbac/catalog";
import * as academic from "../academic/service";
import { createLogin } from "../auth/credentials";
import { seedBaselineRoles } from "../rbac/service";
import * as students from "../students/service";
import { createExam, deleteExam, getExam, listExams, setupOptions, updateExam, type ExamInput, type Viewer } from "./setup";

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

async function setUp() {
  const [tenant] = await testDb.insert(tenants).values({ name: "Exams", subdomain: "exams", status: "ACTIVE" }).returning();
  const roleIds = await seedBaselineRoles(db, tenant.id);
  const owner = await createLogin(db, { tenantId: tenant.id, name: "Owner", email: "o@exams.test", password: "OwnerPass1" });
  await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: owner.id, roleId: roleIds[INSTITUTE_OWNER_ROLE] });
  const actor = { tenantId: tenant.id, userId: owner.id };
  const admin: Viewer = { ...actor, permissions: ADMIN };
  const hsc = await academic.createCourse(db, actor, { name: "HSC", code: "HSC", dueDay: 10 });
  const ssc = await academic.createCourse(db, actor, { name: "SSC", code: "SSC", dueDay: 10 });
  const physics = await academic.createSubject(db, actor, hsc.id, { name: "Physics" });
  const chemistry = await academic.createSubject(db, actor, hsc.id, { name: "Chemistry" });
  const math = await academic.createSubject(db, actor, ssc.id, { name: "Math" });
  const morning = await academic.createBatch(db, actor, hsc.id, { name: "Morning" });
  const evening = await academic.createBatch(db, actor, hsc.id, { name: "Evening" });
  const sscBatch = await academic.createBatch(db, actor, ssc.id, { name: "SSC Day" });
  const phy = await academic.addBatchSubject(db, actor, morning.id, physics.id);
  const teacherLogin = await createLogin(db, { tenantId: tenant.id, name: "Rahim", email: "rahim@exams.test", password: "TeachPass1" });
  const [teacher] = await testDb.insert(instructors).values({ tenantId: tenant.id, userId: teacherLogin.id, fullName: "Rahim" }).returning();
  await academic.setBatchSubjectInstructors(db, actor, phy.id, [teacher.id]);
  const instructor: Viewer = { tenantId: tenant.id, userId: teacherLogin.id, permissions: INSTRUCTOR };
  const input = (o: Partial<ExamInput> = {}): ExamInput => ({
    courseId: hsc.id, name: "Model test 1", kind: "MODEL", startsOn: "2026-11-01", endsOn: "2026-11-02", syllabus: "Ch 1–3", batchIds: [morning.id, evening.id],
    papers: [
      { subjectId: physics.id, fullMarks: "100", passMarks: "33", parts: [{ name: "Written", fullMarks: "70", passMarks: "23" }, { name: "MCQ", fullMarks: "30", passMarks: "10" }] },
      { subjectId: chemistry.id, fullMarks: "50", passMarks: "17", optional: true },
    ],
    ...o,
  });
  return { tenant, actor, admin, instructor, owner, hsc, ssc, physics, chemistry, math, morning, evening, sscBatch, input };
}

describe("creating an exam (D101, D102, D108)", () => {
  it("saves batches, papers and parts, audited", async () => {
    const s = await setUp();
    const exam = await createExam(db, s.admin, s.input());
    expect(exam).toMatchObject({ name: "Model test 1", state: "DRAFT", showGrades: true, courseName: "HSC" });
    expect(exam.batches.map((b) => b.name)).toEqual(["Evening", "Morning"]);
    expect(exam.papers.map((p) => [p.subjectName, p.fullMarks, p.optional, p.parts.map((x) => x.name)])).toEqual([
      ["Physics", "100.00", false, ["Written", "MCQ"]],
      ["Chemistry", "50.00", true, []],
    ]);
    expect((await testDb.select().from(auditLogs)).map((l) => l.action)).toContain("EXAM_CREATED");
  });

  it("refuses batches or subjects of another course, and inconsistent marks", async () => {
    const s = await setUp();
    await expect(createExam(db, s.admin, s.input({ batchIds: [s.sscBatch.id] }))).rejects.toMatchObject({ code: "VALIDATION_BATCH" });
    await expect(createExam(db, s.admin, s.input({ papers: [{ subjectId: s.math.id, fullMarks: "100", passMarks: "33" }] }))).rejects.toMatchObject({ code: "VALIDATION_SUBJECT" });
    const bad = (p: ExamInput["papers"][number]) => createExam(db, s.admin, s.input({ papers: [p] }));
    await expect(bad({ subjectId: s.physics.id, fullMarks: "100", passMarks: "120" })).rejects.toMatchObject({ code: "VALIDATION_PASS_MARKS" });
    await expect(bad({ subjectId: s.physics.id, fullMarks: "100", passMarks: "33", parts: [{ name: "W", fullMarks: "60" }, { name: "M", fullMarks: "30" }] })).rejects.toMatchObject({ code: "VALIDATION_PARTS_TOTAL" });
    await expect(bad({ subjectId: s.physics.id, fullMarks: "100", passMarks: "33", parts: [{ name: "W", fullMarks: "100" }] })).rejects.toMatchObject({ code: "VALIDATION_PARTS" });
    await expect(bad({ subjectId: s.physics.id, fullMarks: "100.555", passMarks: "33" })).rejects.toMatchObject({ code: "VALIDATION_MARKS" });
    await expect(createExam(db, s.admin, s.input({ endsOn: "2026-10-01" }))).rejects.toMatchObject({ code: "VALIDATION_DATE_ORDER" });
    await expect(createExam(db, s.admin, s.input({ batchIds: [] }))).rejects.toMatchObject({ code: "VALIDATION_NO_BATCHES" });
  });

  it("offers the active courses with their subjects and batches", async () => {
    const s = await setUp();
    const options = await setupOptions(db, s.tenant.id);
    expect(options.find((c) => c.name === "HSC")).toMatchObject({ subjects: [{ name: "Chemistry" }, { name: "Physics" }], batches: [{ name: "Evening" }, { name: "Morning" }] });
  });
});

describe("who sees which exams (D24)", () => {
  it("shows the office every exam, and an instructor only exams of batches they teach (others are 404)", async () => {
    const s = await setUp();
    const both = await createExam(db, s.admin, s.input());
    const eveningOnly = await createExam(db, s.admin, s.input({ name: "Evening weekly", kind: "WEEKLY", batchIds: [s.evening.id] }));
    expect((await listExams(db, s.admin)).map((e) => e.name).sort()).toEqual(["Evening weekly", "Model test 1"]);
    expect((await listExams(db, s.instructor)).map((e) => e.id)).toEqual([both.id]);
    await expect(getExam(db, s.instructor, eveningOnly.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("editing (the structure lock)", () => {
  it("changes anything while there are no marks", async () => {
    const s = await setUp();
    const exam = await createExam(db, s.admin, s.input());
    const updated = await updateExam(db, s.admin, exam.id, {
      ...s.input({ name: "Model test 1 (revised)", batchIds: [s.morning.id] }),
      papers: [{ subjectId: s.chemistry.id, fullMarks: "60", passMarks: "20" }, { subjectId: s.physics.id, fullMarks: "100", passMarks: "40" }],
    });
    expect(updated.name).toBe("Model test 1 (revised)");
    expect(updated.batches.map((b) => b.name)).toEqual(["Morning"]);
    expect(updated.papers.map((p) => [p.subjectName, p.fullMarks, p.passMarks, p.parts.length])).toEqual([
      ["Chemistry", "60.00", "20.00", 0],
      ["Physics", "100.00", "40.00", 0],
    ]);
  });

  it("locks a paper's setup once it has marks, and the batches of students with marks", async () => {
    const s = await setUp();
    const exam = await createExam(db, s.admin, s.input());
    const { student } = await students.admitStudent(db, s.actor, {
      fullName: "Anika", gender: "FEMALE", guardianName: "G", guardianRelation: "MOTHER", guardianPhone: "01711000111", batchIds: [s.evening.id], temporaryPassword: "Student123",
    });
    const chem = exam.papers.find((p) => p.subjectName === "Chemistry")!;
    await testDb.insert(examMarks).values({ tenantId: s.tenant.id, paperId: chem.id, studentId: student.id, obtained: "40", enteredBy: s.owner.id });

    const base = s.input();
    await expect(updateExam(db, s.admin, exam.id, { ...base, papers: [base.papers[0], { ...base.papers[1], fullMarks: "60" }] })).rejects.toMatchObject({ code: "CONFLICT_PAPER_HAS_MARKS" });
    await expect(updateExam(db, s.admin, exam.id, { ...base, papers: [base.papers[0]] })).rejects.toMatchObject({ code: "CONFLICT_PAPER_HAS_MARKS" });
    await expect(updateExam(db, s.admin, exam.id, { ...base, batchIds: [s.morning.id] })).rejects.toMatchObject({ code: "CONFLICT_BATCH_HAS_MARKS" });
    // The unmarked paper and the details can still change.
    const ok = await updateExam(db, s.admin, exam.id, { ...base, name: "Renamed", papers: [{ ...base.papers[0], passMarks: "40" }, base.papers[1]] });
    expect(ok.papers.find((p) => p.subjectName === "Physics")).toMatchObject({ passMarks: "40.00", locked: false });
    expect(ok.papers.find((p) => p.subjectName === "Chemistry")).toMatchObject({ locked: true, markCount: 1 });
    await expect(deleteExam(db, s.admin, exam.id)).rejects.toMatchObject({ code: "CONFLICT_EXAM_HAS_MARKS" });
  });

  it("deletes a draft without marks, and guards the course from deletion while an exam uses it", async () => {
    const s = await setUp();
    const exam = await createExam(db, s.admin, s.input());
    await expect(academic.deleteCourse(db, s.actor, s.hsc.id)).rejects.toMatchObject({ status: 409 });
    await deleteExam(db, s.admin, exam.id);
    await expect(getExam(db, s.admin, exam.id)).rejects.toMatchObject({ status: 404 });
  });
});
