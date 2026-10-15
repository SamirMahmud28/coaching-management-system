import { and, eq, sql } from "drizzle-orm";
import { batchMemberships, students } from "../../core/db/schema";
import { academicReferences } from "../academic/references";

// Students refer to courses (the admission course, whose code may be in their ID) and to batches (memberships), so
// neither can be deleted, nor a course's code changed, once students use them. Imported by the academic
// composition root (academic/instance.ts) and by the students service, so the guard is always registered.

academicReferences.register("COURSE", "STUDENT", async (db, tenantId, courseId) => {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(students)
    .where(and(eq(students.tenantId, tenantId), eq(students.admissionCourseId, courseId)));
  return row.count;
});

academicReferences.register("BATCH", "BATCH_MEMBERSHIP", async (db, tenantId, batchId) => {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(batchMemberships)
    .where(and(eq(batchMemberships.tenantId, tenantId), eq(batchMemberships.batchId, batchId)));
  return row.count;
});
