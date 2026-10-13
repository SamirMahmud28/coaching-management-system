import type { DocumentTypeDefinition } from "../../core/documents/types";
import { isUuid } from "../../core/db/tenant-scope";
import { ValidationError } from "../../core/errors";
import { calculateResults, getResults, type ResultRow } from "./results";
import { seesAllExams, taughtBatchIds } from "./setup";

interface Selection {
  examId: string;
  studentId?: string;
  batchId?: string;
}

function parse(query: Record<string, string>): Selection {
  if (!query.exam || !isUuid(query.exam)) throw new ValidationError("VALIDATION_SELECTION", "Choose an exam.");
  for (const key of ["student", "batch"]) if (query[key] && !isUuid(query[key])) throw new ValidationError("VALIDATION_SELECTION", "Unknown student or batch.");
  return { examId: query.exam, studentId: query.student || undefined, batchId: query.batch || undefined };
}

export interface MarksheetRecord {
  exam: Awaited<ReturnType<typeof calculateResults>>["exam"];
  papers: Awaited<ReturnType<typeof calculateResults>>["papers"];
  sitting: number;
  row: ResultRow;
}

/**
 * A student's marksheet (one A4 page each), for a published exam only (D27, D110). Staff print one student, a batch or
 * everyone they may see (D24); a student prints only their own (selfPermission).
 */
export const examMarksheetDocument: DocumentTypeDefinition<MarksheetRecord, Selection> = {
  key: "exam-marksheet",
  label: "Marksheet",
  module: "exams",
  permission: "exams.view",
  selfPermission: "exams.self.view",
  format: { kind: "a4", perPage: 1 },
  parseSelection: (query) => parse(query),
  describeSelection: (s) => ({ examId: s.examId, studentId: s.studentId ?? null, batchId: s.batchId ?? null }),
  load: async (db, { tenantId, scope, selection, limit, permissions, userId }) => {
    const calc = await calculateResults(db, tenantId, selection.examId);
    if (calc.exam.state !== "PUBLISHED") throw new ValidationError("VALIDATION_NOT_PUBLISHED", "Marksheets print once the results are published.");
    let rows = calc.results;
    if (scope.kind === "self") rows = rows.filter((r) => r.userId === scope.userId);
    else if (!seesAllExams({ tenantId, userId, permissions })) {
      const taught = new Set(await taughtBatchIds(db, tenantId, userId));
      rows = rows.filter((r) => taught.has(r.batchId));
    }
    if (selection.studentId) rows = rows.filter((r) => r.studentId === selection.studentId);
    if (selection.batchId) rows = rows.filter((r) => r.batchId === selection.batchId);
    rows = [...rows].sort((a, b) => a.batchName.localeCompare(b.batchName) || (a.rollNumber ?? "").localeCompare(b.rollNumber ?? "", undefined, { numeric: true }) || a.fullName.localeCompare(b.fullName));
    return { records: rows.slice(0, limit).map((row) => ({ id: row.studentId, data: { exam: calc.exam, papers: calc.papers, sitting: calc.results.length, row } })) };
  },
};

export type MeritListRecord = Awaited<ReturnType<typeof getResults>>;

/** The merit list on A4 (D103, D109), as the results screen shows it — a draft prints marked as such. */
export const examMeritListDocument: DocumentTypeDefinition<MeritListRecord, Selection> = {
  key: "exam-merit-list",
  label: "Merit list",
  module: "exams",
  permission: "exams.view",
  format: { kind: "a4-flow" },
  parseSelection: (query) => parse(query),
  describeSelection: (s) => ({ examId: s.examId, batchId: s.batchId ?? null }),
  load: async (db, { tenantId, selection, permissions, userId }) => {
    const data = await getResults(db, { tenantId, userId, permissions }, selection.examId, { batchId: selection.batchId });
    return { records: [{ id: selection.examId, data }] };
  },
};
