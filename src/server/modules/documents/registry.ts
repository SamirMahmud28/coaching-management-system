import type { AnyDocumentType } from "../../core/documents/types";
import { attendanceRegisterDocument } from "../attendance/register-document";
import { feeReceiptDocument } from "../fees/receipt-document";
import { feeReportDocument } from "../fees/report-document";

/**
 * Every printable document type, by key. Modules add theirs here as they're built (fee receipts and the fee report
 * with the Fees module, the monthly register with Attendance), so the one print route can find them.
 */
export const DOCUMENT_TYPES: readonly AnyDocumentType[] = [feeReceiptDocument as AnyDocumentType, feeReportDocument as AnyDocumentType, attendanceRegisterDocument as AnyDocumentType];

export function getDocumentType(key: string, types: readonly AnyDocumentType[] = DOCUMENT_TYPES): AnyDocumentType | null {
  return types.find((t) => t.key === key) ?? null;
}
