import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  batchSubjectInstructors,
  batchSubjects,
  batches,
  courses,
  examBatches,
  examMarks,
  examPaperParts,
  examPapers,
  exams,
  instructors,
  subjects,
} from "../../core/db/schema";
import { inTransaction } from "../../core/db/transaction";
import type { DbOrTx } from "../../core/db/types";
import { ConflictError, NotFoundError, ValidationError } from "../../core/errors";
import { isCalendarDate } from "@/lib/dates";
import { audit } from "../audit/service";
import { hundredths } from "./result-engine";
import "./references";

// Exam setup (D101, D102, D108): an exam of one course for some of its batches, with subject papers and their parts.
// The structure of a paper is locked once it has marks, and a published exam keeps its batches and papers.

export interface Viewer {
  tenantId: string;
  userId: string;
  permissions: ReadonlySet<string>;
}
export type ExamKind = "WEEKLY" | "MONTHLY" | "MODEL" | "CUSTOM";
export const EXAM_KINDS: readonly ExamKind[] = ["WEEKLY", "MONTHLY", "MODEL", "CUSTOM"];

export interface PartInput {
  name: string;
  fullMarks: string;
  passMarks?: string | null;
}
export interface PaperInput {
  subjectId: string;
  fullMarks: string;
  passMarks: string;
  optional?: boolean;
  parts?: PartInput[];
}
export interface ExamInput {
  courseId: string;
  name: string;
  kind: ExamKind;
  startsOn: string;
  endsOn: string;
  syllabus?: string | null;
  showGrades?: boolean;
  batchIds: string[];
  papers: PaperInput[];
}

/** Staff who see every batch see every exam; an instructor sees the exams of batches they teach (D24). */
export const seesAllExams = (viewer: Viewer) => viewer.permissions.has("exams.manage") || viewer.permissions.has("academic.view");

/** The batches this instructor teaches any subject of. */
export async function taughtBatchIds(db: DbOrTx, tenantId: string, userId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ batchId: batchSubjects.batchId })
    .from(batchSubjects)
    .innerJoin(batchSubjectInstructors, and(eq(batchSubjectInstructors.tenantId, batchSubjects.tenantId), eq(batchSubjectInstructors.batchSubjectId, batchSubjects.id)))
    .innerJoin(instructors, and(eq(instructors.tenantId, batchSubjectInstructors.tenantId), eq(instructors.id, batchSubjectInstructors.instructorId)))
    .where(and(eq(batchSubjects.tenantId, tenantId), eq(instructors.userId, userId)));
  return rows.map((r) => r.batchId);
}

// --- input cleaning --------------------------------------------------------------------------------------------

/** A mark like "100" or "33.5": positive (or zero when allowed), at most two decimals, at most 99999.99. */
export function cleanMarks(value: string | null | undefined, field: string, label: string, allowZero = false): string {
  const text = String(value ?? "").trim();
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(text)) throw new ValidationError("VALIDATION_MARKS", `${label}: enter a number with at most two decimals.`, { field });
  const n = Number(text);
  if (!allowZero && n <= 0) throw new ValidationError("VALIDATION_MARKS", `${label} must be more than 0.`, { field });
  return n.toFixed(2);
}

function cleanText(value: string | null | undefined, max: number, field: string, label: string, required: boolean) {
  const text = value?.trim() || null;
  if (required && !text) throw new ValidationError("VALIDATION_REQUIRED", `${label} is required.`, { field });
  if (text && text.length > max) throw new ValidationError("VALIDATION_TEXT", `${label} can be at most ${max} characters.`, { field });
  return text;
}

interface CleanPaper {
  subjectId: string;
  fullMarks: string;
  passMarks: string;
  optional: boolean;
  parts: { name: string; fullMarks: string; passMarks: string | null }[];
}

