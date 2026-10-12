import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../core/testing/db";
import { auditLogs, institutionProfiles, signatures, tenants } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import type { AnyDocumentType, DocumentScope } from "../../core/documents/types";
import { ValidationError } from "../../core/errors";
import { createLogin } from "../auth/credentials";
import { MAX_RECORDS_PER_PRINT, loadDocumentBranding, preparePrint, resolveDocumentScope, type DocumentViewer } from "./pipeline";
import { getDocumentType } from "./registry";

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;
let userId = "";

beforeEach(async () => {
  await reset();
  userId = "";
});
afterAll(async () => {
  await close();
});

/** A stand-in document type: N numbered records, or a 422 for a bad selection. */
function fakeType(seen: { scope?: DocumentScope; tenantId?: string } = {}): AnyDocumentType {
  return {
    key: "fee-receipt",
    label: "Test receipts",
    module: "fees",
    permission: "fees.view",
    selfPermission: "student.self.view",
    format: { kind: "a4", perPage: 2 },
    parseSelection: (query) => {
      const count = Number(query.count ?? "1");
      if (!Number.isInteger(count) || count < 0) throw new ValidationError("VALIDATION_SELECTION", "Bad count.");
      return { count };
    },
    describeSelection: (s) => s as Record<string, unknown>,
    load: async (_db, ctx) => {
      seen.scope = ctx.scope;
      seen.tenantId = ctx.tenantId;
      const { count } = ctx.selection as { count: number };
      return { records: Array.from({ length: Math.min(count, ctx.limit) }, (_, i) => ({ id: String(i), data: { n: i } })), context: { note: "ctx" } };
    },
  };
}

async function institute() {
  const [tenant] = await testDb.insert(tenants).values({ name: "Prottoy", subdomain: "prottoy", status: "ACTIVE" }).returning();
  userId = (await createLogin(db, { tenantId: tenant.id, name: "Printer", email: "p@prottoy.test", password: "SomePass1" })).id;
  return tenant;
}
const viewer = (tenantId: string, permissions: string[], activeModules: string[] = ["core", "fees"]): DocumentViewer => ({
  tenantId, userId: userId || "00000000-0000-4000-8000-000000000001", permissions: new Set(permissions), activeModules: activeModules as never,
});

describe("document scope", () => {
  it("is all, own-only or none, and none whenever the type's module is off", () => {
    const type = fakeType();
    const t = "t";
    expect(resolveDocumentScope(type, viewer(t, ["fees.view"]))).toEqual({ kind: "all" });
    expect(resolveDocumentScope(type, viewer(t, ["student.self.view"]))).toEqual({ kind: "self", userId: "00000000-0000-4000-8000-000000000001" });
    expect(resolveDocumentScope(type, viewer(t, ["students.view"]))).toBeNull();
    expect(resolveDocumentScope(type, viewer(t, ["fees.view"], ["core"]))).toBeNull();
  });
});

describe("preparePrint", () => {
  it("loads the institute's branding with defaults until a profile is saved", async () => {
    const tenant = await institute();
    expect(await loadDocumentBranding(db, tenant.id)).toMatchObject({ name: "Prottoy", logoUrl: null, primaryColor: "#1e3a8a", signatories: [] });
    await testDb.insert(institutionProfiles).values({ tenantId: tenant.id, displayName: "Prottoy Academic Care", primaryColor: "#0a0a0a", phone: "01711000000" });
    await testDb.insert(signatures).values({ tenantId: tenant.id, title: "Director", personName: "Shirin" });
    expect(await loadDocumentBranding(db, tenant.id)).toMatchObject({
      name: "Prottoy Academic Care", phone: "01711000000", primaryColor: "#0a0a0a", signatories: [{ title: "Director", personName: "Shirin", imageUrl: null }],
    });
  });

  it("prints for the viewer's institute and scope, and audits who printed what", async () => {
    const tenant = await institute();
    const seen: { scope?: DocumentScope; tenantId?: string } = {};
    const job = await preparePrint(db, viewer(tenant.id, ["student.self.view"]), fakeType(seen), { count: "3" });
    expect(job.records.map((r) => r.id)).toEqual(["0", "1", "2"]);
    expect(job.context).toEqual({ note: "ctx" });
    expect(job.type.format).toEqual({ kind: "a4", perPage: 2 });
    expect(seen).toEqual({ scope: { kind: "self", userId }, tenantId: tenant.id });
    const [entry] = await testDb.select().from(auditLogs).where(eq(auditLogs.action, "DOCUMENT_PRINTED"));
    expect(entry.newValue).toEqual({ documentType: "fee-receipt", count: 3, self: true, selection: { count: 3 } });
  });

  it("writes no audit entry when nothing matches", async () => {
    const tenant = await institute();
    const job = await preparePrint(db, viewer(tenant.id, ["fees.view"]), fakeType(), { count: "0" });
    expect(job.records).toEqual([]);
    expect(await testDb.select().from(auditLogs)).toHaveLength(0);
  });

  it("answers no access like an unknown document, refuses bad selections and oversized runs", async () => {
    const tenant = await institute();
    await expect(preparePrint(db, viewer(tenant.id, ["students.view"]), fakeType(), {})).rejects.toMatchObject({ code: "NOT_FOUND_DOCUMENT_TYPE" });
    await expect(preparePrint(db, viewer(tenant.id, ["fees.view"], ["core"]), fakeType(), {})).rejects.toMatchObject({ code: "NOT_FOUND_DOCUMENT_TYPE" });
    await expect(preparePrint(db, viewer(tenant.id, ["fees.view"]), fakeType(), { count: "-1" })).rejects.toMatchObject({ code: "VALIDATION_SELECTION" });
    await expect(preparePrint(db, viewer(tenant.id, ["fees.view"]), fakeType(), { count: String(MAX_RECORDS_PER_PRINT + 1) })).rejects.toMatchObject({
      code: "VALIDATION_TOO_MANY_DOCUMENTS",
    });
  });
});

describe("document registry", () => {
  it("finds a type by key, and nothing for an unknown key", () => {
    const type = fakeType();
    expect(getDocumentType("fee-receipt", [type])).toBe(type);
    expect(getDocumentType("nope", [type])).toBeNull();
    expect(getDocumentType("fee-receipt")).toBeNull(); // no types are registered until the Fees module adds them
  });
});
