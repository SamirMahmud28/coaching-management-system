import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { batchMemberships, batches, courses, examBatches, examMarkParts, examMarks, examPaperParts, examPapers, exams, students, subjects } from "../../core/db/schema";
import { inTransaction } from "../../core/db/transaction";
import type { DbOrTx } from "../../core/db/types";
import { ConflictError, NotFoundError } from "../../core/errors";
import { audit } from "../audit/service";
import { getGradeScale } from "./grading";
import { examSitters } from "./marks";
import { assignPositions, evaluateStudent, sortScale, type GradeBand, type PaperInput, type StudentOutcome } from "./result-engine";
import { seesAllExams, taughtBatchIds, type Viewer } from "./setup";

// Results (D102–D113): calculated from the marks each time; one merit list across all the exam's batches (D109);
// published as a whole (D110) once every mark is in (D113), with the grading scale frozen at publishing (D112).

type ExamRow = typeof exams.$inferSelect;

async function examById(db: DbOrTx, tenantId: string, examId: string): Promise<ExamRow & { courseName: string }> {
  const [row] = await db
    .select({ exam: exams, courseName: courses.name })
    .from(exams)
    .innerJoin(courses, and(eq(courses.tenantId, exams.tenantId), eq(courses.id, exams.courseId)))
    .where(and(eq(exams.tenantId, tenantId), eq(exams.id, examId)));
  if (!row) throw new NotFoundError("EXAM");
  return { ...row.exam, courseName: row.courseName };
}

/** The scale an exam is graded with: frozen at publishing (D112), else the institute's current one. */
async function scaleFor(db: DbOrTx, exam: ExamRow): Promise<GradeBand[]> {
  if (exam.state === "PUBLISHED" && exam.publishedScale) return sortScale(exam.publishedScale as GradeBand[]);
  return (await getGradeScale(db, exam.tenantId)).bands;
}

export interface ResultRow {
  studentId: string;
  studentCode: string;
  fullName: string;
  userId: string | null;
  batchId: string;
  batchName: string;
  rollNumber: string | null;
  position: number | null;
  outcome: StudentOutcome;
}

/**
 * Every sitting student's result in an exam, ranked together (D109). Not scoped: callers filter what a viewer may see.
 */
