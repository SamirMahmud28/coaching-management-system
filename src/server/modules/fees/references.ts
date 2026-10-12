import { and, eq, sql } from "drizzle-orm";
import { feeItems } from "../../core/db/schema";
import { academicReferences } from "../academic/references";

// A course with fee items can't be deleted (archive it instead, D50). Imported by the academic composition root
// (academic/instance.ts) and by the fees services, so the guard is always registered.
academicReferences.register("COURSE", "FEE_ITEM", async (db, tenantId, courseId) => {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(feeItems)
    .where(and(eq(feeItems.tenantId, tenantId), eq(feeItems.courseId, courseId)));
  return row.count;
});
