import { and, desc, eq, inArray } from "drizzle-orm";
import { ConflictError, NotFoundError, mapDatabaseError } from "../../core/errors";
import { modules, moduleRequests, tenantModules, users } from "../../core/db/schema";
import { getInTenant } from "../../core/db/tenant-scope";
import { inTransaction } from "../../core/db/transaction";
import type { DbOrTx, Tx } from "../../core/db/types";
import { MODULE_REGISTRY, type ModuleKey } from "../../core/modules/registry";

function registryDef(key: ModuleKey) {
  const def = MODULE_REGISTRY.find((m) => m.key === key);
  if (!def) throw new NotFoundError("MODULE");
  return def;
}

async function moduleIdsByKey(tx: Tx): Promise<Map<ModuleKey, string>> {
  const rows = await tx.select({ id: modules.id, key: modules.key }).from(modules);
  return new Map(rows.map((r) => [r.key as ModuleKey, r.id]));
}

/** Always true for always-on modules, which never have a tenant_modules row. */
export async function isModuleActive(db: DbOrTx, tenantId: string, key: ModuleKey): Promise<boolean> {
  const def = registryDef(key);
  if (def.alwaysOn) return true;

  const [moduleRow] = await db.select({ id: modules.id }).from(modules).where(eq(modules.key, key)).limit(1);
  if (!moduleRow) return false; // registered but not yet seeded
  const [row] = await db
    .select({ enabled: tenantModules.enabled })
    .from(tenantModules)
    .where(and(eq(tenantModules.tenantId, tenantId), eq(tenantModules.moduleId, moduleRow.id)))
    .limit(1);
  return row?.enabled ?? false;
}

/** Active module keys for a tenant, in registry order. */
export async function listActiveModules(db: DbOrTx, tenantId: string): Promise<ModuleKey[]> {
  const rows = await db
    .select({ key: modules.key })
    .from(tenantModules)
    .innerJoin(modules, eq(modules.id, tenantModules.moduleId))
    .where(and(eq(tenantModules.tenantId, tenantId), eq(tenantModules.enabled, true)));
  const enabled = new Set(rows.map((r) => r.key));
  return MODULE_REGISTRY.filter((m) => m.alwaysOn || enabled.has(m.key)).map((m) => m.key);
}

export interface ModuleStatus {
  key: ModuleKey;
  name: string;
  alwaysOn: boolean;
  dependsOn: ModuleKey[];
  enabled: boolean;
}

/** Every registered module's enabled state for a tenant, in registry order. */
export async function moduleStatusList(db: DbOrTx, tenantId: string): Promise<ModuleStatus[]> {
  const enabledRows = await db
    .select({ key: modules.key, enabled: tenantModules.enabled })
    .from(tenantModules)
    .innerJoin(modules, eq(modules.id, tenantModules.moduleId))
    .where(eq(tenantModules.tenantId, tenantId));
  const enabledByKey = new Map(enabledRows.map((r) => [r.key, r.enabled]));

  return MODULE_REGISTRY.map((m) => ({
    key: m.key,
    name: m.name,
    alwaysOn: m.alwaysOn,
    dependsOn: [...m.dependsOn],
    enabled: m.alwaysOn || (enabledByKey.get(m.key) ?? false),
  }));
}

/** Every active module's dependencies must also be active. */
function assertDependenciesSatisfied(resultEnabled: Map<ModuleKey, boolean>) {
  for (const def of MODULE_REGISTRY) {
    if (!resultEnabled.get(def.key)) continue;
    for (const depKey of def.dependsOn) {
      const dep = registryDef(depKey);
      if (dep.alwaysOn || resultEnabled.get(depKey)) continue;
      throw new ConflictError(
        "CONFLICT_MODULE_DEPENDENCY",
        `"${def.name}" requires "${dep.name}" to be active.`,
        { module: def.key, dependsOn: depKey },
      );
    }
  }
}

export interface ModuleChange {
  key: ModuleKey;
  enabled: boolean;
}

/**
 * Applies the batch atomically. The dependency invariant is checked against the resulting state,
 * which covers both activation and deactivation. Enabling a module fulfils its pending requests.
 */
