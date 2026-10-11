import { z } from "zod";
import type { Db } from "../../core/db/types";
import { handle, json, parseBody, parseQuery, pathId } from "../../core/http/respond";
import type { PermissionName } from "../../core/rbac/catalog";
import type { HostConfig } from "../../core/tenancy/host";
import type { TenantAuth } from "../auth/tenant-auth";
import { withAuthorization } from "../authorization/service";
import * as service from "./service";

export interface InstructorsHttpDeps {
  db: Db;
  auth: TenantAuth;
  host: HostConfig;
}

const gender = z.enum(["MALE", "FEMALE", "OTHER"]);
const fields = {
  full_name: z.string().max(100),
  email: z.string().max(254).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  gender: gender.nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  photo_file_id: z.uuid().nullable().optional(),
};
const createBody = z.object({ ...fields, temporary_password: z.string().max(200) });
const updateBody = z.object(fields).partial();
const statusBody = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) });
const resetBody = z.object({ temporary_password: z.string().max(200) });
const listQuery = z.object({
  q: z.string().trim().min(1).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().positive().optional(),
});

const toInput = (b: z.infer<typeof updateBody>): Partial<service.InstructorInput> => ({
  fullName: b.full_name,
  email: b.email,
  phone: b.phone,
  gender: b.gender,
  address: b.address,
  photoFileId: b.photo_file_id,
});

export function createInstructorHandlers({ db, auth, host }: InstructorsHttpDeps) {
  const authorize = async (request: Request, permission: PermissionName) => {
    const ctx = await withAuthorization({ db, auth, headers: request.headers, host, method: request.method, permission });
    return { tenantId: ctx.tenant.id, userId: ctx.userId };
  };

  return {
    // GET /api/v1/instructors
    list: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "instructors.view");
        const q = parseQuery(request, listQuery);
        return json(await service.listInstructors(db, actor.tenantId, { q: q.q, status: q.status, page: q.page, pageSize: q.page_size }));
      }),

    // GET /api/v1/instructors/:id
    get: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "instructors.view");
        return json(await service.getInstructor(db, actor.tenantId, pathId(params.id, "INSTRUCTOR")));
      }),

    // POST /api/v1/instructors
    create: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "instructors.manage");
        const b = await parseBody(request, createBody);
        return json(await service.createInstructor(db, actor, { ...(toInput(b) as service.InstructorInput), temporaryPassword: b.temporary_password }), 201);
      }),

    // PATCH /api/v1/instructors/:id
    update: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "instructors.manage");
        const b = await parseBody(request, updateBody);
        return json(await service.updateInstructor(db, actor, pathId(params.id, "INSTRUCTOR"), toInput(b)));
      }),

    // PATCH /api/v1/instructors/:id/status
    setStatus: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "instructors.status");
        const b = await parseBody(request, statusBody);
        return json(await service.setInstructorStatus(db, actor, pathId(params.id, "INSTRUCTOR"), b.status));
      }),

    // POST /api/v1/instructors/:id/reset-password
    resetPassword: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "instructors.manage");
        const b = await parseBody(request, resetBody);
        return json(await service.resetInstructorPassword(db, actor, pathId(params.id, "INSTRUCTOR"), b.temporary_password));
      }),
  };
}

export type InstructorHandlers = ReturnType<typeof createInstructorHandlers>;
