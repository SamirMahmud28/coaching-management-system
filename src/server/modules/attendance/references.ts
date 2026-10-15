import { and, eq, sql } from "drizzle-orm";
import { attendanceClasses } from "../../core/db/schema";
import { academicReferences } from "../academic/references";

// A batch subject with registers can't be removed from its batch (its attendance history stays). Imported by the
// academic composition root (academic/instance.ts) and by the attendance services, so the guard is always registered.
academicReferences.register("BATCH_SUBJECT", "ATTENDANCE_CLASS", async (db, tenantId, batchSubjectId) => {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(attendanceClasses)
    .where(and(eq(attendanceClasses.tenantId, tenantId), eq(attendanceClasses.batchSubjectId, batchSubjectId)));
  return row.count;
});
