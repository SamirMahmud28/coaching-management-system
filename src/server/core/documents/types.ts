import type { DbOrTx } from "../db/types";
import type { ModuleKey } from "../modules/registry";
import type { PermissionName } from "../rbac/catalog";

// The document engine's contract (ported from the EMS without QR codes, verification or card layouts: D64). Modules
// declare document types; the engine checks access, loads records, audits the print and lays them out on A4.

export type DocumentTypeKey = "fee-receipt" | "fee-report";

export type DocumentFormat =
  /** A4 documents, one or two per page (two for half-page receipts). */
  | { kind: "a4"; perPage: 1 | 2 }
  /** Reports: each record starts a new A4 page and runs on over as many pages as it needs (table headers repeat). */
  | { kind: "a4-flow" };

/** Who is printing: everything they may see, or only their own records (a student's own receipt). */
export type DocumentScope = { kind: "all" } | { kind: "self"; userId: string };

export interface LoadContext<TSelection> {
  tenantId: string;
  scope: DocumentScope;
  selection: TSelection;
  /** Load at most this many records; the pipeline asks for one more than the cap to detect an oversized run. */
  limit: number;
}

export interface LoadedRecord<TRecord> {
  /** Stable id of the subject (payment, student…), used for keys and the audit entry. */
  id: string;
  data: TRecord;
}

export interface LoadResult<TRecord> {
  records: LoadedRecord<TRecord>[];
  /** Extra, record-independent context for templates (e.g. a report's date range). */
  context?: Record<string, unknown>;
}

export interface DocumentTypeDefinition<TRecord = unknown, TSelection = unknown> {
  key: DocumentTypeKey;
  label: string;
  module: ModuleKey;
  permission: PermissionName;
  /** Lets a user print only their own documents, e.g. a student's receipts. The loader applies the limit. */
  selfPermission?: PermissionName;
  format: DocumentFormat;
  /** Parses the print route's query string (already flattened to strings); throw a ValidationError for bad input. */
  parseSelection(query: Record<string, string>, scope: DocumentScope): TSelection;
  /** A short, human-readable summary of the selection for the audit log. */
  describeSelection(selection: TSelection): Record<string, unknown>;
  load(db: DbOrTx, ctx: LoadContext<TSelection>): Promise<LoadResult<TRecord>>;
}

export type AnyDocumentType = DocumentTypeDefinition<unknown, unknown>;

/** Branding as templates see it: the institution profile plus image URLs for its logo and signatories. */
export interface DocumentBranding {
  name: string;
  shortName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  signatories: { id: string; title: string; personName: string; imageUrl: string | null }[];
}

/** Everything a template needs. Templates never query; they only render this. */
export interface TemplateProps<TRecord = unknown> {
  record: TRecord;
  branding: DocumentBranding;
  context: Record<string, unknown>;
}

export const fileUrl = (fileId: string | null | undefined) => (fileId ? `/api/v1/files/${fileId}` : null);
