import { and, asc, eq, gt, inArray, lte, or, sql } from "drizzle-orm";
import {
  batchMemberships,
  batchSubjectInstructors,
  batchSubjects,
  batches,
  examBatches,
  examMarkParts,
  examMarks,
  examPaperParts,
  examPapers,
  exams,
  instructors,
  students,
  subjects,
} from "../../core/db/schema";
import { inTransaction } from "../../core/db/transaction";
import type { DbOrTx } from "../../core/db/types";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../core/errors";
import { audit } from "../audit/service";
import { hundredths } from "./result-engine";
import { seesAllExams, type Viewer } from "./setup";

// Marks entry: a roster per paper; a mark per part (or for the whole paper) or Absent. While
// the exam is a draft, whoever may enter marks for the paper can; once published, only Owner/Admin correct a mark,
// with a reason, audited with the old and new values.

/** The paper with its exam, or a 404. */
export async function paperWithExam(db: DbOrTx, tenantId: string, paperId: string) {
  const [row] = await db
    .select({
      id: examPapers.id, examId: exams.id, examName: exams.name, examState: exams.state, startsOn: exams.startsOn, courseId: exams.courseId,
      subjectId: examPapers.subjectId, subjectName: subjects.name, fullMarks: examPapers.fullMarks, passMarks: examPapers.passMarks, optional: examPapers.optional,
    })
    .from(examPapers)
    .innerJoin(exams, and(eq(exams.tenantId, examPapers.tenantId), eq(exams.id, examPapers.examId)))
    .innerJoin(subjects, and(eq(subjects.tenantId, examPapers.tenantId), eq(subjects.id, examPapers.subjectId)))
    .where(and(eq(examPapers.tenantId, tenantId), eq(examPapers.id, paperId)));
  if (!row) throw new NotFoundError("EXAM_PAPER");
  const parts = await db
    .select({ id: examPaperParts.id, name: examPaperParts.name, fullMarks: examPaperParts.fullMarks, passMarks: examPaperParts.passMarks })
    .from(examPaperParts)
    .where(and(eq(examPaperParts.tenantId, tenantId), eq(examPaperParts.paperId, paperId)))
    .orderBy(asc(examPaperParts.position));
  return { ...row, parts };
}

/**
 * The exam batches whose students this viewer can see marks for in a paper: all of them for the office; for an
 * instructor, the batches where they teach the paper's subject. Empty means none.
 */
export async function paperBatchScope(db: DbOrTx, viewer: Viewer, examId: string, subjectId: string): Promise<string[]> {
  const examBatchRows = await db.select({ batchId: examBatches.batchId }).from(examBatches).where(and(eq(examBatches.tenantId, viewer.tenantId), eq(examBatches.examId, examId)));
  const all = examBatchRows.map((b) => b.batchId);
  if (seesAllExams(viewer) || !all.length) return all;
  const taught = await db
    .selectDistinct({ batchId: batchSubjects.batchId })
    .from(batchSubjects)
    .innerJoin(batchSubjectInstructors, and(eq(batchSubjectInstructors.tenantId, batchSubjects.tenantId), eq(batchSubjectInstructors.batchSubjectId, batchSubjects.id)))
    .innerJoin(instructors, and(eq(instructors.tenantId, batchSubjectInstructors.tenantId), eq(instructors.id, batchSubjectInstructors.instructorId)))
    .where(and(eq(batchSubjects.tenantId, viewer.tenantId), eq(batchSubjects.subjectId, subjectId), inArray(batchSubjects.batchId, all), eq(instructors.userId, viewer.userId)));
  return taught.map((t) => t.batchId);
}

/**
 * Who sits the exam in these batches: members on its first day — joined by then and either still active
 * with the student Active (so On Hold is left off), or with a membership that ended after that day.
 */