export async function calculateResults(db: DbOrTx, tenantId: string, examId: string) {
  const exam = await examById(db, tenantId, examId);
  const scale = await scaleFor(db, exam);
  const [batchRows, paperRows] = await Promise.all([
    db
      .select({ id: batches.id, name: batches.name })
      .from(examBatches)
      .innerJoin(batches, and(eq(batches.tenantId, examBatches.tenantId), eq(batches.id, examBatches.batchId)))
      .where(and(eq(examBatches.tenantId, tenantId), eq(examBatches.examId, examId)))
      .orderBy(asc(batches.name)),
    db
      .select({ id: examPapers.id, subjectName: subjects.name, fullMarks: examPapers.fullMarks, passMarks: examPapers.passMarks, optional: examPapers.optional })
      .from(examPapers)
      .innerJoin(subjects, and(eq(subjects.tenantId, examPapers.tenantId), eq(subjects.id, examPapers.subjectId)))
      .where(and(eq(examPapers.tenantId, tenantId), eq(examPapers.examId, examId)))
      .orderBy(asc(examPapers.position), asc(subjects.name)),
  ]);
  const paperIds = paperRows.map((p) => p.id);
  const [parts, marks] = await Promise.all([
    paperIds.length
      ? db.select().from(examPaperParts).where(and(eq(examPaperParts.tenantId, tenantId), inArray(examPaperParts.paperId, paperIds))).orderBy(asc(examPaperParts.position))
      : [],
    paperIds.length ? db.select().from(examMarks).where(and(eq(examMarks.tenantId, tenantId), inArray(examMarks.paperId, paperIds))) : [],
  ]);
  const partMarks = marks.length ? await db.select().from(examMarkParts).where(and(eq(examMarkParts.tenantId, tenantId), inArray(examMarkParts.markId, marks.map((m) => m.id)))) : [];

  // Who sits: the batches' members on the first day, plus anyone who already has a mark (D26, D101).
  const sitters = await examSitters(db, tenantId, batchRows.map((b) => b.id), exam.startsOn);
  const people = new Map<string, { studentId: string; studentCode: string; fullName: string; rollNumber: string | null; batchId: string; batchName: string }>();
  for (const s of sitters) if (!people.has(s.studentId)) people.set(s.studentId, s);
  const markedOnly = [...new Set(marks.map((m) => m.studentId))].filter((id) => !people.has(id));
  if (markedOnly.length) {
    // Students who have marks but are no longer members (left since): placed in their exam batch.
    const rows = await db
      .select({ studentId: students.id, studentCode: students.studentCode, fullName: students.fullName, rollNumber: batchMemberships.rollNumber, batchId: batches.id, batchName: batches.name })
      .from(batchMemberships)
      .innerJoin(students, and(eq(students.tenantId, batchMemberships.tenantId), eq(students.id, batchMemberships.studentId)))
      .innerJoin(batches, and(eq(batches.tenantId, batchMemberships.tenantId), eq(batches.id, batchMemberships.batchId)))
      .where(and(eq(batchMemberships.tenantId, tenantId), inArray(batchMemberships.studentId, markedOnly), inArray(batchMemberships.batchId, batchRows.map((b) => b.id))));
    for (const r of rows) if (!people.has(r.studentId)) people.set(r.studentId, r);
  }
  const userIds = people.size
    ? new Map(
        (await db.select({ id: students.id, userId: students.userId }).from(students).where(and(eq(students.tenantId, tenantId), inArray(students.id, [...people.keys()])))).map((r) => [r.id, r.userId]),
      )
    : new Map<string, string | null>();

  const markBy = new Map(marks.map((m) => [`${m.studentId}|${m.paperId}`, m]));
  const options = { showGrades: exam.showGrades };
  const rows = [...people.values()].map((p) => {
    const inputs: PaperInput[] = paperRows.map((paper) => {
      const mark = markBy.get(`${p.studentId}|${paper.id}`);
      const paperParts = parts.filter((x) => x.paperId === paper.id);
      return {
        paperId: paper.id, name: paper.subjectName, optional: paper.optional, fullMarks: Number(paper.fullMarks), passMarks: Number(paper.passMarks),
        absent: mark?.absent ?? false,
        obtained: mark && !mark.absent && mark.obtained !== null ? Number(mark.obtained) : null,
        parts: paperParts.map((x) => {
          const pm = mark ? partMarks.find((y) => y.markId === mark.id && y.partId === x.id) : undefined;
          return { name: x.name, fullMarks: Number(x.fullMarks), passMarks: x.passMarks === null ? null : Number(x.passMarks), obtained: pm ? Number(pm.obtained) : null };
        }),
      };
    });
    return { ...p, userId: userIds.get(p.studentId) ?? null, outcome: evaluateStudent(inputs, scale, options) };
  });
  const positions = assignPositions(rows.map((r) => ({ status: r.outcome.status, passed: r.outcome.passed, totalObtained: r.outcome.totalObtained, gpa: r.outcome.gpa })));
  const results: ResultRow[] = rows.map((r, i) => ({ ...r, position: positions[i] }));
  results.sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity) || a.fullName.localeCompare(b.fullName));
  return { exam, scale, batches: batchRows, papers: paperRows.map((p) => ({ ...p, parts: parts.filter((x) => x.paperId === p.id).map((x) => ({ id: x.id, name: x.name, fullMarks: x.fullMarks, passMarks: x.passMarks })) })), results };
}

function summarise(results: ResultRow[]) {
  const complete = results.filter((r) => r.outcome.status === "COMPLETE");
  const totals = complete.map((r) => r.outcome.totalObtained);
  return {
    sitting: results.length,
    passed: complete.filter((r) => r.outcome.passed).length,
    failed: complete.filter((r) => !r.outcome.passed).length,
    absent: results.filter((r) => r.outcome.status === "ABSENT").length,
    pending: results.filter((r) => r.outcome.status === "PENDING").length,
    highest: totals.length ? Math.max(...totals) : null,
    average: totals.length ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 100) / 100 : null,
  };
}

/** Who still needs a mark, per paper (D113). */
function missingMarks(results: ResultRow[]) {
  return results
    .filter((r) => r.outcome.status === "PENDING")
    .map((r) => ({ studentId: r.studentId, studentCode: r.studentCode, fullName: r.fullName, batchName: r.batchName, papers: r.outcome.papers.filter((p) => p.status === "PENDING").map((p) => p.name) }));
}

/**
 * The results sheet (D103, D109): the combined merit list, filtered to what the viewer may see — the office all
 * batches, an instructor the batches they teach (D24) — and optionally one batch.
 */