export async function setTenantModules(
  db: DbOrTx,
  params: { tenantId: string; changes: ModuleChange[]; platformUserId: string },
): Promise<void> {
  if (params.changes.length === 0) return;

  await inTransaction(db, async (tx) => {
    const moduleIds = await moduleIdsByKey(tx);
    const currentRows = await tx.select().from(tenantModules).where(eq(tenantModules.tenantId, params.tenantId));
    const enabledByModuleId = new Map(currentRows.map((r) => [r.moduleId, r.enabled]));

    const resultEnabled = new Map<ModuleKey, boolean>();
    for (const def of MODULE_REGISTRY) {
      const moduleId = moduleIds.get(def.key);
      resultEnabled.set(def.key, def.alwaysOn || (moduleId ? (enabledByModuleId.get(moduleId) ?? false) : false));
    }
    for (const change of params.changes) {
      const def = registryDef(change.key);
      if (def.alwaysOn && !change.enabled) {
        throw new ConflictError("CONFLICT_MODULE_ALWAYS_ON", `"${def.name}" can't be turned off.`, { module: def.key });
      }
      resultEnabled.set(change.key, change.enabled);
    }
    assertDependenciesSatisfied(resultEnabled);

    for (const change of params.changes) {
      const moduleId = moduleIds.get(change.key);
      if (!moduleId) throw new NotFoundError("MODULE");
      const existing = currentRows.find((r) => r.moduleId === moduleId);
      const values = {
        enabled: change.enabled,
        enabledAt: change.enabled ? new Date() : (existing?.enabledAt ?? null),
        enabledBy: change.enabled ? params.platformUserId : (existing?.enabledBy ?? null),
      };
      if (existing) {
        await tx
          .update(tenantModules)
          .set(values)
          .where(and(eq(tenantModules.tenantId, params.tenantId), eq(tenantModules.moduleId, moduleId)));
      } else {
        await tx.insert(tenantModules).values({ tenantId: params.tenantId, moduleId, ...values });
      }
    }

    const turnedOnModuleIds = params.changes
      .filter((c) => c.enabled)
      .map((c) => moduleIds.get(c.key)!)
      .filter((id): id is string => !!id);
    if (turnedOnModuleIds.length > 0) {
      await tx
        .update(moduleRequests)
        .set({ status: "FULFILLED", resolvedAt: new Date(), resolvedBy: params.platformUserId })
        .where(
          and(
            eq(moduleRequests.tenantId, params.tenantId),
            eq(moduleRequests.status, "PENDING"),
            inArray(moduleRequests.moduleId, turnedOnModuleIds),
          ),
        );
    }
  });
}

export interface CreateModuleRequestInput {
  tenantId: string;
  moduleKey: ModuleKey;
  requestedBy: string;
  note?: string;
}

/** requested_by has no foreign key yet, so it is validated here. */
/** The institute's own Modules page: every module's status plus whether a request is already pending. */
export async function instituteModuleOverview(db: DbOrTx, tenantId: string) {
  const [statuses, pendingRows] = await Promise.all([
    moduleStatusList(db, tenantId),
    db
      .select({ key: modules.key })
      .from(moduleRequests)
      .innerJoin(modules, eq(modules.id, moduleRequests.moduleId))
      .where(and(eq(moduleRequests.tenantId, tenantId), eq(moduleRequests.status, "PENDING"))),
  ]);
  const pending = new Set(pendingRows.map((r) => r.key));
  return statuses.map((m) => ({ ...m, pendingRequest: pending.has(m.key) }));
}

export async function createModuleRequest(db: DbOrTx, input: CreateModuleRequestInput) {
  return inTransaction(db, async (tx) => {
    registryDef(input.moduleKey);
    const [moduleRow] = await tx.select({ id: modules.id }).from(modules).where(eq(modules.key, input.moduleKey)).limit(1);
    if (!moduleRow) throw new NotFoundError("MODULE");
    await getInTenant(tx, users, input.tenantId, input.requestedBy, "USER");

    try {
      const [created] = await tx
        .insert(moduleRequests)
        .values({ tenantId: input.tenantId, moduleId: moduleRow.id, requestedBy: input.requestedBy, note: input.note ?? null })
        .returning();
      return created;
    } catch (err) {
      const mapped = mapDatabaseError(err, {
        entity: "MODULE_REQUEST",
        operation: "write",
        unique: {
          module_requests_pending_unique_idx: {
            code: "CONFLICT_MODULE_REQUEST_EXISTS",
            field: "module_id",
            message: "There's already a pending request for this module.",
          },
        },
      });
      throw mapped ?? err;
    }
  });
}

export async function listModuleRequests(
  db: DbOrTx,
  params: { tenantId?: string; status?: "PENDING" | "FULFILLED" | "DISMISSED" },
) {
  const conditions = [
    params.tenantId ? eq(moduleRequests.tenantId, params.tenantId) : undefined,
    params.status ? eq(moduleRequests.status, params.status) : undefined,
  ].filter((c): c is NonNullable<typeof c> => !!c);

  return db
    .select()
    .from(moduleRequests)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(moduleRequests.createdAt));
}

export async function dismissModuleRequest(db: DbOrTx, params: { requestId: string; platformUserId: string }) {
  return inTransaction(db, async (tx) => {
    const [existing] = await tx.select().from(moduleRequests).where(eq(moduleRequests.id, params.requestId)).limit(1);
    if (!existing) throw new NotFoundError("MODULE_REQUEST");
    if (existing.status !== "PENDING") {
      throw new ConflictError("CONFLICT_MODULE_REQUEST_RESOLVED", "This request was already resolved.");
    }
    const [updated] = await tx
      .update(moduleRequests)
      .set({ status: "DISMISSED", resolvedAt: new Date(), resolvedBy: params.platformUserId })
      .where(eq(moduleRequests.id, params.requestId))
      .returning();
    return updated;
  });
}
