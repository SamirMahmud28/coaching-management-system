import { and, eq } from "drizzle-orm";
import { batches, courses } from "../../core/db/schema";
import type { DocumentTypeDefinition } from "../../core/documents/types";
import { isUuid } from "../../core/db/tenant-scope";
import { ValidationError } from "../../core/errors";
import { cleanRange, collectionReport, duesReport, refundsReport, type DateRange } from "./reports";

export type FeeReportKind = "collections" | "dues" | "former-dues" | "refunds";

interface Selection {
  report: FeeReportKind;
  range: DateRange | null;
  courseId?: string;
  batchId?: string;
}

/** A printed fee report: which report, for which filters, and its data as the screen showed it. */
export interface FeeReportRecord {
  report: FeeReportKind;
  title: string;
  /** "1 Oct 2026 – 12 Oct 2026 · HSC 2026 Science · Morning" */
  filters: { range: DateRange | null; course: string | null; batch: string | null };
  data: Awaited<ReturnType<typeof collectionReport>> | Awaited<ReturnType<typeof duesReport>> | Awaited<ReturnType<typeof refundsReport>>;
}

const TITLES: Record<FeeReportKind, string> = {
  collections: "Fee collection",
  dues: "Fee dues — current students",
  "former-dues": "Fee dues — former students",
  refunds: "Fee refunds",
};

/** The fee reports on A4, with the same filters as the screen. Needs fees.report.view. */
export const feeReportDocument: DocumentTypeDefinition<FeeReportRecord, Selection> = {
  key: "fee-report",
  label: "Fee report",
  module: "fees",
  permission: "fees.report.view",
  format: { kind: "a4-flow" },
  parseSelection: (query) => {
    const report = query.report as FeeReportKind;
    if (!Object.hasOwn(TITLES, report)) throw new ValidationError("VALIDATION_SELECTION", "Choose a report to print.");
    for (const key of ["course_id", "batch_id"]) if (query[key] && !isUuid(query[key])) throw new ValidationError("VALIDATION_SELECTION", "Unknown course or batch.");
    const dated = report === "collections" || report === "refunds";
    return { report, range: dated ? cleanRange(query.from, query.to) : null, courseId: query.course_id || undefined, batchId: query.batch_id || undefined };
  },
  describeSelection: (s) => ({ report: s.report, range: s.range, courseId: s.courseId ?? null, batchId: s.batchId ?? null }),
  load: async (db, { tenantId, selection, permissions }) => {
    const filter = { courseId: selection.courseId, batchId: selection.batchId };
    const data =
      selection.report === "collections"
        ? await collectionReport(db, tenantId, selection.range!, filter)
        : selection.report === "refunds"
          ? await refundsReport(db, tenantId, selection.range!, filter)
          : await duesReport(db, tenantId, { ...filter, former: selection.report === "former-dues", withContacts: permissions.has("students.contact.view") });
    const [course] = selection.courseId ? await db.select({ name: courses.name }).from(courses).where(and(eq(courses.tenantId, tenantId), eq(courses.id, selection.courseId))) : [];
    const [batch] = selection.batchId
      ? await db.select({ name: batches.name, course: courses.name }).from(batches).innerJoin(courses, and(eq(courses.tenantId, batches.tenantId), eq(courses.id, batches.courseId))).where(and(eq(batches.tenantId, tenantId), eq(batches.id, selection.batchId)))
      : [];
    return {
      records: [
        {
          id: selection.report,
          data: {
            report: selection.report,
            title: TITLES[selection.report],
            filters: { range: selection.range, course: course?.name ?? batch?.course ?? null, batch: batch?.name ?? null },
            data,
          },
        },
      ],
    };
  },
};
