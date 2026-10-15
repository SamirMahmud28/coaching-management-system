import { and, asc, eq, inArray, max, sql } from "drizzle-orm";
import { batchSubjectInstructors, batchSubjects, batches, instructors, subjects, websiteAchievers, websiteFaculty } from "../../core/db/schema";
import { inTransaction } from "../../core/db/transaction";
import type { DbOrTx } from "../../core/db/types";
import { ConflictError, NotFoundError, ValidationError } from "../../core/errors";
import { assertFileReference } from "../../core/files/service";
import type { Actor } from "./settings";

// The website's showcase lists: Faculty (instructors the office opts in) and Achievers (top results typed
// in by the office). Every save is public at once. Removing one deletes its website row only: the instructor and
// any picture file stay.

export const MAX_FACULTY = 40;
export const MAX_ACHIEVERS = 48;

function text(value: string | null | undefined, max: number, field: string, label: string, required = false): string | null {
  const v = value?.trim() ?? "";
  if (required && !v) throw new ValidationError("VALIDATION_REQUIRED", `${label} is required.`, { field });
  if (v.length > max) throw new ValidationError("VALIDATION_TEXT", `${label} can be at most ${max} characters.`, { field });
  return v === "" ? null : v;
}

function assertSameSet(ids: string[], existing: string[], field: string) {
  const same = ids.length === existing.length && new Set(ids).size === ids.length && ids.every((id) => existing.includes(id));
  if (!same) throw new ValidationError("VALIDATION_ORDER", "The list changed while you were ordering it. Reload and try again.", { field });
}

const lock = (tx: DbOrTx, list: string, tenantId: string) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${list}:${tenantId}`}))`);

// ---------------------------------------------------------------------------
// Faculty
// ---------------------------------------------------------------------------

/** The subjects each instructor teaches in active batches, by name, for the website. */
async function subjectsTaught(db: DbOrTx, tenantId: string, instructorIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!instructorIds.length) return out;
  const rows = await db
    .selectDistinct({ instructorId: batchSubjectInstructors.instructorId, name: subjects.name })
    .from(batchSubjectInstructors)
    .innerJoin(batchSubjects, and(eq(batchSubjects.tenantId, batchSubjectInstructors.tenantId), eq(batchSubjects.id, batchSubjectInstructors.batchSubjectId)))
    .innerJoin(batches, and(eq(batches.tenantId, batchSubjects.tenantId), eq(batches.id, batchSubjects.batchId)))
    .innerJoin(subjects, and(eq(subjects.tenantId, batchSubjects.tenantId), eq(subjects.id, batchSubjects.subjectId)))
    .where(and(eq(batchSubjectInstructors.tenantId, tenantId), inArray(batchSubjectInstructors.instructorId, instructorIds), eq(batches.status, "ACTIVE"), eq(subjects.status, "ACTIVE")))
    .orderBy(asc(subjects.name));
  for (const r of rows) out.set(r.instructorId, [...(out.get(r.instructorId) ?? []), r.name]);
  return out;
}

/** The office list: every instructor on the website, in order, with their status and subjects. */
export async function listFaculty(db: DbOrTx, tenantId: string) {
  const rows = await db
    .select({
      id: websiteFaculty.id, instructorId: websiteFaculty.instructorId, line: websiteFaculty.line, sortOrder: websiteFaculty.sortOrder,
      name: instructors.fullName, photoFileId: instructors.photoFileId, status: instructors.status,
    })
    .from(websiteFaculty)
    .innerJoin(instructors, and(eq(instructors.tenantId, websiteFaculty.tenantId), eq(instructors.id, websiteFaculty.instructorId)))
    .where(eq(websiteFaculty.tenantId, tenantId))
    .orderBy(asc(websiteFaculty.sortOrder), asc(websiteFaculty.createdAt));
  const taught = await subjectsTaught(db, tenantId, rows.map((r) => r.instructorId));
  return rows.map((r) => ({ ...r, subjects: taught.get(r.instructorId) ?? [] }));
}

