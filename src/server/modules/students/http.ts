import { z } from "zod";
import type { Db } from "../../core/db/types";
import { ForbiddenError } from "../../core/errors";
import { handle, json, parseBody, parseEditBody, parseQuery, pathId } from "../../core/http/respond";
import type { PermissionName } from "../../core/rbac/catalog";
import type { HostConfig } from "../../core/tenancy/host";
import type { TenantAuth } from "../auth/tenant-auth";
import { withAuthorization } from "../authorization/service";
import * as service from "./service";

export interface StudentsHttpDeps {
  db: Db;
  auth: TenantAuth;
  host: HostConfig;
}

const date = z.string().max(10);
const fields = {
  full_name: z.string().max(100),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  date_of_birth: date.nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  school_name: z.string().max(150).nullable().optional(),
  school_class: z.string().max(50).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  admin_note: z.string().max(1000).nullable().optional(),
  guardian_name: z.string().max(100),
  guardian_relation: z.enum(service.GUARDIAN_RELATIONS),
  guardian_phone: z.string().max(20),
  photo_file_id: z.uuid().nullable().optional(),
};
const admitBody = z.object({
  ...fields,
  admission_date: date.nullable().optional(),
  course_id: z.uuid().nullable().optional(),
  batch_ids: z.array(z.uuid()).max(20).optional(),
  student_code: z.string().max(30).nullable().optional(),
  temporary_password: z.string().max(200),
});
const updateBody = z.object(fields).partial();
// Set at admission (D15) or by their own action; an edit naming them is refused with the reason.
const LOCKED = {
  student_code: { reason: "The student ID is issued at admission and never changes." },
  admission_date: { reason: "The admission date sets the year in the student ID, so it can't change after admission." },
  course_id: { reason: "The admission course is fixed at admission; add or end batches instead." },
  status: { reason: "Change the status with the status action, which records a reason." },
};
const statusBody = z.object({ status: z.enum(["ACTIVE", "ON_HOLD", "COMPLETED", "LEFT"]), reason: z.string().max(500).nullable().optional() });
const resetBody = z.object({ temporary_password: z.string().max(200) });
const listQuery = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  status: z.enum(["ACTIVE", "ON_HOLD", "COMPLETED", "LEFT", "ALL"]).optional(),
  course_id: z.uuid().optional(),
  batch_id: z.uuid().optional(),
  no_batch: z.enum(["true"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().positive().optional(),
});
const membershipBody = z.object({ batch_id: z.uuid(), started_on: date.nullable().optional(), roll_number: z.string().max(10).nullable().optional() });
const rollBody = z.object({ roll_number: z.string().max(10).nullable() });
const endBody = z.object({ status: z.enum(["COMPLETED", "LEFT"]), ended_on: date.nullable().optional() });

const toFields = (b: z.infer<typeof updateBody>): Partial<service.StudentFields> => ({
  fullName: b.full_name,
  gender: b.gender,
  dateOfBirth: b.date_of_birth,
  phone: b.phone,
  schoolName: b.school_name,
  schoolClass: b.school_class,
  address: b.address,
  adminNote: b.admin_note,
  guardianName: b.guardian_name,
  guardianRelation: b.guardian_relation,
  guardianPhone: b.guardian_phone,
  photoFileId: b.photo_file_id,
});

/** Guardian and student mobile numbers and the address are for viewers with students.contact.view (D24). */
function withContacts<T extends { guardianPhone: string | null; phone: string | null; address?: string | null }>(row: T, canSee: boolean): T {
  return canSee ? row : { ...row, guardianPhone: null, phone: null, ...("address" in row ? { address: null } : {}) };
}

