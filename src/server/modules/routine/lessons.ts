import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { batchSubjectInstructors, batchSubjects, batches, courses, instructors, lessonTopics, subjects } from "../../core/db/schema";
import { inTransaction } from "../../core/db/transaction";
import type { DbOrTx } from "../../core/db/types";
import { ForbiddenError, NotFoundError, ValidationError } from "../../core/errors";
import { isCalendarDate, todayInDhaka } from "@/lib/dates";
import { seesAllRoutine, type Viewer } from "./service";
import "./references";

// Lesson plans (D118–D120): a list of topics per batch subject, with start and target dates and a status set by hand;
// Overdue is derived. The subject's instructor(s) and the office edit; everyone with the routine sees progress.

export type TopicStatus = "PENDING" | "ONGOING" | "COMPLETED";
const STATUSES: readonly TopicStatus[] = ["PENDING", "ONGOING", "COMPLETED"];
const MAX_TOPICS = 200;

/**
 * Batch subjects (of active batches) the viewer can see lesson plans for: all for the office; for an instructor, the
 * subjects of the batches they teach in (D24). `editable` marks the ones they may change: theirs to teach (D120).
 */
async function scope(db: DbOrTx, viewer: Viewer, onlyIds?: string[]) {
  const all = seesAllRoutine(viewer);
  const rows = await db
    .select({ id: batchSubjects.id, batchId: batches.id, batchName: batches.name, courseName: courses.name, subjectId: subjects.id, subjectName: subjects.name })
    .from(batchSubjects)
    .innerJoin(batches, and(eq(batches.tenantId, batchSubjects.tenantId), eq(batches.id, batchSubjects.batchId)))
    .innerJoin(courses, and(eq(courses.tenantId, batches.tenantId), eq(courses.id, batches.courseId)))
    .innerJoin(subjects, and(eq(subjects.tenantId, batchSubjects.tenantId), eq(subjects.id, batchSubjects.subjectId)))
    .where(and(eq(batchSubjects.tenantId, viewer.tenantId), eq(batches.status, "ACTIVE"), onlyIds ? inArray(batchSubjects.id, onlyIds) : undefined))
    .orderBy(asc(courses.name), asc(batches.name), asc(subjects.name));
  const taught = await db
    .select({ batchSubjectId: batchSubjectInstructors.batchSubjectId, batchId: batchSubjects.batchId })
    .from(batchSubjectInstructors)
    .innerJoin(instructors, and(eq(instructors.tenantId, batchSubjectInstructors.tenantId), eq(instructors.id, batchSubjectInstructors.instructorId)))
    .innerJoin(batchSubjects, and(eq(batchSubjects.tenantId, batchSubjectInstructors.tenantId), eq(batchSubjects.id, batchSubjectInstructors.batchSubjectId)))
    .where(and(eq(batchSubjectInstructors.tenantId, viewer.tenantId), eq(instructors.userId, viewer.userId)));
  const myBatches = new Set(taught.map((t) => t.batchId));
  const mySubjects = new Set(taught.map((t) => t.batchSubjectId));
  const canEdit = viewer.permissions.has("lessons.manage");
  return rows
    .filter((r) => all || myBatches.has(r.batchId))
    .map((r) => ({ ...r, editable: canEdit && (all || mySubjects.has(r.id)) }));
}

async function inScope(db: DbOrTx, viewer: Viewer, batchSubjectId: string, edit: boolean) {
  const [bs] = await scope(db, viewer, [batchSubjectId]);
  if (!bs) throw new NotFoundError("BATCH_SUBJECT");
  if (edit && !bs.editable) throw new ForbiddenError();
  return bs;
}

const overdue = (t: { status: TopicStatus; targetDate: string | null }, today: string) => t.status !== "COMPLETED" && !!t.targetDate && t.targetDate < today;

export function summarise(topics: { status: TopicStatus; targetDate: string | null }[], today = todayInDhaka()) {
  const completed = topics.filter((t) => t.status === "COMPLETED").length;
  return {
    total: topics.length,
    completed,
    ongoing: topics.filter((t) => t.status === "ONGOING").length,
    overdue: topics.filter((t) => overdue(t, today)).length,
    percent: topics.length ? Math.round((completed * 100) / topics.length) : null,
  };
}

async function topicsOf(db: DbOrTx, tenantId: string, batchSubjectIds: string[]) {
  if (!batchSubjectIds.length) return [];
  return db
    .select()
    .from(lessonTopics)
    .where(and(eq(lessonTopics.tenantId, tenantId), inArray(lessonTopics.batchSubjectId, batchSubjectIds)))
    .orderBy(asc(lessonTopics.position), asc(lessonTopics.createdAt));
}

