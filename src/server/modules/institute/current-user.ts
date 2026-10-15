import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { db } from "../../core/db/client";
import type { ModuleKey } from "../../core/modules/registry";
import type { PermissionName } from "../../core/rbac/catalog";
import { PORTAL_HOME, resolvePortal, type PortalKind } from "../../core/rbac/portal";
import { hostConfigFromEnv } from "../../core/tenancy/host";
import { resolveHost, type Tenant } from "../../core/tenancy/resolve";
import { tenantAuth } from "../auth/instance";
import { getTenantSession, type TenantSession } from "../auth/tenant-session";
import { getActivePermissions } from "../authorization/service";

// Redirect targets are host-relative: the proxy maps "/x" to "/institute/x" on an institute host.

/** The institute this request's host resolves to; a well-formed subdomain with no institute is a 404. */
export async function getCurrentInstitute(): Promise<Tenant> {
  const resolved = await resolveHost(db, (await headers()).get("host"), hostConfigFromEnv());
  if (resolved.kind !== "tenant") notFound();
  return resolved.tenant;
}

/** The signed-in user of this host's institute, or null. No redirects (the sign-in pages use it). */
export async function getCurrentInstituteUser(): Promise<TenantSession | null> {
  return getTenantSession(tenantAuth, db, await headers(), hostConfigFromEnv());
}

/** Signed in, past the temporary-password step, and the institute still active or suspended. */
export async function requireInstituteUser(): Promise<TenantSession> {
  await getCurrentInstitute();
  const session = await getCurrentInstituteUser();
  if (!session) redirect("/login");
  if (session.tenant.status === "PENDING" || session.tenant.status === "DEACTIVATED") redirect("/login?inactive=1");
  if (session.mustChangePassword) redirect("/change-password");
  return session;
}

export interface PageContext {
  session: TenantSession;
  /** Already limited to the institute's active modules, so a UI flag can never show a switched-off module's action. */
  permissions: ReadonlySet<PermissionName>;
  activeModules: ModuleKey[];
  portal: PortalKind;
}

async function pageContext(): Promise<PageContext> {
  const session = await requireInstituteUser();
  const { permissions, activeModules } = await getActivePermissions(db, session.tenant.id, session.userId);
  return { session, permissions, activeModules, portal: resolvePortal(permissions) };
}

/**
 * The single guard for institute app pages: signed in, served the portal its permissions call for (anyone else is
 * sent to their own), and holding `permission` with its module active, or a 404 so a page's existence isn't
 * revealed. Every page uses this; none checks the module on its own.
 */
export async function requireModulePage(permission: PermissionName, portal: PortalKind = "admin"): Promise<PageContext> {
  const ctx = await pageContext();
  if (ctx.portal !== portal) redirect(PORTAL_HOME[ctx.portal]);
  if (!ctx.permissions.has(permission)) notFound();
  return ctx;
}

/**
 * The print route, shared by every portal (a student reprints their own receipt, staff print anything they may see).
 * Signed in only; the document pipeline then checks the type's module and permission (or own-record access) and
 * answers 404 when either is missing.
 */
export async function requirePrintPage(): Promise<PageContext> {
  return pageContext();
}

/** A portal's landing page or layout, which needs no particular permission beyond reaching that portal. */
export async function requirePortal(portal: PortalKind): Promise<PageContext> {
  const ctx = await pageContext();
  if (ctx.portal !== portal) redirect(PORTAL_HOME[ctx.portal]);
  return ctx;
}
