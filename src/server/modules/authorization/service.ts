import { ForbiddenError, UnauthorizedError } from "../../core/errors";
import type { DbOrTx, Db } from "../../core/db/types";
import type { ModuleKey } from "../../core/modules/registry";
import { moduleOfPermission, type PermissionName } from "../../core/rbac/catalog";
import type { HostConfig } from "../../core/tenancy/host";
import type { Tenant } from "../../core/tenancy/resolve";
import { listActiveModules } from "../entitlements/service";
import { getEffectivePermissions } from "../rbac/service";
import { getTenantSession } from "../auth/tenant-session";
import type { TenantAuth } from "../auth/tenant-auth";

const READ_METHODS = new Set(["GET", "HEAD"]);

export interface AuthorizedTenantContext {
  tenant: Tenant;
  userId: string;
  /** Effective permissions, already limited to the institute's active modules. */
  permissions: Set<PermissionName>;
  activeModules: ModuleKey[];
}

interface RequestParams {
  db: Db;
  auth: TenantAuth;
  headers: Headers;
  host: HostConfig;
  method: string;
}

/**
 * A user's permissions limited to the modules active for their institute, so a permission of a switched-off module
 * never counts anywhere (guard, page flags, portal choice).
 */
export async function getActivePermissions(
  db: DbOrTx,
  tenantId: string,
  userId: string,
): Promise<{ permissions: Set<PermissionName>; activeModules: ModuleKey[] }> {
  const [granted, activeModules] = await Promise.all([getEffectivePermissions(db, tenantId, userId), listActiveModules(db, tenantId)]);
  const active = new Set<ModuleKey>(activeModules);
  const permissions = new Set([...granted].filter((p) => active.has(moduleOfPermission(p))));
  return { permissions, activeModules };
}

/**
 * The guard for every institute API handler. The module is derived from the permission, so a route can neither
 * forget the module check nor pass the wrong module (an EMS gap, docs/01-EMS-INVESTIGATION-REPORT.md F2).
 */
export async function withAuthorization(params: RequestParams & { permission: PermissionName }): Promise<AuthorizedTenantContext> {
  return authenticateTenantRequest({ ...params, module: moduleOfPermission(params.permission), require: params.permission });
}

/**
 * The guard chain up to the permission check: same-origin writes, signed in to this host's institute, institute
 * active (read-only when suspended), module active. For routes whose permission depends on the resource itself,
 * which then check `permissions` themselves; the module must still be named explicitly.
 */
export async function authenticateTenantRequest(
  params: RequestParams & { module: ModuleKey; require?: PermissionName },
): Promise<AuthorizedTenantContext> {
  const isWrite = !READ_METHODS.has(params.method.toUpperCase());
  // CSRF backstop: every institute subdomain is "same-site" to the others, so SameSite cookies alone don't stop a
  // page on one institute's host from writing to another's. Browsers always send Origin on cross-origin writes.
  if (isWrite) {
    const origin = params.headers.get("origin");
    let originHost: string | null = null;
    try {
      originHost = origin ? new URL(origin).host : null;
    } catch {
      originHost = "invalid";
    }
    if (origin && originHost !== params.headers.get("host")) throw new ForbiddenError("INVALID_ORIGIN", "Invalid origin");
  }
  const session = await getTenantSession(params.auth, params.db, params.headers, params.host);
  if (!session) throw new UnauthorizedError();

  // Re-checked per request: an institute can be suspended or deactivated mid-session.
  if (session.tenant.status === "PENDING" || session.tenant.status === "DEACTIVATED") {
    throw new ForbiddenError("TENANT_INACTIVE", "This institute's account isn't active.");
  }
  if (session.tenant.status === "SUSPENDED" && isWrite) {
    throw new ForbiddenError("TENANT_SUSPENDED", "This institute's account is suspended; only viewing is allowed.");
  }

  const { permissions, activeModules } = await getActivePermissions(params.db, session.tenant.id, session.userId);
  if (!activeModules.includes(params.module)) {
    throw new ForbiddenError("MODULE_INACTIVE", `The "${params.module}" module isn't active for this institute.`);
  }
  if (params.require && !permissions.has(params.require)) {
    throw new ForbiddenError("PERM_DENIED", "You don't have permission to do this.");
  }
  return { tenant: session.tenant, userId: session.userId, permissions, activeModules };
}
