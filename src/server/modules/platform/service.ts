import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { ConflictError, NotFoundError, ValidationError, mapDatabaseError } from "../../core/errors";
import {
  moduleRequests,
  modules,
  platformSessions,
  platformUsers,
  tenantModules,
  tenants,
  userRoles,
  users,
} from "../../core/db/schema";
import { containsPattern } from "../../core/db/search";
import { getInTenant } from "../../core/db/tenant-scope";
import { inTransaction } from "../../core/db/transaction";
import type { DbOrTx } from "../../core/db/types";
import { MODULE_KEYS, MODULE_REGISTRY, closeModuleDependencies, type ModuleKey } from "../../core/modules/registry";
import { INSTITUTE_OWNER_ROLE } from "../../core/rbac/catalog";
import { isValidTenantSubdomain } from "../../core/tenancy/host";
import { audit, queryPlatformAuditLog } from "../audit/service";
import { createLogin } from "../auth/credentials";
import { passwordProblem } from "../auth/password";
import { validEmail } from "../auth/platform-admin-input";
import { createPlatformLogin } from "../auth/platform-credentials";
import { dismissModuleRequest, moduleStatusList, setTenantModules } from "../entitlements/service";
import { seedBaselineRoles } from "../rbac/service";

// Callers are responsible for resolving an active Platform Admin; the platform side has no RBAC.

type TenantStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED";

const TRANSITION_TARGETS = new Set<TenantStatus>(["ACTIVE", "SUSPENDED", "DEACTIVATED"]);
const ALWAYS_ON_MODULE_COUNT = MODULE_REGISTRY.filter((m) => m.alwaysOn).length;

function clampPaging(page?: number, pageSize?: number) {
  return {
    page: Math.max(1, Math.trunc(page ?? 1)),
    pageSize: Math.min(100, Math.max(1, Math.trunc(pageSize ?? 25))),
  };
}

// ---------------------------------------------------------------------------
// Tenants
// ---------------------------------------------------------------------------

export interface CreateTenantInput {
  name: string;
  subdomain: string;
  starterModuleKeys: ModuleKey[];
  ownerName: string;
  ownerEmail: string;
  temporaryPassword: string;
}

/** Seeds module-owned per-tenant defaults (Academic, code counters) inside the create transaction. */
export type SeedTenantDefaultsHook = (tx: DbOrTx, tenantId: string) => Promise<void>;
const noopSeedTenantDefaults: SeedTenantDefaultsHook = async () => {};

