import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { auditLogs } from "../../core/db/schema";
import type { DbOrTx } from "../../core/db/types";

export type ActorType = "TENANT_USER" | "PLATFORM_USER";

export interface AuditRecordInput {
  // NULL for platform-only actions.
  tenantId?: string | null;
  actorType: ActorType;
  userId?: string | null;
  platformUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

const SENSITIVE_KEY_RE = /password|secret|token|credential|hash|api[_-]?key/i;

/**
 * Redacts string values under secret-looking keys, recursively. Non-strings are kept: a flag like
 * `mustChangePassword: true` matches the pattern but isn't a secret.
 */
export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY_RE.test(key) && typeof val === "string" ? "[REDACTED]" : redactSecrets(val);
    }
    return out as T;
  }
  return value;
}

/** Call with the caller's transaction so the entry commits or rolls back with the action. */
async function recordEntry(tx: DbOrTx, input: AuditRecordInput) {
  const hasUser = input.userId != null;
  const hasPlatformUser = input.platformUserId != null;
  const valid = input.actorType === "TENANT_USER" ? hasUser && !hasPlatformUser : hasPlatformUser && !hasUser;
  if (!valid) {
    throw new Error(
      `Audit entry for actorType "${input.actorType}" must set exactly one of userId/platformUserId (got userId=${hasUser}, platformUserId=${hasPlatformUser}).`,
    );
  }

  const [created] = await tx
    .insert(auditLogs)
    .values({
      tenantId: input.tenantId ?? null,
      actorType: input.actorType,
      userId: input.userId ?? null,
      platformUserId: input.platformUserId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      oldValue: input.oldValue ? redactSecrets(input.oldValue) : null,
      newValue: input.newValue ? redactSecrets(input.newValue) : null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    })
    .returning();
  return created;
}

export type PlatformLoginFailureReason = "UNKNOWN_EMAIL" | "WRONG_PASSWORD" | "DISABLED";

/**
 * A failed Platform Admin sign-in — the one entry allowed without an actor: an unknown
 * email has nobody to attribute it to. A known email is attributed to that admin, so attempts on an account show up.
 */
async function recordPlatformLoginFailure(
  db: DbOrTx,
  input: { platformUserId: string | null; email: string; reason: PlatformLoginFailureReason; ipAddress?: string | null; userAgent?: string | null },
) {
  await db.insert(auditLogs).values({
    tenantId: null,
    actorType: "PLATFORM_USER",
    userId: null,
    platformUserId: input.platformUserId,
    action: "PLATFORM_LOGIN_FAILED",
    resourceType: "PLATFORM_USER",
    resourceId: input.platformUserId,
    newValue: { email: input.email, reason: input.reason },
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent?.slice(0, 500) ?? null,
  });
}

export const audit = { record: recordEntry, recordPlatformLoginFailure };

export interface AuditPage {
  page?: number;
  pageSize?: number;
}

function clampPage(n: number | undefined): number {
  return Math.max(1, Math.trunc(n ?? 1));
}
function clampPageSize(n: number | undefined): number {
  return Math.min(100, Math.max(1, Math.trunc(n ?? 25)));
}

async function queryPage(db: DbOrTx, where: SQL, page: number, pageSize: number) {
  const [items, countRows] = await Promise.all([
    db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.timestamp)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(auditLogs).where(where),
  ]);
  return { items, total: countRows[0]?.count ?? 0, page, pageSize };
}

/** Tenant view. `tenantId` is required, so another tenant's rows can't be returned. */
export async function queryTenantAuditLog(
  db: DbOrTx,
  params: { tenantId: string; actorType?: ActorType; action?: string } & AuditPage,
) {
  const conditions = [eq(auditLogs.tenantId, params.tenantId)];
  if (params.actorType) conditions.push(eq(auditLogs.actorType, params.actorType));
  if (params.action) conditions.push(eq(auditLogs.action, params.action));
  return queryPage(db, and(...conditions)!, clampPage(params.page), clampPageSize(params.pageSize));
}

/** Platform view. Without `tenantId`, includes every tenant and platform-only rows. */
export async function queryPlatformAuditLog(
  db: DbOrTx,
  params: { tenantId?: string; actorType?: ActorType; action?: string } & AuditPage,
) {
  const conditions = [
    params.tenantId ? eq(auditLogs.tenantId, params.tenantId) : undefined,
    params.actorType ? eq(auditLogs.actorType, params.actorType) : undefined,
    params.action ? eq(auditLogs.action, params.action) : undefined,
  ].filter((c): c is NonNullable<typeof c> => !!c);
  const where = conditions.length > 0 ? and(...conditions)! : sql`true`;
  return queryPage(db, where, clampPage(params.page), clampPageSize(params.pageSize));
}