export async function examSitters(db: DbOrTx, tenantId: string, batchIds: string[], startsOn: string) {
  if (!batchIds.length) return [];
  return db
    .select({
      studentId: students.id, studentCode: students.studentCode, fullName: students.fullName, rollNumber: batchMemberships.rollNumber,
      batchId: batches.id, batchName: batches.name,
    })
    .from(batchMemberships)
    .innerJoin(students, and(eq(students.tenantId, batchMemberships.tenantId), eq(students.id, batchMemberships.studentId)))
    .innerJoin(batches, and(eq(batches.tenantId, batchMemberships.tenantId), eq(batches.id, batchMemberships.batchId)))
    .where(
      and(
        eq(batchMemberships.tenantId, tenantId),
        inArray(batchMemberships.batchId, batchIds),
        lte(batchMemberships.startedOn, startsOn),
        or(and(eq(batchMemberships.status, "ACTIVE"), eq(students.status, "ACTIVE")), gt(batchMemberships.endedOn, startsOn)),
      ),
    );
}

export interface MarkView {
  absent: boolean;
  obtained: string | null;
  parts: Record<string, string>;
}

async function marksOf(db: DbOrTx, tenantId: string, paperId: string) {
  const rows = await db.select().from(examMarks).where(and(eq(examMarks.tenantId, tenantId), eq(examMarks.paperId, paperId)));
  const partRows = rows.length
    ? await db.select().from(examMarkParts).where(and(eq(examMarkParts.tenantId, tenantId), inArray(examMarkParts.markId, rows.map((r) => r.id))))
    : [];
  return new Map(
    rows.map((r) => [
      r.studentId,
      { id: r.id, absent: r.absent, obtained: r.obtained, parts: Object.fromEntries(partRows.filter((p) => p.markId === r.id).map((p) => [p.partId, p.obtained])) } as MarkView & { id: string },
    ]),
  );
}

/** Whether this viewer may enter or change marks in this paper now, and whether a reason is needed. */
function editRule(viewer: Viewer, examState: "DRAFT" | "PUBLISHED") {
  if (!viewer.permissions.has("exams.marks.enter") && !viewer.permissions.has("exams.publish")) return { allowed: false, reasonRequired: false, why: "You can view these marks but not change them." };
  if (examState === "DRAFT") {
    return viewer.permissions.has("exams.marks.enter") ? { allowed: true, reasonRequired: false, why: null } : { allowed: false, reasonRequired: false, why: "You can view these marks but not change them." };
  }
  return viewer.permissions.has("exams.publish")
    ? { allowed: true, reasonRequired: true, why: null }
    : { allowed: false, reasonRequired: false, why: "The results are published. Ask an Owner or Admin to correct a mark." };
}

/** A paper's roster with each student's mark, scoped to the viewer. */
export async function getRoster(db: DbOrTx, viewer: Viewer, paperId: string) {
  const paper = await paperWithExam(db, viewer.tenantId, paperId);
  const scope = await paperBatchScope(db, viewer, paper.examId, paper.subjectId);
  if (!scope.length) throw new NotFoundError("EXAM_PAPER");
  const sitters = await examSitters(db, viewer.tenantId, scope, paper.startsOn);
  const marks = await marksOf(db, viewer.tenantId, paperId);
  // Students with marks stay on the roster even if they've left since (their marks count).
  const missing = [...marks.keys()].filter((id) => !sitters.some((s) => s.studentId === id));
  const extra = missing.length
    ? await db
        .select({ studentId: students.id, studentCode: students.studentCode, fullName: students.fullName, rollNumber: batchMemberships.rollNumber, batchId: batches.id, batchName: batches.name })
        .from(batchMemberships)
        .innerJoin(students, and(eq(students.tenantId, batchMemberships.tenantId), eq(students.id, batchMemberships.studentId)))
        .innerJoin(batches, and(eq(batches.tenantId, batchMemberships.tenantId), eq(batches.id, batchMemberships.batchId)))
        .where(and(eq(batchMemberships.tenantId, viewer.tenantId), inArray(batchMemberships.studentId, missing), inArray(batchMemberships.batchId, scope)))
    : [];
  const seen = new Set<string>();
  const rows = [...sitters, ...extra]
    .filter((r) => (seen.has(r.studentId) ? false : (seen.add(r.studentId), true)))
    .map((r) => {
      const m = marks.get(r.studentId);
      return { ...r, mark: m ? { absent: m.absent, obtained: m.obtained, parts: m.parts } : null };
    })
    .sort((a, b) => a.batchName.localeCompare(b.batchName) || Number(a.rollNumber === null) - Number(b.rollNumber === null) || (a.rollNumber ?? "").localeCompare(b.rollNumber ?? "", undefined, { numeric: true }) || a.fullName.localeCompare(b.fullName));
  const rule = editRule(viewer, paper.examState);
  return { paper, canEdit: rule.allowed, reasonRequired: rule.reasonRequired, whyNot: rule.why, rows };
}