export async function createTenant(
  db: DbOrTx,
  input: CreateTenantInput,
  ctx: { platformUserId: string; seedTenantDefaults?: SeedTenantDefaultsHook },
) {
  if (!input.name.trim()) throw new ValidationError("VALIDATION_TENANT_NAME", "Institute name is required.");
  if (!isValidTenantSubdomain(input.subdomain)) {
    throw new ValidationError(
      "VALIDATION_SUBDOMAIN",
      "Subdomain must be 3-63 lowercase letters, digits or hyphens (no leading/trailing hyphen), and not a reserved name.",
      { field: "subdomain" },
    );
  }
  if (!input.ownerName.trim()) throw new ValidationError("VALIDATION_OWNER_NAME", "Owner name is required.");
  if (!validEmail(input.ownerEmail)) {
    throw new ValidationError("VALIDATION_OWNER_EMAIL", "Enter a valid email address.", { field: "ownerEmail" });
  }
  const passwordIssue = passwordProblem(input.temporaryPassword);
  if (passwordIssue) throw new ValidationError("VALIDATION_TEMP_PASSWORD", passwordIssue, { field: "temporaryPassword" });
  for (const key of input.starterModuleKeys) {
    if (!(MODULE_KEYS as readonly string[]).includes(key)) {
      throw new ValidationError("VALIDATION_MODULE_KEY", `Unknown module "${key}".`);
    }
  }

  const seedTenantDefaults = ctx.seedTenantDefaults ?? noopSeedTenantDefaults;
  const starterModules = closeModuleDependencies(input.starterModuleKeys);
  // Always-on modules are active without a tenant_modules row.
  const activatableModules = starterModules.filter((key) => !MODULE_REGISTRY.find((m) => m.key === key)!.alwaysOn);

  return inTransaction(db, async (tx) => {
    let tenant;
    try {
      [tenant] = await tx
        .insert(tenants)
        .values({ name: input.name.trim(), subdomain: input.subdomain.toLowerCase(), status: "PENDING" })
        .returning();
    } catch (err) {
      throw (
        mapDatabaseError(err, {
          entity: "TENANT",
          operation: "write",
          unique: {
            tenants_subdomain_lower_idx: { code: "CONFLICT_TENANT_SUBDOMAIN", field: "subdomain", message: "That subdomain is already in use." },
          },
        }) ?? err
      );
    }

    await seedTenantDefaults(tx, tenant.id);
    // Roles must exist before the Owner can be given the School Owner role.
    const roleIds = await seedBaselineRoles(tx, tenant.id);
    await setTenantModules(tx, {
      tenantId: tenant.id,
      changes: activatableModules.map((key) => ({ key, enabled: true })),
      platformUserId: ctx.platformUserId,
    });

    const owner = await createLogin(tx, {
      tenantId: tenant.id,
      name: input.ownerName.trim(),
      email: input.ownerEmail.trim().toLowerCase(),
      password: input.temporaryPassword,
    });
    // Direct insert: the RBAC service's escalation check assumes a tenant-user grantor.
    await tx.insert(userRoles).values({ tenantId: tenant.id, userId: owner.id, roleId: roleIds[INSTITUTE_OWNER_ROLE] });

    const [activated] = await tx
      .update(tenants)
      .set({ ownerUserId: owner.id, status: "ACTIVE", updatedAt: new Date() })
      .where(eq(tenants.id, tenant.id))
      .returning();

    await audit.record(tx, {
      tenantId: tenant.id,
      actorType: "PLATFORM_USER",
      platformUserId: ctx.platformUserId,
      action: "TENANT_CREATED",
      resourceType: "TENANT",
      resourceId: tenant.id,
      newValue: { name: activated.name, subdomain: activated.subdomain, starterModules },
    });

    // The only time the temporary password is returned; only its hash is stored.
    return { tenant: activated, temporaryPassword: input.temporaryPassword };
  });
}

export async function listTenants(db: DbOrTx, params: { status?: TenantStatus; q?: string; page?: number; pageSize?: number }) {
  const { page, pageSize } = clampPaging(params.page, params.pageSize);
  const conditions = [
    params.status ? eq(tenants.status, params.status) : undefined,
    params.q ? or(ilike(tenants.name, containsPattern(params.q)), ilike(tenants.subdomain, containsPattern(params.q))) : undefined,
  ].filter((c): c is NonNullable<typeof c> => !!c);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, countRows] = await Promise.all([
    db
      .select({
        id: tenants.id,
        name: tenants.name,
        subdomain: tenants.subdomain,
        status: tenants.status,
        ownerUserId: tenants.ownerUserId,
        createdAt: tenants.createdAt,
        moduleCount: sql<number>`(
          select count(*)::int from ${tenantModules}
          where ${tenantModules.tenantId} = ${tenants.id} and ${tenantModules.enabled}
        ) + ${ALWAYS_ON_MODULE_COUNT}`,
      })
      .from(tenants)
      .where(where)
      .orderBy(desc(tenants.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(tenants).where(where),
  ]);
  return { items, total: countRows[0]?.count ?? 0, page, pageSize };
}

export async function getTenant(db: DbOrTx, id: string) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!tenant) throw new NotFoundError("TENANT");

  const [owner] = tenant.ownerUserId
    ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, tenant.ownerUserId)).limit(1)
    : [];

  return { ...tenant, owner: owner ?? null, modules: await moduleStatusList(db, id) };
}

export async function checkSubdomainAvailability(
  db: DbOrTx,
  subdomain: string,
): Promise<{ available: boolean; reason: "invalid" | "taken" | null }> {
  const normalized = subdomain.trim().toLowerCase();
  if (!isValidTenantSubdomain(normalized)) return { available: false, reason: "invalid" };
  const [existing] = await db.select({ id: tenants.id }).from(tenants).where(sql`lower(${tenants.subdomain}) = ${normalized}`).limit(1);
  return existing ? { available: false, reason: "taken" } : { available: true, reason: null };
}

export async function listTenantUsers(db: DbOrTx, tenantId: string) {
  await getTenant(db, tenantId);
  return db
    .select({ id: users.id, name: users.name, email: users.email, username: users.username, banned: users.banned })
    .from(users)
    .where(eq(users.tenantId, tenantId))
    .orderBy(users.name);
}