function cleanExam(input: ExamInput) {
  const name = cleanText(input.name, 120, "name", "The exam name", true)!;
  if (!EXAM_KINDS.includes(input.kind)) throw new ValidationError("VALIDATION_KIND", "Choose weekly, monthly, model or custom.", { field: "kind" });
  if (!isCalendarDate(input.startsOn ?? "")) throw new ValidationError("VALIDATION_DATE", "Enter the first exam day.", { field: "startsOn" });
  if (!isCalendarDate(input.endsOn ?? "")) throw new ValidationError("VALIDATION_DATE", "Enter the last exam day.", { field: "endsOn" });
  if (input.endsOn < input.startsOn) throw new ValidationError("VALIDATION_DATE_ORDER", "The last day can't be before the first.", { field: "endsOn" });
  const syllabus = cleanText(input.syllabus, 5000, "syllabus", "The syllabus", false);
  const batchIds = [...new Set(input.batchIds ?? [])];
  if (!batchIds.length) throw new ValidationError("VALIDATION_NO_BATCHES", "Choose at least one batch.", { field: "batchIds" });
  if (!input.papers?.length) throw new ValidationError("VALIDATION_NO_PAPERS", "Add at least one subject paper.", { field: "papers" });
  if (input.papers.length > 30) throw new ValidationError("VALIDATION_TOO_MANY", "An exam can have at most 30 papers.", { field: "papers" });
  const seen = new Set<string>();
  const papers: CleanPaper[] = input.papers.map((p, i) => {
    const field = `papers.${i}`;
    if (seen.has(p.subjectId)) throw new ValidationError("VALIDATION_DUPLICATE_SUBJECT", "Each subject can have only one paper.", { field });
    seen.add(p.subjectId);
    const fullMarks = cleanMarks(p.fullMarks, `${field}.fullMarks`, "Full marks");
    const passMarks = cleanMarks(p.passMarks, `${field}.passMarks`, "Pass marks", true);
    if (hundredths(Number(passMarks)) > hundredths(Number(fullMarks))) throw new ValidationError("VALIDATION_PASS_MARKS", "Pass marks can't be more than full marks.", { field: `${field}.passMarks` });
    const partNames = new Set<string>();
    const parts = (p.parts ?? []).map((part, j) => {
      const pf = `${field}.parts.${j}`;
      const partName = cleanText(part.name, 40, `${pf}.name`, "Each part's name", true)!;
      if (partNames.has(partName.toLowerCase())) throw new ValidationError("VALIDATION_DUPLICATE_PART", "Each part of a paper needs a different name.", { field: `${pf}.name` });
      partNames.add(partName.toLowerCase());
      const partFull = cleanMarks(part.fullMarks, `${pf}.fullMarks`, `${partName} full marks`);
      const partPass = part.passMarks == null || String(part.passMarks).trim() === "" ? null : cleanMarks(part.passMarks, `${pf}.passMarks`, `${partName} pass marks`, true);
      if (partPass !== null && hundredths(Number(partPass)) > hundredths(Number(partFull))) {
        throw new ValidationError("VALIDATION_PASS_MARKS", `${partName}: pass marks can't be more than full marks.`, { field: `${pf}.passMarks` });
      }
      return { name: partName, fullMarks: partFull, passMarks: partPass };
    });
    if (parts.length === 1) throw new ValidationError("VALIDATION_PARTS", "Split a paper into at least two parts, or none.", { field: `${field}.parts` });
    if (parts.length > 6) throw new ValidationError("VALIDATION_PARTS", "A paper can have at most 6 parts.", { field: `${field}.parts` });
    if (parts.length && parts.reduce((sum, x) => sum + hundredths(Number(x.fullMarks)), 0) !== hundredths(Number(fullMarks))) {
      throw new ValidationError("VALIDATION_PARTS_TOTAL", "The parts' full marks must add up to the paper's full marks.", { field: `${field}.parts` });
    }
    return { subjectId: p.subjectId, fullMarks, passMarks, optional: !!p.optional, parts };
  });
  return { name, kind: input.kind, startsOn: input.startsOn, endsOn: input.endsOn, syllabus, showGrades: input.showGrades ?? true, batchIds, papers };
}

