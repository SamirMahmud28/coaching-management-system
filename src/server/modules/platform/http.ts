import { z } from "zod";
import { APP_THEME_KEYS } from "@/lib/app-themes";
import type { Db } from "../../core/db/types";
import { handle, json, parseBody, parseQuery, pathId } from "../../core/http/respond";
import { MODULE_KEYS } from "../../core/modules/registry";
import type { PlatformAuth } from "../auth/platform-auth";
import { requirePlatformAdmin } from "./guard";
import {
  checkSubdomainAvailability,
  createPlatformAdmin,
  createTenant,
  disablePlatformAdmin,
  dismissModuleRequestWithNote,
  enablePlatformAdmin,
  getTenant,
  listModuleRequestQueue,
  listPlatformAdmins,
  listPlatformAudit,
  listTenantUsers,
  listTenants,
  setPlatformAdminTheme,
  setTenantAppTheme,
  setTenantPaidUntil,
  transferOwnership,
  transitionTenantStatus,
  updateTenantModules,
} from "./service";

// A factory over its dependencies so tests run the same handlers against the test database.

export interface PlatformHttpDeps {
  db: Db;
  auth: PlatformAuth;
  origin: string;
}

type Params<K extends string> = Record<K, string>;

const moduleKey = z.enum(MODULE_KEYS);
const pagination = {
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().positive().optional(),
};

const listTenantsQuery = z.object({
  q: z.string().trim().min(1).optional(),
  status: z.enum(["PENDING", "ACTIVE", "SUSPENDED", "DEACTIVATED"]).optional(),
  ...pagination,
});
const checkSubdomainQuery = z.object({ subdomain: z.string() });
const createTenantBody = z.object({
  name: z.string(),
  subdomain: z.string(),
  starter_modules: z.array(moduleKey).default([]),
  owner_name: z.string(),
  owner_email: z.string(),
  temporary_password: z.string(),
});
const tenantStatusBody = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "DEACTIVATED"]),
  reason: z.string().optional(),
});
const tenantModulesBody = z.object({
  changes: z.array(z.object({ module_key: moduleKey, enabled: z.boolean() })).min(1),
});
const transferOwnershipBody = z.object({ new_owner_user_id: z.string() });
const paidUntilBody = z.object({ paid_until: z.string().nullable() });
const moduleRequestsQuery = z.object({
  status: z.enum(["PENDING", "FULFILLED", "DISMISSED"]).optional(),
  tenant_id: z.uuid().optional(),
});
const noteBody = z.object({ note: z.string() });
const listAdminsQuery = z.object({
  q: z.string().trim().min(1).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
});
const createAdminBody = z.object({ name: z.string(), email: z.string(), temporary_password: z.string() });
const appThemeBody = z.object({ app_theme: z.enum(APP_THEME_KEYS), paper_background: z.boolean().nullable().optional() });
const adminStatusBody = z.object({ status: z.enum(["ACTIVE", "DISABLED"]) });
const auditQuery = z.object({
  tenant_id: z.uuid().optional(),
  actor_type: z.enum(["TENANT_USER", "PLATFORM_USER"]).optional(),
  action: z.string().trim().min(1).optional(),
  ...pagination,
});

