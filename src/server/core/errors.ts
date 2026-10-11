// Anything that isn't an AppError becomes a generic 500, so internals never reach the client.
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends AppError {
  constructor(code = "AUTH_REQUIRED", message = "Please sign in to continue.") {
    super(code, 401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(code = "PERM_DENIED", message = "You don't have permission to do this.", details: Record<string, unknown> = {}) {
    super(code, 403, message, details);
  }
}

export class NotFoundError extends AppError {
  // Also used for other tenants' records, so ids can't be probed.
  constructor(entity: string, message = "Not found.") {
    super(`NOT_FOUND_${toCodePart(entity)}`, 404, message);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(code, 409, message, details);
  }
}

export class ValidationError extends AppError {
  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(code, 422, message, details);
  }
}

export interface ReferenceCount {
  type: string;
  count: number;
}

export class InUseError extends ConflictError {
  constructor(entity: string, readonly references: ReferenceCount[]) {
    super(`CONFLICT_${toCodePart(entity)}_IN_USE`, "This record is in use and can't be changed or deleted.", {
      references,
    });
  }
}

export class SystemRecordError extends ConflictError {
  constructor() {
    super("CONFLICT_SYSTEM_RECORD", "This is a system default and can't be changed or deleted.");
  }
}

export function toCodePart(entity: string): string {
  return entity.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[\s-]+/g, "_").toUpperCase();
}

export interface ErrorResponse {
  status: number;
  body: { error: { code: string; message: string; details: Record<string, unknown> } };
}

export function toErrorResponse(err: unknown): ErrorResponse {
  if (err instanceof AppError) {
    return { status: err.status, body: { error: { code: err.code, message: err.message, details: err.details } } };
  }
  return {
    status: 500,
    body: { error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again.", details: {} } },
  };
}

interface PgErrorLike {
  code: string;
  constraint_name?: string;
}

/** Unwraps Drizzle's `cause` chain to the PostgreSQL error. */
export function findPgError(err: unknown): PgErrorLike | null {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === "string" && /^[0-9A-Z]{5}$/.test(candidate.code)) {
      return candidate as PgErrorLike;
    }
    current = candidate.cause;
  }
  return null;
}

export interface DbErrorContext {
  entity: string;
  operation: "write" | "delete";
  // Unique constraint/index name -> domain error.
  unique?: Record<string, { code: string; field: string; message?: string }>;
}

/** Maps a constraint violation to an AppError, or null if it isn't one. */
export function mapDatabaseError(err: unknown, ctx: DbErrorContext): AppError | null {
  const pg = findPgError(err);
  if (!pg) return null;

  switch (pg.code) {
    case "23503": // foreign_key_violation
      return ctx.operation === "delete"
        ? new InUseError(ctx.entity, [])
        : new NotFoundError("REFERENCE", "A linked record doesn't exist.");
    case "23505": { // unique_violation
      const known = pg.constraint_name ? ctx.unique?.[pg.constraint_name] : undefined;
      if (known) {
        return new ConflictError(known.code, known.message ?? "This value is already in use.", { field: known.field });
      }
      return new ConflictError("CONFLICT_DUPLICATE", "A record with these details already exists.");
    }
    case "23514": // check_violation
      return new ValidationError("VALIDATION_CHECK_FAILED", "One of the values isn't allowed.");
    default:
      return null;
  }
}