/** Batches and subjects must be the course's, and new ones active (the database also refuses other courses'). */
async function checkCourseItems(tx: DbOrTx, tenantId: string, courseId: string, batchIds: string[], subjectIds: string[], keep: { batches: Set<string>; subjects: Set<string> }) {
  const [course] = await tx.select().from(courses).where(and(eq(courses.tenantId, tenantId), eq(courses.id, courseId)));
  if (!course) throw new NotFoundError("COURSE");
  const bRows = await tx.select().from(batches).where(and(eq(batches.tenantId, tenantId), inArray(batches.id, batchIds)));
  for (const id of batchIds) {
    const b = bRows.find((r) => r.id === id);
    if (!b || b.courseId !== courseId) throw new ValidationError("VALIDATION_BATCH", "Choose batches of the exam's course.", { field: "batchIds" });
    if (b.status !== "ACTIVE" && !keep.batches.has(id)) throw new ValidationError("VALIDATION_BATCH", `${b.name} is archived.`, { field: "batchIds" });
  }
  const sRows = await tx.select().from(subjects).where(and(eq(subjects.tenantId, tenantId), inArray(subjects.id, subjectIds)));
  for (const id of subjectIds) {
    const s = sRows.find((r) => r.id === id);
    if (!s || s.courseId !== courseId) throw new ValidationError("VALIDATION_SUBJECT", "Choose subjects of the exam's course.", { field: "papers" });
    if (s.status !== "ACTIVE" && !keep.subjects.has(id)) throw new ValidationError("VALIDATION_SUBJECT", `${s.name} is archived.`, { field: "papers" });
  }
  return { course, batchNames: new Map(bRows.map((b) => [b.id, b.name])), subjectNames: new Map(sRows.map((s) => [s.id, s.name])) };
}

async function insertPapers(tx: DbOrTx, tenantId: string, examId: string, courseId: string, papers: CleanPaper[], positions: Map<string, number>) {
  for (const p of papers) {
    const [row] = await tx
      .insert(examPapers)
      .values({ tenantId, examId, courseId, subjectId: p.subjectId, fullMarks: p.fullMarks, passMarks: p.passMarks, optional: p.optional, position: positions.get(p.subjectId) ?? 0 })
      .returning({ id: examPapers.id });
    if (p.parts.length) {
      await tx.insert(examPaperParts).values(p.parts.map((part, j) => ({ tenantId, paperId: row.id, name: part.name, fullMarks: part.fullMarks, passMarks: part.passMarks, position: j })));
    }
  }
}

const summary = (e: ReturnType<typeof cleanExam>) => ({
  name: e.name, kind: e.kind, startsOn: e.startsOn, endsOn: e.endsOn, showGrades: e.showGrades, batchIds: e.batchIds,
  papers: e.papers.map((p) => ({ subjectId: p.subjectId, fullMarks: p.fullMarks, passMarks: p.passMarks, optional: p.optional, parts: p.parts })),
});

// --- reads -----------------------------------------------------------------------------------------------------

/** Courses with their active subjects and batches, for the exam form. */
export async function setupOptions(db: DbOrTx, tenantId: string) {
  const [courseRows, subjectRows, batchRows] = await Promise.all([
    db.select({ id: courses.id, name: courses.name, code: courses.code }).from(courses).where(and(eq(courses.tenantId, tenantId), eq(courses.status, "ACTIVE"))).orderBy(asc(courses.name)),
    db.select({ id: subjects.id, name: subjects.name, courseId: subjects.courseId }).from(subjects).where(and(eq(subjects.tenantId, tenantId), eq(subjects.status, "ACTIVE"))).orderBy(asc(subjects.name)),
    db.select({ id: batches.id, name: batches.name, courseId: batches.courseId }).from(batches).where(and(eq(batches.tenantId, tenantId), eq(batches.status, "ACTIVE"))).orderBy(asc(batches.name)),
  ]);
  return courseRows.map((c) => ({
    ...c,
    subjects: subjectRows.filter((s) => s.courseId === c.id).map(({ id, name }) => ({ id, name })),
    batches: batchRows.filter((b) => b.courseId === c.id).map(({ id, name }) => ({ id, name })),
  }));
}