export function createPlatformHandlers({ db, auth, origin }: PlatformHttpDeps) {
  const admin = (request: Request) => requirePlatformAdmin(auth, request, origin);

  return {
    // GET /api/platform/tenants
    listTenants: (request: Request) =>
      handle(async () => {
        await admin(request);
        const query = parseQuery(request, listTenantsQuery);
        return json(await listTenants(db, { q: query.q, status: query.status, page: query.page, pageSize: query.page_size }));
      }),

    // GET /api/platform/tenants/check-subdomain?subdomain=
    checkSubdomain: (request: Request) =>
      handle(async () => {
        await admin(request);
        const { subdomain } = parseQuery(request, checkSubdomainQuery);
        return json(await checkSubdomainAvailability(db, subdomain));
      }),

    // POST /api/platform/tenants
    createTenant: (request: Request) =>
      handle(async () => {
        const session = await admin(request);
        const body = await parseBody(request, createTenantBody);
        const result = await createTenant(
          db,
          {
            name: body.name,
            subdomain: body.subdomain,
            starterModuleKeys: body.starter_modules,
            ownerName: body.owner_name,
            ownerEmail: body.owner_email,
            temporaryPassword: body.temporary_password,
          },
          { platformUserId: session.platformUserId },
        );
        return json(result, 201);
      }),

    // GET /api/platform/tenants/:id
    getTenant: (request: Request, params: Params<"id">) =>
      handle(async () => {
        await admin(request);
        return json(await getTenant(db, pathId(params.id, "TENANT")));
      }),

    // GET /api/platform/tenants/:id/users
    listTenantUsers: (request: Request, params: Params<"id">) =>
      handle(async () => {
        await admin(request);
        return json({ items: await listTenantUsers(db, pathId(params.id, "TENANT")) });
      }),

    // PATCH /api/platform/tenants/:id/status
    setTenantStatus: (request: Request, params: Params<"id">) =>
      handle(async () => {
        const session = await admin(request);
        const tenantId = pathId(params.id, "TENANT");
        const body = await parseBody(request, tenantStatusBody);
        return json(
          await transitionTenantStatus(db, { tenantId, status: body.status, reason: body.reason, platformUserId: session.platformUserId }),
        );
      }),

    // PATCH /api/platform/tenants/:id/modules
    setTenantModules: (request: Request, params: Params<"id">) =>
      handle(async () => {
        const session = await admin(request);
        const tenantId = pathId(params.id, "TENANT");
        const body = await parseBody(request, tenantModulesBody);
        return json(
          await updateTenantModules(db, {
            tenantId,
            changes: body.changes.map((c) => ({ key: c.module_key, enabled: c.enabled })),
            platformUserId: session.platformUserId,
          }),
        );
      }),

    // PATCH /api/platform/tenants/:id/paid-until — display only (D4)
    setTenantPaidUntil: (request: Request, params: Params<"id">) =>
      handle(async () => {
        const session = await admin(request);
        const tenantId = pathId(params.id, "TENANT");
        const body = await parseBody(request, paidUntilBody);
        return json(await setTenantPaidUntil(db, { tenantId, paidUntil: body.paid_until, platformUserId: session.platformUserId }));
      }),

    // PATCH /api/platform/tenants/:id/app-theme — the institute's office and portal theme (D157)
    setTenantAppTheme: (request: Request, params: Params<"id">) =>
      handle(async () => {
        const session = await admin(request);
        const tenantId = pathId(params.id, "TENANT");
        const body = await parseBody(request, appThemeBody);
        return json(await setTenantAppTheme(db, { tenantId, theme: body.app_theme, paper: body.paper_background, platformUserId: session.platformUserId }));
      }),

    // PATCH /api/platform/me/app-theme — this admin's own panel theme (D157)
    setMyAppTheme: (request: Request) =>
      handle(async () => {
        const session = await admin(request);
        const body = await parseBody(request, appThemeBody);
        return json(await setPlatformAdminTheme(db, { platformUserId: session.platformUserId, theme: body.app_theme }));
      }),

    // POST /api/platform/tenants/:id/transfer-ownership
    transferOwnership: (request: Request, params: Params<"id">) =>
      handle(async () => {
        const session = await admin(request);
        const tenantId = pathId(params.id, "TENANT");
        const body = await parseBody(request, transferOwnershipBody);
        return json(
          await transferOwnership(db, { tenantId, newOwnerUserId: body.new_owner_user_id, platformUserId: session.platformUserId }),
        );
      }),

    // GET /api/platform/module-requests
    listModuleRequests: (request: Request) =>
      handle(async () => {
        await admin(request);
        const query = parseQuery(request, moduleRequestsQuery);
        return json({ items: await listModuleRequestQueue(db, { status: query.status, tenantId: query.tenant_id }) });
      }),

    // POST /api/platform/module-requests/:id/dismiss
    dismissModuleRequest: (request: Request, params: Params<"id">) =>
      handle(async () => {
        const session = await admin(request);
        const requestId = pathId(params.id, "MODULE_REQUEST");
        const body = await parseBody(request, noteBody);
        return json(await dismissModuleRequestWithNote(db, { requestId, note: body.note, platformUserId: session.platformUserId }));
      }),

    // GET /api/platform/admins
    listAdmins: (request: Request) =>
      handle(async () => {
        await admin(request);
        const query = parseQuery(request, listAdminsQuery);
        return json({ items: await listPlatformAdmins(db, query) });
      }),

    // POST /api/platform/admins
    createAdmin: (request: Request) =>
      handle(async () => {
        const session = await admin(request);
        const body = await parseBody(request, createAdminBody);
        const created = await createPlatformAdmin(db, {
          name: body.name,
          email: body.email,
          temporaryPassword: body.temporary_password,
          platformUserId: session.platformUserId,
        });
        return json(
          { id: created.id, name: created.name, email: created.email, status: created.status, mustChangePassword: created.mustChangePassword },
          201,
        );
      }),

    // PATCH /api/platform/admins/:id/status
    setAdminStatus: (request: Request, params: Params<"id">) =>
      handle(async () => {
        const session = await admin(request);
        const id = pathId(params.id, "PLATFORM_USER");
        const { status } = await parseBody(request, adminStatusBody);
        const updated =
          status === "DISABLED"
            ? await disablePlatformAdmin(db, { id, platformUserId: session.platformUserId })
            : await enablePlatformAdmin(db, { id, platformUserId: session.platformUserId });
        return json({ id: updated.id, name: updated.name, email: updated.email, status: updated.status });
      }),

    // GET /api/platform/audit-log
    auditLog: (request: Request) =>
      handle(async () => {
        await admin(request);
        const query = parseQuery(request, auditQuery);
        return json(
          await listPlatformAudit(db, {
            tenantId: query.tenant_id,
            actorType: query.actor_type,
            action: query.action,
            page: query.page,
            pageSize: query.page_size,
          }),
        );
      }),
  };
}

export type PlatformHandlers = ReturnType<typeof createPlatformHandlers>;