/** Never targets PENDING. Suspension keeps sessions alive: reads stay allowed, writes are blocked per request. */
export async function transitionTenantStatus(
  db: DbOrTx,
  params: { tenantId: string; status: TenantStatus; reason?: string; platformUserId: string },
) {
  if (!TRANSITION_TARGETS.has(params.status)) {
    throw new ValidationError("VALIDATION_STATUS_TRANSITION", `"${params.status}" isn't a valid target status.`);
  }
  if ((params.status === "SUSPENDED" || params.status === "DEACTIVATED") && !params.reason?.trim()) {
    throw new ValidationError("VALIDATION_REASON_REQUIRED", "A reason is required.", { field: "reason" });
  }

  return inTransaction(db, async (tx) => {
    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, params.tenantId)).limit(1);
    if (!tenant) throw new NotFoundError("TENANT");

    const patch: Partial<typeof tenants.$inferInsert> = { status: params.status, updatedAt: new Date() };
    if (params.status === "SUSPENDED") {
      patch.suspendedAt = new Date();
      patch.suspendedReason = params.reason!.trim();
    } else if (params.status === "DEACTIVATED") {
      patch.deactivatedAt = new Date();
    } else {
      patch.suspendedAt = null;
      patch.suspendedReason = null;
      patch.deactivatedAt = null;
    }

    const [updated] = await tx.update(tenants).set(patch).where(eq(tenants.id, params.tenantId)).returning();

    const action =
      params.status === "SUSPENDED" ? "TENANT_SUSPENDED" : params.status === "DEACTIVATED" ? "TENANT_DEACTIVATED" : "TENANT_REACTIVATED";
    await audit.record(tx, {
      tenantId: params.tenantId,
      actorType: "PLATFORM_USER",
      platformUserId: params.platformUserId,
      action,
      resourceType: "TENANT",
      resourceId: params.tenantId,
      oldValue: { status: tenant.status },
      newValue: { status: params.status, reason: params.reason ?? null },
    });
    return updated;
  });
}

/** A real YYYY-MM-DD calendar date (2026-02-30 isn't). */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Display-only "paid until" date (D4): nothing is enforced from it in Phase 1. `null` clears it. */
export async function setTenantPaidUntil(db: DbOrTx, params: { tenantId: string; paidUntil: string | null; platformUserId: string }) {
  if (params.paidUntil !== null && !isCalendarDate(params.paidUntil)) {
    throw new ValidationError("VALIDATION_DATE", "Enter a date as YYYY-MM-DD.", { field: "paidUntil" });
  }
  return inTransaction(db, async (tx) => {
    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, params.tenantId)).limit(1);
    if (!tenant) throw new NotFoundError("TENANT");
    const [updated] = await tx
      .update(tenants)
      .set({ paidUntil: params.paidUntil, updatedAt: new Date() })
      .where(eq(tenants.id, params.tenantId))
      .returning();
    await audit.record(tx, {
      tenantId: params.tenantId,
      actorType: "PLATFORM_USER",
      platformUserId: params.platformUserId,
      action: "TENANT_PAID_UNTIL_CHANGED",
      resourceType: "TENANT",
      resourceId: params.tenantId,
      oldValue: { paidUntil: tenant.paidUntil },
      newValue: { paidUntil: updated.paidUntil },
    });
    return updated;
  });
}