/** The viewer's exams, newest first (D24 scope). */
export async function listExams(db: DbOrTx, viewer: Viewer, filter: { courseId?: string; state?: "DRAFT" | "PUBLISHED" } = {}) {
  const scope = seesAllExams(viewer) ? null : await taughtBatchIds(db, viewer.tenantId, viewer.userId);
  if (scope && !scope.length) return [];
  const rows = await db
    .select({
      id: exams.id,
      name: exams.name,
      kind: exams.kind,
      courseId: exams.courseId,
      courseName: courses.name,
      startsOn: exams.startsOn,
      endsOn: exams.endsOn,
      state: exams.state,
      showGrades: exams.showGrades,
      publishedAt: exams.publishedAt,
      paperCount: sql<number>`(select count(*)::int from ${examPapers} p where p.tenant_id = "exams"."tenant_id" and p.exam_id = "exams"."id")`,
    })
    .from(exams)
    .innerJoin(courses, and(eq(courses.tenantId, exams.tenantId), eq(courses.id, exams.courseId)))
    .where(
      and(
        eq(exams.tenantId, viewer.tenantId),
        filter.courseId ? eq(exams.courseId, filter.courseId) : undefined,
        filter.state ? eq(exams.state, filter.state) : undefined,
        scope ? inArray(exams.id, db.select({ id: examBatches.examId }).from(examBatches).where(and(eq(examBatches.tenantId, viewer.tenantId), inArray(examBatches.batchId, scope)))) : undefined,
      ),
    )
    .orderBy(desc(exams.startsOn), asc(exams.name));
  const batchRows = rows.length
    ? await db
        .select({ examId: examBatches.examId, id: batches.id, name: batches.name })
        .from(examBatches)
        .innerJoin(batches, and(eq(batches.tenantId, examBatches.tenantId), eq(batches.id, examBatches.batchId)))
        .where(and(eq(examBatches.tenantId, viewer.tenantId), inArray(examBatches.examId, rows.map((r) => r.id))))
        .orderBy(asc(batches.name))
    : [];
  return rows.map((r) => ({ ...r, batches: batchRows.filter((b) => b.examId === r.id).map(({ id, name }) => ({ id, name })) }));
}

/** One exam with its batches, papers and parts, and how many marks each paper has (for the structure lock). */
export async function getExam(db: DbOrTx, viewer: Viewer, id: string) {
  const [exam] = await db
    .select({
      id: exams.id, name: exams.name, kind: exams.kind, courseId: exams.courseId, courseName: courses.name, startsOn: exams.startsOn, endsOn: exams.endsOn,
      syllabus: exams.syllabus, showGrades: exams.showGrades, state: exams.state, publishedAt: exams.publishedAt,
    })
    .from(exams)
    .innerJoin(courses, and(eq(courses.tenantId, exams.tenantId), eq(courses.id, exams.courseId)))
    .where(and(eq(exams.tenantId, viewer.tenantId), eq(exams.id, id)));
  if (!exam) throw new NotFoundError("EXAM");
  const batchRows = await db
    .select({ id: batches.id, name: batches.name, status: batches.status })
    .from(examBatches)
    .innerJoin(batches, and(eq(batches.tenantId, examBatches.tenantId), eq(batches.id, examBatches.batchId)))
    .where(and(eq(examBatches.tenantId, viewer.tenantId), eq(examBatches.examId, id)))
    .orderBy(asc(batches.name));
  // The subjects whose marks the viewer can open: all for the office; for an instructor, those they teach in one of
  // the exam's batches (D24).
  let taughtSubjects: Set<string> | null = null;
  if (!seesAllExams(viewer)) {
    const taught = new Set(await taughtBatchIds(db, viewer.tenantId, viewer.userId));
    if (!batchRows.some((b) => taught.has(b.id))) throw new NotFoundError("EXAM");
    const rows = await db
      .selectDistinct({ subjectId: batchSubjects.subjectId })
      .from(batchSubjects)
      .innerJoin(batchSubjectInstructors, and(eq(batchSubjectInstructors.tenantId, batchSubjects.tenantId), eq(batchSubjectInstructors.batchSubjectId, batchSubjects.id)))
      .innerJoin(instructors, and(eq(instructors.tenantId, batchSubjectInstructors.tenantId), eq(instructors.id, batchSubjectInstructors.instructorId)))
      .where(and(eq(batchSubjects.tenantId, viewer.tenantId), inArray(batchSubjects.batchId, batchRows.map((b) => b.id)), eq(instructors.userId, viewer.userId)));
    taughtSubjects = new Set(rows.map((r) => r.subjectId));
  }
  const paperRows = await db
    .select({
      id: examPapers.id, subjectId: examPapers.subjectId, subjectName: subjects.name, fullMarks: examPapers.fullMarks, passMarks: examPapers.passMarks,
      optional: examPapers.optional, position: examPapers.position,
      markCount: sql<number>`(select count(*)::int from ${examMarks} m where m.tenant_id = "exam_papers"."tenant_id" and m.paper_id = "exam_papers"."id")`,
    })
    .from(examPapers)
    .innerJoin(subjects, and(eq(subjects.tenantId, examPapers.tenantId), eq(subjects.id, examPapers.subjectId)))
    .where(and(eq(examPapers.tenantId, viewer.tenantId), eq(examPapers.examId, id)))
    .orderBy(asc(examPapers.position), asc(subjects.name));
  const partRows = paperRows.length
    ? await db
        .select({ id: examPaperParts.id, paperId: examPaperParts.paperId, name: examPaperParts.name, fullMarks: examPaperParts.fullMarks, passMarks: examPaperParts.passMarks })
        .from(examPaperParts)
        .where(and(eq(examPaperParts.tenantId, viewer.tenantId), inArray(examPaperParts.paperId, paperRows.map((p) => p.id))))
        .orderBy(asc(examPaperParts.position))
    : [];
  return {
    ...exam,
    batches: batchRows,
    papers: paperRows.map((p) => ({ ...p, locked: p.markCount > 0, canOpenMarks: !taughtSubjects || taughtSubjects.has(p.subjectId), parts: partRows.filter((x) => x.paperId === p.id) })),
    hasMarks: paperRows.some((p) => p.markCount > 0),
  };
}