/** The subjects of these batches (for a student's own batches, D27), unscoped. */
export async function lessonOverviewFor(db: DbOrTx, tenantId: string, batchIds: string[]) {
  // An office-wide view (no user teaches anything as the nil id).
  const office = { tenantId, userId: "00000000-0000-0000-0000-000000000000", permissions: new Set(["academic.view"]) };
  return (await scope(db, office)).filter((s) => batchIds.includes(s.batchId));
}

/** Every batch subject the viewer can see, with its plan's progress (D27). */
export async function lessonOverview(db: DbOrTx, viewer: Viewer) {
  const subjectsInScope = await scope(db, viewer);
  const topics = await topicsOf(db, viewer.tenantId, subjectsInScope.map((s) => s.id));
  const today = todayInDhaka();
  return subjectsInScope.map((s) => ({ ...s, progress: summarise(topics.filter((t) => t.batchSubjectId === s.id), today) }));
}

/** One batch subject's plan: its topics in order, each with Overdue (D119), and the progress. */
export async function lessonPlan(db: DbOrTx, viewer: Viewer, batchSubjectId: string) {
  const bs = await inScope(db, viewer, batchSubjectId, false);
  const today = todayInDhaka();
  const topics = await topicsOf(db, viewer.tenantId, [bs.id]);
  // Other batches of the same subject the office can copy a plan from (D118).
  const sources = bs.editable && viewer.permissions.has("routine.manage") ? (await scope(db, viewer)).filter((s) => s.subjectId === bs.subjectId && s.id !== bs.id) : [];
  return {
    ...bs,
    topics: topics.map((t) => ({ id: t.id, title: t.title, startDate: t.startDate, targetDate: t.targetDate, status: t.status, completedOn: t.completedOn, overdue: overdue(t, today) })),
    progress: summarise(topics, today),
    copySources: sources.map(({ id, batchName, courseName }) => ({ id, batchName, courseName })),
  };
}

function cleanTopic(input: { title?: string; startDate?: string | null; targetDate?: string | null }, partial: boolean) {
  const out: { title?: string; startDate?: string | null; targetDate?: string | null } = {};
  if (!partial || input.title !== undefined) {
    const title = input.title?.trim() ?? "";
    if (!title) throw new ValidationError("VALIDATION_REQUIRED", "Give the chapter or topic.", { field: "title" });
    if (title.length > 200) throw new ValidationError("VALIDATION_TEXT", "Keep it to 200 characters.", { field: "title" });
    out.title = title;
  }
  for (const key of ["startDate", "targetDate"] as const) {
    if (partial && input[key] === undefined) continue;
    const v = input[key]?.trim() || null;
    if (v && !isCalendarDate(v)) throw new ValidationError("VALIDATION_DATE", "Enter a valid date.", { field: key });
    out[key] = v;
  }
  return out;
}

function checkDates(startDate: string | null | undefined, targetDate: string | null | undefined) {
  if (startDate && targetDate && targetDate < startDate) throw new ValidationError("VALIDATION_DATE_ORDER", "The target date can't be before the start date.", { field: "targetDate" });
}

export async function addTopic(db: DbOrTx, viewer: Viewer, batchSubjectId: string, input: { title: string; startDate?: string | null; targetDate?: string | null }) {
  const clean = cleanTopic(input, false);
  checkDates(clean.startDate, clean.targetDate);
  return inTransaction(db, async (tx) => {
    const bs = await inScope(tx, viewer, batchSubjectId, true);
    const [{ count, max }] = await tx
      .select({ count: sql<number>`count(*)::int`, max: sql<number>`coalesce(max(${lessonTopics.position}), -1)::int` })
      .from(lessonTopics)
      .where(and(eq(lessonTopics.tenantId, viewer.tenantId), eq(lessonTopics.batchSubjectId, bs.id)));
    if (count >= MAX_TOPICS) throw new ValidationError("VALIDATION_TOO_MANY", `A plan can have at most ${MAX_TOPICS} topics.`);
    const [row] = await tx
      .insert(lessonTopics)
      .values({ tenantId: viewer.tenantId, batchSubjectId: bs.id, title: clean.title!, startDate: clean.startDate ?? null, targetDate: clean.targetDate ?? null, position: max + 1, createdBy: viewer.userId, updatedBy: viewer.userId })
      .returning();
    return row;
  });
}

async function topicInScope(tx: DbOrTx, viewer: Viewer, topicId: string) {
  const [topic] = await tx.select().from(lessonTopics).where(and(eq(lessonTopics.tenantId, viewer.tenantId), eq(lessonTopics.id, topicId)));
  if (!topic) throw new NotFoundError("LESSON_TOPIC");
  await inScope(tx, viewer, topic.batchSubjectId, true);
  return topic;
}

