import type { Db } from "../../core/db/types";
import type { HostConfig } from "../../core/tenancy/host";
import { resolveHost, type Tenant } from "../../core/tenancy/resolve";
import type { TenantAuth } from "./tenant-auth";

export interface TenantSession {
  tenant: Tenant;
  userId: string;
  sessionId: string;
  name: string;
  // Staff sign in by email, students by username; either may be absent.
  email: string | null;
  username: string | null;
  mustChangePassword: boolean;
}

/** The signed-in user, or null unless the session belongs to the institute this request's host resolves to. */
export async function getTenantSession(auth: TenantAuth, db: Db, headers: Headers, host: HostConfig): Promise<TenantSession | null> {
  const resolved = await resolveHost(db, headers.get("host"), host);
  if (resolved.kind !== "tenant") return null;

  const result = await auth.api.getSession({ headers });
  if (!result) return null;
  if (result.session.tenantId !== resolved.tenant.id) return null;
  if (result.user.banned) return null;

  return {
    tenant: resolved.tenant,
    userId: result.user.id,
    sessionId: result.session.id,
    name: result.user.name,
    email: result.user.email || null,
    username: result.user.username ?? null,
    mustChangePassword: result.user.mustChangePassword ?? false,
  };
}