// --- writes ----------------------------------------------------------------------------------------------------

export async function createExam(db: DbOrTx, actor: Viewer, input: ExamInput) {
  const e = cleanExam(input);
  return inTransaction(db, async (tx) => {
    await checkCourseItems(tx, actor.tenantId, input.courseId, e.batchIds, e.papers.map((p) => p.subjectId), { batches: new Set(), subjects: new Set() });
    const [exam] = await tx
      .insert(exams)
      .values({
        tenantId: actor.tenantId, courseId: input.courseId, name: e.name, kind: e.kind, startsOn: e.startsOn, endsOn: e.endsOn, syllabus: e.syllabus,
        showGrades: e.showGrades, createdBy: actor.userId, updatedBy: actor.userId,
      })
      .returning({ id: exams.id });
    await tx.insert(examBatches).values(e.batchIds.map((batchId) => ({ tenantId: actor.tenantId, examId: exam.id, courseId: input.courseId, batchId })));
    await insertPapers(tx, actor.tenantId, exam.id, input.courseId, e.papers, new Map(e.papers.map((p, i) => [p.subjectId, i])));
    await audit.record(tx, { tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action: "EXAM_CREATED", resourceType: "EXAM", resourceId: exam.id, newValue: { courseId: input.courseId, ...summary(e) } });
    return getExam(tx, actor, exam.id);
  });
}

const samePaper = (old: { fullMarks: string; passMarks: string; optional: boolean; parts: { name: string; fullMarks: string; passMarks: string | null }[] }, p: CleanPaper) =>
  old.fullMarks === p.fullMarks &&
  old.passMarks === p.passMarks &&
  old.optional === p.optional &&
  old.parts.length === p.parts.length &&
  old.parts.every((x, i) => x.name === p.parts[i].name && x.fullMarks === p.parts[i].fullMarks && x.passMarks === p.parts[i].passMarks);

/**
 * Saves the whole exam form. A paper with marks keeps its marks and parts exactly as they are, and can't be removed;
 * a batch whose students have marks can't be removed. Once published, only the name, kind, dates and syllabus change.
 */
