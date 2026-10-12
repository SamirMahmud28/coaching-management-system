import type { DocumentTypeDefinition } from "../../core/documents/types";
import { isUuid } from "../../core/db/tenant-scope";
import { ValidationError } from "../../core/errors";
import { monthRange, monthlyRegister } from "./reports";

interface Selection {
  batchId: string;
  month: string;
  batchSubjectId?: string;
}

export type AttendanceRegisterRecord = Awaited<ReturnType<typeof monthlyRegister>>;

/** The monthly batch register on A4 (D88), exactly as the report screen shows it. Needs attendance.report.view. */
export const attendanceRegisterDocument: DocumentTypeDefinition<AttendanceRegisterRecord, Selection> = {
  key: "attendance-register",
  label: "Attendance register",
  module: "attendance",
  permission: "attendance.report.view",
  format: { kind: "a4-flow" },
  parseSelection: (query) => {
    if (!query.batch_id || !isUuid(query.batch_id)) throw new ValidationError("VALIDATION_SELECTION", "Choose a batch.");
    if (query.batch_subject_id && !isUuid(query.batch_subject_id)) throw new ValidationError("VALIDATION_SELECTION", "Unknown subject.");
    return { batchId: query.batch_id, month: monthRange(query.month).month, batchSubjectId: query.batch_subject_id || undefined };
  },
  describeSelection: (s) => ({ batchId: s.batchId, month: s.month, batchSubjectId: s.batchSubjectId ?? null }),
  // Scoped like the screen: an instructor prints only the subjects they teach (D24).
  load: async (db, { tenantId, selection, permissions, userId }) => {
    const data = await monthlyRegister(db, { tenantId, userId, permissions }, selection);
    return { records: [{ id: `${selection.batchId}-${selection.month}`, data }] };
  },
};