export async function getResults(db: DbOrTx, viewer: Viewer, examId: string, filter: { batchId?: string } = {}) {
  const calc = await calculateResults(db, viewer.tenantId, examId);
  let visible = calc.batches.map((b) => b.id);
  if (!seesAllExams(viewer)) {
    const taught = new Set(await taughtBatchIds(db, viewer.tenantId, viewer.userId));
    visible = visible.filter((id) => taught.has(id));
    if (!visible.length) throw new NotFoundError("EXAM");
  }
  const rows = calc.results.filter((r) => visible.includes(r.batchId) && (!filter.batchId || r.batchId === filter.batchId));
  return {
    exam: {
      id: calc.exam.id, name: calc.exam.name, kind: calc.exam.kind, courseName: calc.exam.courseName, startsOn: calc.exam.startsOn, endsOn: calc.exam.endsOn,
      state: calc.exam.state, showGrades: calc.exam.showGrades, publishedAt: calc.exam.publishedAt,
    },
    batches: calc.batches.filter((b) => visible.includes(b.id)),
    papers: calc.papers,
    summary: summarise(rows),
    missing: missingMarks(rows),
    rows,
  };
}

/**
 * Publishes the whole exam (D110) once every sitting student has a mark or Absent in every compulsory paper (D113),
 * freezing the grading scale on it (D112). Audited.
 */
export async function publishExam(db: DbOrTx, actor: Viewer, examId: string) {
  return inTransaction(db, async (tx) => {
    await tx.select({ id: exams.id }).from(exams).where(and(eq(exams.tenantId, actor.tenantId), eq(exams.id, examId))).for("update");
    const calc = await calculateResults(tx, actor.tenantId, examId);
    if (calc.exam.state === "PUBLISHED") throw new ConflictError("CONFLICT_EXAM_PUBLISHED", "This exam is already published.");
    if (!calc.results.length) throw new ConflictError("CONFLICT_NO_STUDENTS", "Nobody sits this exam, so there's nothing to publish.");
    const missing = missingMarks(calc.results);
    if (missing.length) {
      const sample = missing.slice(0, 5).map((m) => `${m.fullName} (${m.papers.join(", ")})`).join("; ");
      throw new ConflictError(
        "CONFLICT_MARKS_MISSING",
        `${missing.length} ${missing.length === 1 ? "student still needs" : "students still need"} marks: ${sample}${missing.length > 5 ? "; …" : ""}. Enter the mark or tick Absent first.`,
        { missing },
      );
    }
    const now = new Date();
    await tx
      .update(exams)
      .set({ state: "PUBLISHED", publishedAt: now, publishedBy: actor.userId, publishedScale: calc.scale, updatedAt: now, updatedBy: actor.userId })
      .where(and(eq(exams.tenantId, actor.tenantId), eq(exams.id, examId)));
    const summary = summarise(calc.results);
    await audit.record(tx, {
      tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action: "EXAM_PUBLISHED", resourceType: "EXAM", resourceId: examId,
      newValue: { name: calc.exam.name, ...summary, scale: calc.scale },
    });
    return { publishedAt: now, ...summary };
  });
}

/** One student's result, as on the marksheet. */
export async function resultCard(db: DbOrTx, tenantId: string, examId: string, studentId: string) {
  const calc = await calculateResults(db, tenantId, examId);
  const row = calc.results.find((r) => r.studentId === studentId);
  if (!row) throw new NotFoundError("RESULT");
  return { exam: calc.exam, papers: calc.papers, sitting: calc.results.length, row };
}

/** The signed-in student's published results, newest first (D27). */
export async function myResults(db: DbOrTx, tenantId: string, userId: string) {
  const [student] = await db.select({ id: students.id }).from(students).where(and(eq(students.tenantId, tenantId), eq(students.userId, userId)));
  if (!student) throw new NotFoundError("STUDENT");
  // Published exams of batches the student belongs or belonged to.
  const published = await db
    .selectDistinct({ id: exams.id, startsOn: exams.startsOn })
    .from(exams)
    .innerJoin(examBatches, and(eq(examBatches.tenantId, exams.tenantId), eq(examBatches.examId, exams.id)))
    .innerJoin(batchMemberships, and(eq(batchMemberships.tenantId, examBatches.tenantId), eq(batchMemberships.batchId, examBatches.batchId)))
    .where(and(eq(exams.tenantId, tenantId), eq(exams.state, "PUBLISHED"), eq(batchMemberships.studentId, student.id)))
    .orderBy(desc(exams.startsOn));
  const out = [];
  for (const e of published) {
    const calc = await calculateResults(db, tenantId, e.id);
    const row = calc.results.find((r) => r.studentId === student.id);
    if (row) out.push({ exam: { id: calc.exam.id, name: calc.exam.name, kind: calc.exam.kind, courseName: calc.exam.courseName, startsOn: calc.exam.startsOn, showGrades: calc.exam.showGrades }, sitting: calc.results.length, row });
  }
  return { studentId: student.id, results: out };
}
