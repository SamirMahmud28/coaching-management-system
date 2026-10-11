import type { z } from "zod";
import { NotFoundError, ValidationError, toErrorResponse } from "../errors";
import { isUuid } from "../db/tenant-scope";
import { toSnakeCaseKeys } from "./case";

export function json(data: unknown, status = 200): Response {
  return Response.json(toSnakeCaseKeys(data), { status });
}

/** Maps thrown errors to the API error envelope; unexpected errors are logged and returned as a generic 500. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    if (status === 500) console.error(err);
    return Response.json(body, { status });
  }
}

function invalid(issues: z.core.$ZodIssue[]): ValidationError {
  return new ValidationError("VALIDATION_REQUEST", "The request is invalid.", {
    issues: issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  });
}

export async function parseBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ValidationError("VALIDATION_REQUEST", "The request body must be valid JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error.issues);
  return parsed.data;
}

/**
 * parseBody for an edit endpoint: a field that is owned by another workflow or by the system (see
 * src/lib/field-ownership.ts) is refused with its reason, instead of being silently ignored.
 */
export async function parseEditBody<S extends z.ZodType>(request: Request, schema: S, locked: Record<string, { reason: string }>): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ValidationError("VALIDATION_REQUEST", "The request body must be valid JSON.");
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const field = Object.keys(raw).find((key) => Object.hasOwn(locked, key));
    if (field) throw new ValidationError("VALIDATION_FIELD_NOT_EDITABLE", locked[field].reason, { field });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error.issues);
  return parsed.data;
}

export function parseQuery<S extends z.ZodType>(request: Request, schema: S): z.infer<S> {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = schema.safeParse(params);
  if (!parsed.success) throw invalid(parsed.error.issues);
  return parsed.data;
}

/** A malformed id is a 404, never a database error. */
export function pathId(value: string, entity: string): string {
  if (!isUuid(value)) throw new NotFoundError(entity);
  return value;
}
