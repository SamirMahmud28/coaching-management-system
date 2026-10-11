import { inArray } from "drizzle-orm";
import { z } from "zod";
import { platformUsers, users } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { handle, json, parseBody, parseQuery, pathId } from "../../core/http/respond";
import { MODULE_KEYS } from "../../core/modules/registry";
import type { PermissionName } from "../../core/rbac/catalog";
import type { HostConfig } from "../../core/tenancy/host";
import { queryTenantAuditLog } from "../audit/service";
import type { TenantAuth } from "../auth/tenant-auth";
import { withAuthorization } from "../authorization/service";
import { createModuleRequest, instituteModuleOverview } from "../entitlements/service";
import { createStaffUser, listRoles, listUsers, resetUserPassword, setUserDisabled, setUserRoles } from "./users";

export interface InstituteHttpDeps {
  db: Db;
  auth: TenantAuth;
  host: HostConfig;
}

const moduleRequestBody = z.object({ module_key: z.enum(MODULE_KEYS), note: z.string().trim().min(1).max(1000).optional() });
const auditQuery = z.object({
  actor_type: z.enum(["TENANT_USER", "PLATFORM_USER"]).optional(),
  action: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().positive().optional(),
});
const newUserBody = z.object({
  name: z.string().max(100),
  email: z.string().max(254).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  role_ids: z.array(z.uuid()),
  temporary_password: z.string().max(200),
});
const rolesBody = z.object({ role_ids: z.array(z.uuid()) });
const statusBody = z.object({ disabled: z.boolean() });
const resetBody = z.object({ temporary_password: z.string().max(200) });

export function createInstituteHandlers({ db, auth, host }: InstituteHttpDeps) {
  const authorize = async (request: Request, permission: PermissionName) => {
    const ctx = await withAuthorization({ db, auth, headers: request.headers, host, method: request.method, permission });
    return { ctx, actor: { tenantId: ctx.tenant.id, userId: ctx.userId } };
  };

  return {
    // GET /api/v1/modules
    listModules: (request: Request) =>
      handle(async () => {
        const { actor } = await authorize(request, "modules.view");
        return json({ items: await instituteModuleOverview(db, actor.tenantId) });
      }),

    // POST /api/v1/module-requests — only a Platform Admin switches modules on; an institute may ask
    requestModule: (request: Request) =>
      handle(async () => {
        const { actor } = await authorize(request, "modules.view");
        const body = await parseBody(request, moduleRequestBody);
        return json(await createModuleRequest(db, { tenantId: actor.tenantId, moduleKey: body.module_key, requestedBy: actor.userId, note: body.note }), 201);
      }),

    // GET /api/v1/audit-log
    auditLog: (request: Request) =>
      handle(async () => {
        const { actor } = await authorize(request, "audit.view");
        const query = parseQuery(request, auditQuery);
        const page = await queryTenantAuditLog(db, {
          tenantId: actor.tenantId,
          actorType: query.actor_type,
          action: query.action,
          page: query.page,
          pageSize: query.page_size,
        });
        // Actor names: this institute's users, and platform admins for platform actions.
        const userIds = [...new Set(page.items.map((r) => r.userId).filter((v): v is string => !!v))];
        const platformUserIds = [...new Set(page.items.map((r) => r.platformUserId).filter((v): v is string => !!v))];
        const [userRows, platformUserRows] = await Promise.all([
          userIds.length ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds)) : [],
          platformUserIds.length ? db.select({ id: platformUsers.id, name: platformUsers.name }).from(platformUsers).where(inArray(platformUsers.id, platformUserIds)) : [],
        ]);
        const actorName = new Map([...userRows, ...platformUserRows].map((r) => [r.id, r.name]));
        return json({ ...page, items: page.items.map((row) => ({ ...row, actorName: actorName.get((row.userId ?? row.platformUserId)!) ?? null })) });
      }),

    // GET /api/v1/roles
    listRoles: (request: Request) =>
      handle(async () => {
        const { actor } = await authorize(request, "users.view");
        return json({ items: await listRoles(db, actor.tenantId) });
      }),

    // GET /api/v1/users
    listUsers: (request: Request) =>
      handle(async () => {
        const { actor } = await authorize(request, "users.view");
        return json({ items: await listUsers(db, actor.tenantId) });
      }),

    // POST /api/v1/users
    createUser: (request: Request) =>
      handle(async () => {
        const { actor } = await authorize(request, "users.manage");
        const b = await parseBody(request, newUserBody);
        return json(await createStaffUser(db, actor, { name: b.name, email: b.email, phone: b.phone, roleIds: b.role_ids, temporaryPassword: b.temporary_password }), 201);
      }),

    // PUT /api/v1/users/:id/roles
    setRoles: (request: Request, params: { id: string }) =>
      handle(async () => {
        const { actor } = await authorize(request, "users.manage");
        const b = await parseBody(request, rolesBody);
        await setUserRoles(db, actor, pathId(params.id, "USER"), b.role_ids);
        return new Response(null, { status: 204 });
      }),

    // PATCH /api/v1/users/:id/status
    setStatus: (request: Request, params: { id: string }) =>
      handle(async () => {
        const { actor } = await authorize(request, "users.manage");
        const b = await parseBody(request, statusBody);
        return json(await setUserDisabled(db, actor, pathId(params.id, "USER"), b.disabled));
      }),

    // POST /api/v1/users/:id/reset-password
    resetPassword: (request: Request, params: { id: string }) =>
      handle(async () => {
        const { actor } = await authorize(request, "users.manage");
        const b = await parseBody(request, resetBody);
        return json(await resetUserPassword(db, actor, pathId(params.id, "USER"), b.temporary_password));
      }),
  };
}

export type InstituteHandlers = ReturnType<typeof createInstituteHandlers>;