export interface MarkEntry {
  studentId: string;
  /** Clears the student's mark (draft only). */
  clear?: boolean;
  absent?: boolean;
  /** For a paper without parts. */
  obtained?: string | null;
  /** For a paper with parts: some or all of them. */
  parts?: { partId: string; obtained: string }[];
}

function cleanMark(value: string, full: string, field: string, label: string): string {
  const text = String(value ?? "").trim();
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(text)) throw new ValidationError("VALIDATION_MARKS", `${label}: enter a number with at most two decimals.`, { field });
  if (hundredths(Number(text)) > hundredths(Number(full))) throw new ValidationError("VALIDATION_MARKS_ABOVE_FULL", `${label} can't be more than ${Number(full)}.`, { field });
  return Number(text).toFixed(2);
}

/** A mark as one comparable value: null, "ABSENT", the paper mark, or the part marks in a fixed order. */
const describe = (m: MarkView | null) =>
  m === null ? null : m.absent ? "ABSENT" : (m.obtained ?? Object.fromEntries(Object.entries(m.parts).sort(([a], [b]) => a.localeCompare(b))));

/**
 * Saves marks for some students of a paper. Draft: entered and changed freely (audited per save). Published: only
 * with exams.publish and a reason, each change audited with its old and new value.
 */
export async function saveMarks(db: DbOrTx, viewer: Viewer, paperId: string, input: { entries: MarkEntry[]; reason?: string | null }) {
  if (!input.entries.length) throw new ValidationError("VALIDATION_NO_MARKS", "Enter at least one mark.", { field: "entries" });
  if (input.entries.length > 1000) throw new ValidationError("VALIDATION_TOO_MANY", "Save at most 1000 marks at a time.", { field: "entries" });
  const reason = input.reason?.trim() || null;
  if (reason && reason.length > 300) throw new ValidationError("VALIDATION_TEXT", "The reason can be at most 300 characters.", { field: "reason" });

  return inTransaction(db, async (tx) => {
    await tx.execute(sql`select id from exam_papers where tenant_id = ${viewer.tenantId} and id = ${paperId} for update`);
    const roster = await getRoster(tx, viewer, paperId);
    const { paper } = roster;
    if (!roster.canEdit) {
      if (paper.examState === "PUBLISHED" && viewer.permissions.has("exams.marks.enter")) throw new ConflictError("CONFLICT_EXAM_PUBLISHED", roster.whyNot!);
      throw new ForbiddenError();
    }
    if (roster.reasonRequired && !reason) throw new ValidationError("VALIDATION_REASON_REQUIRED", "Give a reason for correcting a published mark.", { field: "reason" });
    const onRoster = new Map(roster.rows.map((r) => [r.studentId, r]));
    const partsById = new Map(paper.parts.map((p) => [p.id, p]));
    const changes: { studentId: string; studentCode: string; from: unknown; to: unknown }[] = [];
    const seen = new Set<string>();

    for (const [i, e] of input.entries.entries()) {
      const field = `entries.${i}`;
      const row = onRoster.get(e.studentId);
      if (!row) throw new ValidationError("VALIDATION_NOT_ON_ROSTER", "A student in these marks doesn't sit this paper.", { field, studentId: e.studentId });
      if (seen.has(e.studentId)) throw new ValidationError("VALIDATION_DUPLICATE_STUDENT", "A student appears twice.", { field });
      seen.add(e.studentId);
      const before = row.mark;

      if (e.clear) {
        if (paper.examState === "PUBLISHED") throw new ConflictError("CONFLICT_EXAM_PUBLISHED", "A published mark can be corrected but not cleared.");
        if (!before) continue;
        await tx.delete(examMarks).where(and(eq(examMarks.tenantId, viewer.tenantId), eq(examMarks.paperId, paperId), eq(examMarks.studentId, e.studentId)));
        changes.push({ studentId: e.studentId, studentCode: row.studentCode, from: describe(before), to: null });
        continue;
      }

      let after: MarkView;
      if (e.absent) {
        if (e.obtained || e.parts?.length) throw new ValidationError("VALIDATION_ABSENT_WITH_MARKS", "A student marked Absent can't have marks too.", { field });
        after = { absent: true, obtained: null, parts: {} };
      } else if (paper.parts.length) {
        if (!e.parts?.length) throw new ValidationError("VALIDATION_MARKS", "Enter the part marks, or Absent.", { field });
        const parts: Record<string, string> = {};
        for (const p of e.parts) {
          const part = partsById.get(p.partId);
          if (!part) throw new ValidationError("VALIDATION_PART", "Unknown part.", { field });
          parts[p.partId] = cleanMark(p.obtained, part.fullMarks, `${field}.parts`, `${row.fullName}'s ${part.name} mark`);
        }
        after = { absent: false, obtained: null, parts };
      } else {
        if (e.obtained == null || String(e.obtained).trim() === "") throw new ValidationError("VALIDATION_MARKS", "Enter the mark, or Absent.", { field });
        after = { absent: false, obtained: cleanMark(e.obtained, paper.fullMarks, `${field}.obtained`, `${row.fullName}'s mark`), parts: {} };
      }
      if (JSON.stringify(describe(before)) === JSON.stringify(describe(after))) continue;

      const [mark] = await tx
        .insert(examMarks)
        .values({ tenantId: viewer.tenantId, paperId, studentId: e.studentId, absent: after.absent, obtained: after.obtained, enteredBy: viewer.userId })
        .onConflictDoUpdate({
          target: [examMarks.tenantId, examMarks.paperId, examMarks.studentId],
          set: { absent: after.absent, obtained: after.obtained, enteredBy: viewer.userId, enteredAt: new Date() },
        })
        .returning({ id: examMarks.id });
      await tx.delete(examMarkParts).where(and(eq(examMarkParts.tenantId, viewer.tenantId), eq(examMarkParts.markId, mark.id)));
      const partValues = Object.entries(after.parts).map(([partId, obtained]) => ({ tenantId: viewer.tenantId, markId: mark.id, partId, obtained }));
      if (partValues.length) await tx.insert(examMarkParts).values(partValues);
      changes.push({ studentId: e.studentId, studentCode: row.studentCode, from: describe(before), to: describe(after) });
    }

    if (changes.length) {
      const published = paper.examState === "PUBLISHED";
      await audit.record(tx, {
        tenantId: viewer.tenantId, actorType: "TENANT_USER", userId: viewer.userId, action: published ? "EXAM_MARKS_CORRECTED" : "EXAM_MARKS_ENTERED", resourceType: "EXAM_PAPER", resourceId: paperId,
        oldValue: published ? { marks: changes.map((c) => ({ studentId: c.studentId, studentCode: c.studentCode, mark: c.from })) } : null,
        newValue: { exam: paper.examName, subject: paper.subjectName, count: changes.length, reason, marks: published ? changes.map((c) => ({ studentId: c.studentId, studentCode: c.studentCode, mark: c.to })) : undefined },
      });
    }
    return { saved: changes.length, ...(await getRoster(tx, viewer, paperId)) };
  });
}