export async function updateExam(db: DbOrTx, actor: Viewer, id: string, input: Omit<ExamInput, "courseId">) {
  return inTransaction(db, async (tx) => {
    const current = await getExam(tx, actor, id);
    await tx.execute(sql`select id from exams where tenant_id = ${actor.tenantId} and id = ${id} for update`);
    const e = cleanExam({ ...input, courseId: current.courseId });
    const published = current.state === "PUBLISHED";

    const oldBatchIds = current.batches.map((b) => b.id);
    const removedBatches = oldBatchIds.filter((b) => !e.batchIds.includes(b));
    const addedBatches = e.batchIds.filter((b) => !oldBatchIds.includes(b));
    const byOld = new Map(current.papers.map((p) => [p.subjectId, p]));
    const removedPapers = current.papers.filter((p) => !e.papers.some((n) => n.subjectId === p.subjectId));
    const changedPapers = e.papers.filter((p) => byOld.has(p.subjectId) && !samePaper(byOld.get(p.subjectId)!, p));
    const addedPapers = e.papers.filter((p) => !byOld.has(p.subjectId));

    if (published && (removedBatches.length || addedBatches.length || removedPapers.length || changedPapers.length || addedPapers.length || e.showGrades !== current.showGrades)) {
      throw new ConflictError("CONFLICT_EXAM_PUBLISHED", "This exam is published: only its name, kind, dates and syllabus can change.");
    }
    for (const p of [...removedPapers, ...changedPapers.map((c) => byOld.get(c.subjectId)!)]) {
      if (p.locked) throw new ConflictError("CONFLICT_PAPER_HAS_MARKS", `${p.subjectName} already has marks, so its marks setup can't change and it can't be removed.`, { subjectId: p.subjectId });
    }
    if (removedBatches.length) {
      const [{ count }] = await tx.execute<{ count: number }>(sql`
        select count(*)::int as count from exam_marks m
        join exam_papers p on p.tenant_id = m.tenant_id and p.id = m.paper_id
        join batch_memberships bm on bm.tenant_id = m.tenant_id and bm.student_id = m.student_id
        where m.tenant_id = ${actor.tenantId} and p.exam_id = ${id} and bm.batch_id in ${removedBatches}`);
      if (count > 0) throw new ConflictError("CONFLICT_BATCH_HAS_MARKS", "Students of a batch you removed already have marks in this exam, so it can't be removed.");
    }
    await checkCourseItems(tx, actor.tenantId, current.courseId, e.batchIds, e.papers.map((p) => p.subjectId), {
      batches: new Set(oldBatchIds),
      subjects: new Set(current.papers.map((p) => p.subjectId)),
    });

    await tx
      .update(exams)
      .set({ name: e.name, kind: e.kind, startsOn: e.startsOn, endsOn: e.endsOn, syllabus: e.syllabus, showGrades: e.showGrades, updatedAt: new Date(), updatedBy: actor.userId })
      .where(and(eq(exams.tenantId, actor.tenantId), eq(exams.id, id)));
    if (removedBatches.length) await tx.delete(examBatches).where(and(eq(examBatches.tenantId, actor.tenantId), eq(examBatches.examId, id), inArray(examBatches.batchId, removedBatches)));
    if (addedBatches.length) await tx.insert(examBatches).values(addedBatches.map((batchId) => ({ tenantId: actor.tenantId, examId: id, courseId: current.courseId, batchId })));
    const gone = [...removedPapers, ...changedPapers.map((c) => byOld.get(c.subjectId)!)].map((p) => p.id);
    if (gone.length) await tx.delete(examPapers).where(and(eq(examPapers.tenantId, actor.tenantId), inArray(examPapers.id, gone)));
    const positions = new Map(e.papers.map((p, i) => [p.subjectId, i]));
    await insertPapers(tx, actor.tenantId, id, current.courseId, [...changedPapers, ...addedPapers], positions);
    for (const p of e.papers.filter((p) => byOld.has(p.subjectId) && !changedPapers.includes(p))) {
      await tx.update(examPapers).set({ position: positions.get(p.subjectId)! }).where(and(eq(examPapers.tenantId, actor.tenantId), eq(examPapers.id, byOld.get(p.subjectId)!.id)));
    }
    await audit.record(tx, {
      tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action: "EXAM_UPDATED", resourceType: "EXAM", resourceId: id,
      oldValue: { name: current.name, kind: current.kind, startsOn: current.startsOn, endsOn: current.endsOn, showGrades: current.showGrades, batchIds: oldBatchIds },
      newValue: summary(e),
    });
    return getExam(tx, actor, id);
  });
}

/** A draft exam without any marks can be deleted; otherwise it stays (D5). */
export async function deleteExam(db: DbOrTx, actor: Viewer, id: string) {
  return inTransaction(db, async (tx) => {
    const exam = await getExam(tx, actor, id);
    if (exam.state === "PUBLISHED" || exam.hasMarks) throw new ConflictError("CONFLICT_EXAM_HAS_MARKS", "This exam has marks, so it can't be deleted.");
    await tx.delete(exams).where(and(eq(exams.tenantId, actor.tenantId), eq(exams.id, id)));
    await audit.record(tx, { tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action: "EXAM_DELETED", resourceType: "EXAM", resourceId: id, oldValue: { name: exam.name, courseId: exam.courseId } });
  });
}
