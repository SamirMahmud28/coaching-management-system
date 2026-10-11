import { describe, expect, it } from "vitest";
import {
  ConflictError,
  InUseError,
  NotFoundError,
  SystemRecordError,
  findPgError,
  mapDatabaseError,
  toCodePart,
  toErrorResponse,
} from "./errors";

const pgError = (code: string, constraint_name?: string) => Object.assign(new Error("pg"), { code, constraint_name });
// Drizzle wraps driver errors: DrizzleQueryError { cause: PostgresError }.
const wrapped = (cause: unknown) => Object.assign(new Error("Failed query: ..."), { cause });

describe("toErrorResponse", () => {
  it("renders an AppError in the { error: { code, message, details } } envelope", () => {
    const res = toErrorResponse(new InUseError("class", [{ type: "sections", count: 3 }]));
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      code: "CONFLICT_CLASS_IN_USE",
      message: expect.any(String),
      details: { references: [{ type: "sections", count: 3 }] },
    });
  });

  it("never leaks internals of an unexpected error", () => {
    const res = toErrorResponse(new Error('relation "users" violates something at line 42'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(res.body)).not.toContain("users");
  });

  it("uses 404 NOT_FOUND_<ENTITY> for missing (or other-tenant) records", () => {
    const res = toErrorResponse(new NotFoundError("staff"));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND_STAFF");
  });

  it("maps system rows to CONFLICT_SYSTEM_RECORD", () => {
    expect(toErrorResponse(new SystemRecordError()).body.error.code).toBe("CONFLICT_SYSTEM_RECORD");
  });
});

describe("toCodePart", () => {
  it("turns entity names into code segments", () => {
    expect(toCodePart("classDay")).toBe("CLASS_DAY");
    expect(toCodePart("class day")).toBe("CLASS_DAY");
    expect(toCodePart("session")).toBe("SESSION");
  });
});

describe("findPgError", () => {
  it("finds the PostgreSQL error inside Drizzle's wrapper", () => {
    expect(findPgError(wrapped(pgError("23505", "x")))?.code).toBe("23505");
  });

  it("returns null for non-database errors", () => {
    expect(findPgError(new Error("boom"))).toBeNull();
  });
});

describe("mapDatabaseError", () => {
  const ctx = {
    entity: "tenant",
    unique: { tenants_subdomain_lower_idx: { code: "CONFLICT_TENANT_SUBDOMAIN", field: "subdomain" } },
  };

  it("maps an FK violation on delete to CONFLICT_<ENTITY>_IN_USE", () => {
    const err = mapDatabaseError(wrapped(pgError("23503")), { ...ctx, entity: "class", operation: "delete" });
    expect(err).toBeInstanceOf(InUseError);
    expect(err?.code).toBe("CONFLICT_CLASS_IN_USE");
  });

  it("maps an FK violation on insert/update to a 404 (e.g. another tenant's id)", () => {
    const err = mapDatabaseError(wrapped(pgError("23503")), { ...ctx, operation: "write" });
    expect(err?.status).toBe(404);
    expect(err?.code).toBe("NOT_FOUND_REFERENCE");
  });

  it("maps a known unique constraint to its domain code and field", () => {
    const err = mapDatabaseError(wrapped(pgError("23505", "tenants_subdomain_lower_idx")), { ...ctx, operation: "write" });
    expect(err).toBeInstanceOf(ConflictError);
    expect(err?.code).toBe("CONFLICT_TENANT_SUBDOMAIN");
    expect(err?.details).toEqual({ field: "subdomain" });
  });

  it("falls back to CONFLICT_DUPLICATE for an unmapped unique constraint", () => {
    expect(mapDatabaseError(pgError("23505", "other_idx"), { ...ctx, operation: "write" })?.code).toBe("CONFLICT_DUPLICATE");
  });

  it("maps a CHECK violation to 422", () => {
    expect(mapDatabaseError(pgError("23514"), { ...ctx, operation: "write" })?.status).toBe(422);
  });

  it("returns null for anything else, so the caller rethrows it", () => {
    expect(mapDatabaseError(pgError("40001"), { ...ctx, operation: "write" })).toBeNull();
    expect(mapDatabaseError(new Error("boom"), { ...ctx, operation: "write" })).toBeNull();
  });
});