/** What visitors see: active instructors only, with name, photo, subjects and line. Never contact details. */
export async function publicFaculty(db: DbOrTx, tenantId: string) {
  return (await listFaculty(db, tenantId))
    .filter((f) => f.status === "ACTIVE")
    .map((f) => ({ id: f.id, name: f.name, photoFileId: f.photoFileId, line: f.line, subjects: f.subjects }));
}

/** Active instructors not yet on the website, for the office's picker. */
export async function facultyCandidates(db: DbOrTx, tenantId: string) {
  const shown = db.select({ id: websiteFaculty.instructorId }).from(websiteFaculty).where(eq(websiteFaculty.tenantId, tenantId));
  return db
    .select({ id: instructors.id, name: instructors.fullName })
    .from(instructors)
    .where(and(eq(instructors.tenantId, tenantId), eq(instructors.status, "ACTIVE"), sql`${instructors.id} not in ${shown}`))
    .orderBy(asc(instructors.fullName));
}

async function getFacultyRow(db: DbOrTx, tenantId: string, id: string) {
  const [row] = await db.select().from(websiteFaculty).where(and(eq(websiteFaculty.tenantId, tenantId), eq(websiteFaculty.id, id)));
  if (!row) throw new NotFoundError("FACULTY");
  return row;
}

/** Puts an active instructor of this institute on the website, at the end; each instructor once. */
export async function addFaculty(db: DbOrTx, actor: Actor, input: { instructorId: string; line?: string | null }) {
  const line = text(input.line, 120, "line", "The line under the name");
  return inTransaction(db, async (tx) => {
    await lock(tx, "faculty", actor.tenantId);
    const [instructor] = await tx.select({ status: instructors.status }).from(instructors).where(and(eq(instructors.tenantId, actor.tenantId), eq(instructors.id, input.instructorId)));
    if (!instructor) throw new NotFoundError("INSTRUCTOR");
    if (instructor.status !== "ACTIVE") throw new ValidationError("VALIDATION_INSTRUCTOR_INACTIVE", "Only active instructors can be shown on the website.", { field: "instructorId" });
    const rows = await tx.select({ instructorId: websiteFaculty.instructorId }).from(websiteFaculty).where(eq(websiteFaculty.tenantId, actor.tenantId));
    if (rows.some((r) => r.instructorId === input.instructorId)) throw new ConflictError("CONFLICT_FACULTY_EXISTS", "This instructor is already on the website.");
    if (rows.length >= MAX_FACULTY) throw new ConflictError("CONFLICT_FACULTY_FULL", `The website shows at most ${MAX_FACULTY} instructors.`);
    const [{ last }] = await tx.select({ last: max(websiteFaculty.sortOrder) }).from(websiteFaculty).where(eq(websiteFaculty.tenantId, actor.tenantId));
    const [row] = await tx.insert(websiteFaculty).values({ tenantId: actor.tenantId, instructorId: input.instructorId, line, sortOrder: (last ?? 0) + 1, updatedBy: actor.userId }).returning();
    return row;
  });
}

export async function updateFaculty(db: DbOrTx, actor: Actor, id: string, input: { line?: string | null }) {
  const line = text(input.line, 120, "line", "The line under the name");
  await getFacultyRow(db, actor.tenantId, id);
  const [row] = await db.update(websiteFaculty).set({ line, updatedBy: actor.userId, updatedAt: new Date() }).where(and(eq(websiteFaculty.tenantId, actor.tenantId), eq(websiteFaculty.id, id))).returning();
  return row;
}

export async function removeFaculty(db: DbOrTx, actor: Actor, id: string) {
  await getFacultyRow(db, actor.tenantId, id);
  await db.delete(websiteFaculty).where(and(eq(websiteFaculty.tenantId, actor.tenantId), eq(websiteFaculty.id, id)));
}

export async function reorderFaculty(db: DbOrTx, actor: Actor, ids: string[]) {
  await inTransaction(db, async (tx) => {
    await lock(tx, "faculty", actor.tenantId);
    const rows = await tx.select({ id: websiteFaculty.id }).from(websiteFaculty).where(eq(websiteFaculty.tenantId, actor.tenantId));
    assertSameSet(ids, rows.map((r) => r.id), "facultyIds");
    for (const [i, id] of ids.entries()) await tx.update(websiteFaculty).set({ sortOrder: i + 1 }).where(and(eq(websiteFaculty.tenantId, actor.tenantId), eq(websiteFaculty.id, id)));
  });
}