/** Changes who is designated Owner; the previous Owner keeps their roles. */
export async function transferOwnership(db: DbOrTx, params: { tenantId: string; newOwnerUserId: string; platformUserId: string }) {
  return inTransaction(db, async (tx) => {
    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, params.tenantId)).limit(1);
    if (!tenant) throw new NotFoundError("TENANT");
    const newOwner = await getInTenant(tx, users, params.tenantId, params.newOwnerUserId, "USER");

    const [updated] = await tx
      .update(tenants)
      .set({ ownerUserId: newOwner.id, updatedAt: new Date() })
      .where(eq(tenants.id, params.tenantId))
      .returning();

    await audit.record(tx, {
      tenantId: params.tenantId,
      actorType: "PLATFORM_USER",
      platformUserId: params.platformUserId,
      action: "TENANT_OWNERSHIP_TRANSFERRED",
      resourceType: "TENANT",
      resourceId: params.tenantId,
      oldValue: { ownerUserId: tenant.ownerUserId },
      newValue: { ownerUserId: newOwner.id },
    });
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Module entitlements and requests
// ---------------------------------------------------------------------------

/** setTenantModules plus one audit entry per module whose state actually changed. */
export async function updateTenantModules(
  db: DbOrTx,
  params: { tenantId: string; changes: { key: ModuleKey; enabled: boolean }[]; platformUserId: string },
) {
  return inTransaction(db, async (tx) => {
    const before = await getTenant(tx, params.tenantId);
    const wasEnabled = new Map(before.modules.map((m) => [m.key, m.enabled]));

    await setTenantModules(tx, params);

    for (const change of params.changes) {
      if (wasEnabled.get(change.key) === change.enabled) continue;
      await audit.record(tx, {
        tenantId: params.tenantId,
        actorType: "PLATFORM_USER",
        platformUserId: params.platformUserId,
        action: "MODULE_ENTITLEMENT_CHANGED",
        resourceType: "TENANT_MODULE",
        oldValue: { module: change.key, enabled: wasEnabled.get(change.key) ?? false },
        newValue: { module: change.key, enabled: change.enabled },
      });
    }
    return getTenant(tx, params.tenantId);
  });
}

export async function listModuleRequestQueue(
  db: DbOrTx,
  params: { status?: "PENDING" | "FULFILLED" | "DISMISSED"; tenantId?: string },
) {
  const conditions = [
    eq(moduleRequests.status, params.status ?? "PENDING"),
    params.tenantId ? eq(moduleRequests.tenantId, params.tenantId) : undefined,
  ].filter((c): c is NonNullable<typeof c> => !!c);

  return db
    .select({
      id: moduleRequests.id,
      status: moduleRequests.status,
      note: moduleRequests.note,
      createdAt: moduleRequests.createdAt,
      resolvedAt: moduleRequests.resolvedAt,
      tenantId: tenants.id,
      tenantName: tenants.name,
      tenantSubdomain: tenants.subdomain,
      moduleKey: modules.key,
      moduleName: modules.name,
      requestedByName: users.name,
    })
    .from(moduleRequests)
    .innerJoin(tenants, eq(tenants.id, moduleRequests.tenantId))
    .innerJoin(modules, eq(modules.id, moduleRequests.moduleId))
    // requested_by has no foreign key yet, so a missing user must not drop the request.
    .leftJoin(users, and(eq(users.id, moduleRequests.requestedBy), eq(users.tenantId, moduleRequests.tenantId)))
    .where(and(...conditions))
    .orderBy(desc(moduleRequests.createdAt));
}

/** module_requests has no column for the dismissal note, so it is kept in the audit entry. */
export async function dismissModuleRequestWithNote(db: DbOrTx, params: { requestId: string; note: string; platformUserId: string }) {
  if (!params.note.trim()) throw new ValidationError("VALIDATION_REASON_REQUIRED", "A note is required.", { field: "note" });
  return inTransaction(db, async (tx) => {
    const updated = await dismissModuleRequest(tx, { requestId: params.requestId, platformUserId: params.platformUserId });
    await audit.record(tx, {
      tenantId: updated.tenantId,
      actorType: "PLATFORM_USER",
      platformUserId: params.platformUserId,
      action: "MODULE_REQUEST_DISMISSED",
      resourceType: "MODULE_REQUEST",
      resourceId: updated.id,
      newValue: { note: params.note.trim() },
    });
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Platform Admins
// ---------------------------------------------------------------------------

export async function createPlatformAdmin(
  db: DbOrTx,
  input: { name: string; email: string; temporaryPassword: string; platformUserId: string },
) {
  if (!input.name.trim()) throw new ValidationError("VALIDATION_NAME", "Name is required.", { field: "name" });
  if (!validEmail(input.email.trim())) throw new ValidationError("VALIDATION_EMAIL", "Enter a valid email address.", { field: "email" });

  return inTransaction(db, async (tx) => {
    let admin;
    try {
      admin = await createPlatformLogin(tx, { name: input.name, email: input.email, password: input.temporaryPassword });
    } catch (err) {
      throw (
        mapDatabaseError(err, {
          entity: "PLATFORM_ADMIN",
          operation: "write",
          unique: {
            platform_users_email_lower_idx: {
              code: "CONFLICT_PLATFORM_ADMIN_EMAIL",
              field: "email",
              message: "A Platform Admin with that email already exists.",
            },
          },
        }) ?? err
      );
    }

    await audit.record(tx, {
      actorType: "PLATFORM_USER",
      platformUserId: input.platformUserId,
      action: "PLATFORM_ADMIN_CREATED",
      resourceType: "PLATFORM_USER",
      resourceId: admin.id,
      newValue: { name: admin.name, email: admin.email },
    });
    return admin;
  });
}

export async function listPlatformAdmins(db: DbOrTx, params: { q?: string; status?: "ACTIVE" | "DISABLED" }) {
  const conditions = [
    params.status ? eq(platformUsers.status, params.status) : undefined,
    params.q ? or(ilike(platformUsers.name, containsPattern(params.q)), ilike(platformUsers.email, containsPattern(params.q))) : undefined,
  ].filter((c): c is NonNullable<typeof c> => !!c);

  return db
    .select({
      id: platformUsers.id,
      name: platformUsers.name,
      email: platformUsers.email,
      status: platformUsers.status,
      mustChangePassword: platformUsers.mustChangePassword,
      createdAt: platformUsers.createdAt,
    })
    .from(platformUsers)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(platformUsers.name);
}

/** Signs the admin out everywhere. Self-disable is refused here, not only hidden in the UI. */
export async function disablePlatformAdmin(db: DbOrTx, params: { id: string; platformUserId: string }) {
  if (params.id === params.platformUserId) {
    throw new ConflictError("CONFLICT_SELF_DISABLE", "You can't disable your own account.");
  }
  return setPlatformAdminStatus(db, { ...params, status: "DISABLED" });
}

export async function enablePlatformAdmin(db: DbOrTx, params: { id: string; platformUserId: string }) {
  return setPlatformAdminStatus(db, { ...params, status: "ACTIVE" });
}

async function setPlatformAdminStatus(db: DbOrTx, params: { id: string; platformUserId: string; status: "ACTIVE" | "DISABLED" }) {
  return inTransaction(db, async (tx) => {
    const [admin] = await tx.select({ id: platformUsers.id }).from(platformUsers).where(eq(platformUsers.id, params.id)).limit(1);
    if (!admin) throw new NotFoundError("PLATFORM_USER");

    const [updated] = await tx
      .update(platformUsers)
      .set({ status: params.status, updatedAt: new Date() })
      .where(eq(platformUsers.id, params.id))
      .returning();
    if (params.status === "DISABLED") await tx.delete(platformSessions).where(eq(platformSessions.userId, params.id));

    await audit.record(tx, {
      actorType: "PLATFORM_USER",
      platformUserId: params.platformUserId,
      action: params.status === "DISABLED" ? "PLATFORM_ADMIN_DISABLED" : "PLATFORM_ADMIN_ENABLED",
      resourceType: "PLATFORM_USER",
      resourceId: params.id,
    });
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

/** The platform audit log with actor and tenant names resolved for display. */
export async function listPlatformAudit(db: DbOrTx, params: Parameters<typeof queryPlatformAuditLog>[1]) {
  const page = await queryPlatformAuditLog(db, params);
  const distinct = (pick: (row: (typeof page.items)[number]) => string | null) => [
    ...new Set(page.items.map(pick).filter((v): v is string => !!v)),
  ];

  const tenantIds = distinct((r) => r.tenantId);
  const userIds = distinct((r) => r.userId);
  const platformUserIds = distinct((r) => r.platformUserId);
  const [tenantRows, userRows, platformUserRows] = await Promise.all([
    tenantIds.length ? db.select({ id: tenants.id, name: tenants.name }).from(tenants).where(inArray(tenants.id, tenantIds)) : [],
    userIds.length ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds)) : [],
    platformUserIds.length
      ? db.select({ id: platformUsers.id, name: platformUsers.name }).from(platformUsers).where(inArray(platformUsers.id, platformUserIds))
      : [],
  ]);
  const tenantName = new Map(tenantRows.map((r) => [r.id, r.name]));
  const actorName = new Map([...userRows, ...platformUserRows].map((r) => [r.id, r.name]));

  return {
    ...page,
    items: page.items.map((row) => ({
      ...row,
      tenantName: row.tenantId ? (tenantName.get(row.tenantId) ?? null) : null,
      actorName: actorName.get((row.userId ?? row.platformUserId)!) ?? null,
    })),
  };
}
