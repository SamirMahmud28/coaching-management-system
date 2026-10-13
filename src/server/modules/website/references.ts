import { and, eq, sql } from "drizzle-orm";
import { enquiries } from "../../core/db/schema";
import { academicReferences } from "../academic/references";

// A course named in an admission enquiry can't be deleted, so the inbox keeps what the visitor asked about (D5).
// Imported by the academic composition root (academic/instance.ts) and by the enquiry service.
academicReferences.register("COURSE", "ENQUIRY", async (db, tenantId, courseId) => {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(enquiries).where(and(eq(enquiries.tenantId, tenantId), eq(enquiries.courseId, courseId)));
  return row.count;
});
