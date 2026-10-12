import type { AnyDocumentType } from "../../core/documents/types";

/**
 * Every printable document type, by key. Modules add theirs here as they're built (fee receipts and the fee report
 * with the Fees module), so the one print route can find them.
 */
export const DOCUMENT_TYPES: readonly AnyDocumentType[] = [];

export function getDocumentType(key: string, types: readonly AnyDocumentType[] = DOCUMENT_TYPES): AnyDocumentType | null {
  return types.find((t) => t.key === key) ?? null;
}
