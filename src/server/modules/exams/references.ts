import { and, eq, sql } from "drizzle-orm";
import { examBatches, examPapers, exams } from "../../core/db/schema";
import { academicReferences } from "../academic/references";

// A course, subject or batch used by an exam can't be deleted (its results stay, D5); archive it instead. Imported by
// the academic composition root (academic/instance.ts) and by the exam services, so the guard is always registered.
academicReferences.register("COURSE", "EXAM", async (db, tenantId, courseId) => {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(exams).where(and(eq(exams.tenantId, tenantId), eq(exams.courseId, courseId)));
  return row.count;
});
academicReferences.register("SUBJECT", "EXAM_PAPER", async (db, tenantId, subjectId) => {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(examPapers).where(and(eq(examPapers.tenantId, tenantId), eq(examPapers.subjectId, subjectId)));
  return row.count;
});
academicReferences.register("BATCH", "EXAM", async (db, tenantId, batchId) => {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(examBatches).where(and(eq(examBatches.tenantId, tenantId), eq(examBatches.batchId, batchId)));
  return row.count;
});
