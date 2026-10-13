import { and, eq, sql } from "drizzle-orm";
import { lessonTopics, routineChanges } from "../../core/db/schema";
import { academicReferences } from "../academic/references";

// A batch subject with schedule changes or a lesson plan can't be removed from its batch (their history stays, D5).
// Imported by the academic composition root (academic/instance.ts) and by the routine services.
academicReferences.register("BATCH_SUBJECT", "ROUTINE_CHANGE", async (db, tenantId, batchSubjectId) => {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(routineChanges).where(and(eq(routineChanges.tenantId, tenantId), eq(routineChanges.batchSubjectId, batchSubjectId)));
  return row.count;
});
academicReferences.register("BATCH_SUBJECT", "LESSON_TOPIC", async (db, tenantId, batchSubjectId) => {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(lessonTopics).where(and(eq(lessonTopics.tenantId, tenantId), eq(lessonTopics.batchSubjectId, batchSubjectId)));
  return row.count;
});
