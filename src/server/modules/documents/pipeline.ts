import type { DbOrTx } from "../../core/db/types";
import { fileUrl, type AnyDocumentType, type DocumentBranding, type DocumentScope } from "../../core/documents/types";
import { NotFoundError, ValidationError } from "../../core/errors";
import type { ModuleKey } from "../../core/modules/registry";
import { audit } from "../audit/service";
import { getInstitutionProfile, listSignatures } from "../settings/service";

/** Records per print run; narrow the selection beyond this. */
export const MAX_RECORDS_PER_PRINT = 500;

const DEFAULT_PRIMARY = "#1e3a8a";
const DEFAULT_SECONDARY = "#0f766e";

export interface DocumentViewer {
  tenantId: string;
  userId: string;
  /** Already limited to the institute's active modules. */
  permissions: ReadonlySet<string>;
  activeModules: readonly ModuleKey[];
}

/** Full access, own-only access, or none (null) — including when the type's module is switched off. */
export function resolveDocumentScope(type: AnyDocumentType, viewer: DocumentViewer): DocumentScope | null {
  if (!viewer.activeModules.includes(type.module)) return null;
  if (viewer.permissions.has(type.permission)) return { kind: "all" };
  if (type.selfPermission && viewer.permissions.has(type.selfPermission)) return { kind: "self", userId: viewer.userId };
  return null;
}

export async function loadDocumentBranding(db: DbOrTx, tenantId: string): Promise<DocumentBranding> {
  const [profile, signatories] = await Promise.all([getInstitutionProfile(db, tenantId), listSignatures(db, tenantId)]);
  return {
    name: profile.displayName,
    shortName: profile.shortName,
    address: profile.address,
    phone: profile.phone,
    email: profile.email,
    website: profile.website,
    logoUrl: fileUrl(profile.logoFileId),
    primaryColor: profile.primaryColor ?? DEFAULT_PRIMARY,
    secondaryColor: profile.secondaryColor ?? DEFAULT_SECONDARY,
    signatories: signatories.map((s) => ({ id: s.id, title: s.title, personName: s.personName, imageUrl: fileUrl(s.signatureFileId) })),
  };
}

export interface PreparedPrint {
  type: Pick<AnyDocumentType, "key" | "label" | "format">;
  branding: DocumentBranding;
  context: Record<string, unknown>;
  records: { id: string; data: unknown }[];
}

/**
 * Builds one print run: check access, parse the selection, load the records (tenant-scoped by the type's loader),
 * enforce the cap, and audit who printed what. Printing — or reprinting a receipt — never creates any other record.
 */
export async function preparePrint(db: DbOrTx, viewer: DocumentViewer, type: AnyDocumentType, query: Record<string, string>): Promise<PreparedPrint> {
  const scope = resolveDocumentScope(type, viewer);
  // Same answer as an unknown type: don't reveal which documents exist to someone who can't print them.
  if (!scope) throw new NotFoundError("DOCUMENT_TYPE", "This document isn't available.");

  const selection = type.parseSelection(query, scope);
  const [branding, loaded] = await Promise.all([
    loadDocumentBranding(db, viewer.tenantId),
    type.load(db, { tenantId: viewer.tenantId, scope, selection, limit: MAX_RECORDS_PER_PRINT + 1 }),
  ]);
  if (loaded.records.length > MAX_RECORDS_PER_PRINT) {
    throw new ValidationError("VALIDATION_TOO_MANY_DOCUMENTS", `A print run is limited to ${MAX_RECORDS_PER_PRINT} documents. Narrow the selection and print in parts.`);
  }

  if (loaded.records.length > 0) {
    await audit.record(db, {
      tenantId: viewer.tenantId,
      actorType: "TENANT_USER",
      userId: viewer.userId,
      action: "DOCUMENT_PRINTED",
      resourceType: "DOCUMENT",
      resourceId: null,
      newValue: { documentType: type.key, count: loaded.records.length, self: scope.kind === "self", selection: type.describeSelection(selection) },
    });
  }

  return {
    type: { key: type.key, label: type.label, format: type.format },
    branding,
    context: loaded.context ?? {},
    records: loaded.records.map((r) => ({ id: r.id, data: r.data })),
  };
}