export function createStudentHandlers({ db, auth, host }: StudentsHttpDeps) {
  const authorize = async (request: Request, permission: PermissionName) => {
    const ctx = await withAuthorization({ db, auth, headers: request.headers, host, method: request.method, permission });
    return { tenantId: ctx.tenant.id, userId: ctx.userId, permissions: ctx.permissions };
  };
  const noContent = () => new Response(null, { status: 204 });

  return {
    // GET /api/v1/students
    list: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "students.view");
        const q = parseQuery(request, listQuery);
        const contacts = actor.permissions.has("students.contact.view");
        const page = await service.listStudents(db, actor.tenantId, {
          q: q.q, status: q.status, courseId: q.course_id, batchId: q.batch_id, noBatch: q.no_batch === "true", searchContacts: contacts, page: q.page, pageSize: q.page_size,
        });
        return json({ ...page, items: page.items.map((s) => withContacts(s, contacts)) });
      }),

    // POST /api/v1/students
    admit: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "students.create");
        const b = await parseBody(request, admitBody);
        if (b.batch_ids?.length && !actor.permissions.has("students.batches.manage")) throw new ForbiddenError("PERM_DENIED", "You don't have permission to do this.", { permission: "students.batches.manage" });
        const result = await service.admitStudent(db, actor, {
          ...(toFields(b) as service.StudentFields),
          admissionDate: b.admission_date, courseId: b.course_id, batchIds: b.batch_ids, studentCode: b.student_code, temporaryPassword: b.temporary_password,
        });
        return json({ ...result, student: withContacts(result.student, actor.permissions.has("students.contact.view")) }, 201);
      }),

    // GET /api/v1/students/:id
    get: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "students.view");
        const student = await service.getStudent(db, actor.tenantId, pathId(params.id, "STUDENT"));
        return json(withContacts(student, actor.permissions.has("students.contact.view")));
      }),

    // PATCH /api/v1/students/:id
    update: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "students.update");
        const b = await parseEditBody(request, updateBody, LOCKED);
        // Without contact access, contact fields can't be changed either (they'd be edited blind).
        if (!actor.permissions.has("students.contact.view") && (b.guardian_phone !== undefined || b.phone !== undefined || b.address !== undefined)) {
          throw new ForbiddenError("PERM_DENIED", "You don't have permission to do this.", { permission: "students.contact.view" });
        }
        const student = await service.updateStudent(db, actor, pathId(params.id, "STUDENT"), toFields(b));
        return json(withContacts(student, actor.permissions.has("students.contact.view")));
      }),

    // PATCH /api/v1/students/:id/status
    setStatus: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "students.status");
        const b = await parseBody(request, statusBody);
        const student = await service.setStudentStatus(db, actor, pathId(params.id, "STUDENT"), { status: b.status, reason: b.reason });
        return json(withContacts(student, actor.permissions.has("students.contact.view")));
      }),

    // POST /api/v1/students/:id/reset-password
    resetPassword: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "students.update");
        const b = await parseBody(request, resetBody);
        return json(await service.resetStudentPassword(db, actor, pathId(params.id, "STUDENT"), b.temporary_password));
      }),

    // POST /api/v1/students/:id/memberships
    addMembership: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "students.batches.manage");
        const b = await parseBody(request, membershipBody);
        return json(await service.addMembership(db, actor, pathId(params.id, "STUDENT"), { batchId: b.batch_id, startedOn: b.started_on, rollNumber: b.roll_number }), 201);
      }),

    // PATCH /api/v1/batch-memberships/:id
    setRoll: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "students.batches.manage");
        const b = await parseBody(request, rollBody);
        return json(await service.setMembershipRoll(db, actor, pathId(params.id, "BATCH_MEMBERSHIP"), b.roll_number));
      }),

    // POST /api/v1/batch-memberships/:id/end
    endMembership: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "students.batches.manage");
        const b = await parseBody(request, endBody);
        await service.endMembership(db, actor, pathId(params.id, "BATCH_MEMBERSHIP"), { status: b.status, endedOn: b.ended_on });
        return noContent();
      }),

    // GET /api/v1/batches/:id/students
    batchStudents: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "students.view");
        return json(await service.listBatchStudents(db, actor.tenantId, pathId(params.id, "BATCH")));
      }),
  };
}

export type StudentHandlers = ReturnType<typeof createStudentHandlers>;