/** Edits a topic or sets its status (D119): Completed records today (or the given date); leaving Completed clears it. */
export async function updateTopic(db: DbOrTx, viewer: Viewer, topicId: string, input: { title?: string; startDate?: string | null; targetDate?: string | null; status?: TopicStatus; completedOn?: string | null }) {
  const clean = cleanTopic(input, true);
  if (input.status !== undefined && !STATUSES.includes(input.status)) throw new ValidationError("VALIDATION_STATUS", "Choose Pending, Ongoing or Completed.", { field: "status" });
  return inTransaction(db, async (tx) => {
    const topic = await topicInScope(tx, viewer, topicId);
    const startDate = clean.startDate !== undefined ? clean.startDate : topic.startDate;
    const targetDate = clean.targetDate !== undefined ? clean.targetDate : topic.targetDate;
    checkDates(startDate, targetDate);
    const status = input.status ?? topic.status;
    let completedOn = topic.completedOn;
    if (status !== "COMPLETED") completedOn = null;
    else if (input.completedOn) {
      if (!isCalendarDate(input.completedOn) || input.completedOn > todayInDhaka()) throw new ValidationError("VALIDATION_DATE", "The completed date can't be in the future.", { field: "completedOn" });
      completedOn = input.completedOn;
    } else if (!completedOn) completedOn = todayInDhaka();
    const [row] = await tx
      .update(lessonTopics)
      .set({ ...clean, status, completedOn, updatedAt: new Date(), updatedBy: viewer.userId })
      .where(and(eq(lessonTopics.tenantId, viewer.tenantId), eq(lessonTopics.id, topicId)))
      .returning();
    return row;
  });
}

export async function deleteTopic(db: DbOrTx, viewer: Viewer, topicId: string) {
  return inTransaction(db, async (tx) => {
    await topicInScope(tx, viewer, topicId);
    await tx.delete(lessonTopics).where(and(eq(lessonTopics.tenantId, viewer.tenantId), eq(lessonTopics.id, topicId)));
  });
}

/** Puts a plan's topics in the given order (every topic, once). */
export async function reorderTopics(db: DbOrTx, viewer: Viewer, batchSubjectId: string, topicIds: string[]) {
  return inTransaction(db, async (tx) => {
    const bs = await inScope(tx, viewer, batchSubjectId, true);
    const current = await topicsOf(tx, viewer.tenantId, [bs.id]);
    if (topicIds.length !== current.length || new Set(topicIds).size !== current.length || !current.every((t) => topicIds.includes(t.id))) {
      throw new ValidationError("VALIDATION_ORDER", "List every topic of the plan once.", { field: "topicIds" });
    }
    for (const [i, id] of topicIds.entries()) await tx.update(lessonTopics).set({ position: i }).where(and(eq(lessonTopics.tenantId, viewer.tenantId), eq(lessonTopics.id, id)));
  });
}

/** The office copies another batch's plan of the same subject (D118): titles only, all Pending, no dates; appended. */
export async function copyPlan(db: DbOrTx, viewer: Viewer, batchSubjectId: string, fromBatchSubjectId: string) {
  if (!viewer.permissions.has("routine.manage")) throw new ForbiddenError();
  return inTransaction(db, async (tx) => {
    const target = await inScope(tx, viewer, batchSubjectId, true);
    const source = await inScope(tx, viewer, fromBatchSubjectId, false);
    if (source.subjectId !== target.subjectId || source.id === target.id) throw new ValidationError("VALIDATION_COPY_SOURCE", "Copy from another batch of the same subject.", { field: "fromBatchSubjectId" });
    const from = await topicsOf(tx, viewer.tenantId, [source.id]);
    if (!from.length) throw new ValidationError("VALIDATION_COPY_SOURCE", "That plan has no topics yet.", { field: "fromBatchSubjectId" });
    const existing = await topicsOf(tx, viewer.tenantId, [target.id]);
    if (existing.length + from.length > MAX_TOPICS) throw new ValidationError("VALIDATION_TOO_MANY", `A plan can have at most ${MAX_TOPICS} topics.`);
    const start = existing.length ? Math.max(...existing.map((t) => t.position)) + 1 : 0;
    await tx.insert(lessonTopics).values(from.map((t, i) => ({ tenantId: viewer.tenantId, batchSubjectId: target.id, title: t.title, position: start + i, createdBy: viewer.userId, updatedBy: viewer.userId })));
    return { copied: from.length };
  });
}