// ---------------------------------------------------------------------------
// Achievers
// ---------------------------------------------------------------------------

export interface AchieverInput {
  name: string;
  result: string;
  exam?: string | null;
  photoFileId?: string | null;
}

function cleanAchiever(input: AchieverInput) {
  return {
    name: text(input.name, 100, "name", "The name", true)!,
    result: text(input.result, 80, "result", "The result", true)!,
    exam: text(input.exam, 40, "exam", "The exam"),
    photoFileId: input.photoFileId || null,
  };
}

export async function listAchievers(db: DbOrTx, tenantId: string) {
  return db
    .select({ id: websiteAchievers.id, name: websiteAchievers.name, result: websiteAchievers.result, exam: websiteAchievers.exam, photoFileId: websiteAchievers.photoFileId, sortOrder: websiteAchievers.sortOrder })
    .from(websiteAchievers)
    .where(eq(websiteAchievers.tenantId, tenantId))
    .orderBy(asc(websiteAchievers.sortOrder), asc(websiteAchievers.createdAt));
}

async function getAchiever(db: DbOrTx, tenantId: string, id: string) {
  const [row] = await db.select().from(websiteAchievers).where(and(eq(websiteAchievers.tenantId, tenantId), eq(websiteAchievers.id, id)));
  if (!row) throw new NotFoundError("ACHIEVER");
  return row;
}

export async function createAchiever(db: DbOrTx, actor: Actor, input: AchieverInput) {
  const values = cleanAchiever(input);
  return inTransaction(db, async (tx) => {
    await lock(tx, "achievers", actor.tenantId);
    if (values.photoFileId) await assertFileReference(tx, actor.tenantId, values.photoFileId, "WEBSITE_IMAGE", "photoFileId");
    const [{ count, last }] = await tx.select({ count: sql<number>`count(*)::int`, last: max(websiteAchievers.sortOrder) }).from(websiteAchievers).where(eq(websiteAchievers.tenantId, actor.tenantId));
    if (count >= MAX_ACHIEVERS) throw new ConflictError("CONFLICT_ACHIEVERS_FULL", `The website shows at most ${MAX_ACHIEVERS} achievers. Remove one to add another.`);
    const [row] = await tx.insert(websiteAchievers).values({ tenantId: actor.tenantId, ...values, sortOrder: (last ?? 0) + 1, updatedBy: actor.userId }).returning();
    return row;
  });
}

export async function updateAchiever(db: DbOrTx, actor: Actor, id: string, input: AchieverInput) {
  const values = cleanAchiever(input);
  return inTransaction(db, async (tx) => {
    await getAchiever(tx, actor.tenantId, id);
    if (values.photoFileId) await assertFileReference(tx, actor.tenantId, values.photoFileId, "WEBSITE_IMAGE", "photoFileId");
    const [row] = await tx.update(websiteAchievers).set({ ...values, updatedBy: actor.userId, updatedAt: new Date() }).where(and(eq(websiteAchievers.tenantId, actor.tenantId), eq(websiteAchievers.id, id))).returning();
    return row;
  });
}

export async function removeAchiever(db: DbOrTx, actor: Actor, id: string) {
  await getAchiever(db, actor.tenantId, id);
  await db.delete(websiteAchievers).where(and(eq(websiteAchievers.tenantId, actor.tenantId), eq(websiteAchievers.id, id)));
}

export async function reorderAchievers(db: DbOrTx, actor: Actor, ids: string[]) {
  await inTransaction(db, async (tx) => {
    await lock(tx, "achievers", actor.tenantId);
    assertSameSet(ids, (await listAchievers(tx, actor.tenantId)).map((a) => a.id), "achieverIds");
    for (const [i, id] of ids.entries()) await tx.update(websiteAchievers).set({ sortOrder: i + 1 }).where(and(eq(websiteAchievers.tenantId, actor.tenantId), eq(websiteAchievers.id, id)));
  });
}
