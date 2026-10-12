import { z } from "zod";
import type { Db } from "../../core/db/types";
import { handle, json, parseBody, parseQuery, pathId } from "../../core/http/respond";
import type { PermissionName } from "../../core/rbac/catalog";
import type { HostConfig } from "../../core/tenancy/host";
import type { TenantAuth } from "../auth/tenant-auth";
import { withAuthorization } from "../authorization/service";
import { listAssignableInstructors } from "../instructors/service";
import * as service from "./service";

export interface AcademicHttpDeps {
  db: Db;
  auth: TenantAuth;
  host: HostConfig;
}

const status = z.enum(["ACTIVE", "ARCHIVED"]);
const courseFields = {
  name: z.string().max(100),
  code: z.string().max(10),
  description: z.string().max(1000).nullable().optional(),
  due_day: z.number().int().nullable().optional(),
};
const createCourseBody = z.object(courseFields);
const updateCourseBody = z.object(courseFields).partial();
const statusBody = z.object({ status });
const nameBody = z.object({ name: z.string().max(100) });
const renameBody = z.object({ name: z.string().max(100).optional(), status: status.optional() });
const courseListQuery = z.object({ status: status.optional() });
const batchListQuery = z.object({ course_id: z.uuid().optional(), status: status.optional() });
const batchSubjectBody = z.object({ subject_id: z.uuid() });
const instructorsBody = z.object({ instructor_ids: z.array(z.uuid()).max(20) });
const slotBody = z.object({ weekday: z.enum(service.WEEKDAYS), starts_at: z.string().max(8), ends_at: z.string().max(8) });

export function createAcademicHandlers({ db, auth, host }: AcademicHttpDeps) {
  const authorize = async (request: Request, permission: PermissionName) => {
    const ctx = await withAuthorization({ db, auth, headers: request.headers, host, method: request.method, permission });
    return { tenantId: ctx.tenant.id, userId: ctx.userId };
  };
  const noContent = () => new Response(null, { status: 204 });

  return {
    // GET /api/v1/courses
    listCourses: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "academic.view");
        const q = parseQuery(request, courseListQuery);
        return json(await service.listCourses(db, actor.tenantId, { status: q.status }));
      }),

    // POST /api/v1/courses
    createCourse: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "academic.manage");
        const b = await parseBody(request, createCourseBody);
        return json(await service.createCourse(db, actor, { name: b.name, code: b.code, description: b.description, dueDay: b.due_day }), 201);
      }),

    // GET /api/v1/courses/:id
    getCourse: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "academic.view");
        return json(await service.getCourse(db, actor.tenantId, pathId(params.id, "COURSE")));
      }),

    // PATCH /api/v1/courses/:id
    updateCourse: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "academic.manage");
        const b = await parseBody(request, updateCourseBody);
        return json(await service.updateCourse(db, actor, pathId(params.id, "COURSE"), { name: b.name, code: b.code, description: b.description, dueDay: b.due_day }));
      }),

    // PATCH /api/v1/courses/:id/status
    setCourseStatus: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "academic.manage");
        const b = await parseBody(request, statusBody);
        return json(await service.setCourseStatus(db, actor, pathId(params.id, "COURSE"), b.status));
      }),

    // DELETE /api/v1/courses/:id
    deleteCourse: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "academic.manage");
        await service.deleteCourse(db, actor, pathId(params.id, "COURSE"));
        return noContent();
      }),

    // POST /api/v1/courses/:id/subjects
    createSubject: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "academic.manage");
        const b = await parseBody(request, nameBody);
        return json(await service.createSubject(db, actor, pathId(params.id, "COURSE"), b), 201);
      }),

    // PATCH /api/v1/subjects/:id
    updateSubject: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "academic.manage");
        const b = await parseBody(request, renameBody);
        return json(await service.updateSubject(db, actor, pathId(params.id, "SUBJECT"), b));
      }),

    // DELETE /api/v1/subjects/:id
    deleteSubject: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "academic.manage");
        await service.deleteSubject(db, actor, pathId(params.id, "SUBJECT"));
        return noContent();
      }),

    // GET /api/v1/batches
    listBatches: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "academic.view");
        const q = parseQuery(request, batchListQuery);
        return json(await service.listBatches(db, actor.tenantId, { courseId: q.course_id, status: q.status }));
      }),

    // POST /api/v1/courses/:id/batches
    createBatch: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "academic.manage");
        const b = await parseBody(request, nameBody);
        return json(await service.createBatch(db, actor, pathId(params.id, "COURSE"), b), 201);
      }),

    // GET /api/v1/batches/:id
    getBatch: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "academic.view");
        return json(await service.getBatch(db, actor.tenantId, pathId(params.id, "BATCH")));
      }),

    // PATCH /api/v1/batches/:id
    updateBatch: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "academic.manage");
        const b = await parseBody(request, renameBody);
        return json(await service.updateBatch(db, actor, pathId(params.id, "BATCH"), b));
      }),

    // DELETE /api/v1/batches/:id
    deleteBatch: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "academic.manage");
        await service.deleteBatch(db, actor, pathId(params.id, "BATCH"));
        return noContent();
      }),

    // POST /api/v1/batches/:id/subjects
    addBatchSubject: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "academic.manage");
        const b = await parseBody(request, batchSubjectBody);
        return json(await service.addBatchSubject(db, actor, pathId(params.id, "BATCH"), b.subject_id), 201);
      }),

    // DELETE /api/v1/batch-subjects/:id
    removeBatchSubject: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "academic.manage");
        await service.removeBatchSubject(db, actor, pathId(params.id, "BATCH_SUBJECT"));
        return noContent();
      }),

    // PUT /api/v1/batch-subjects/:id/instructors
    setInstructors: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "academic.manage");
        const b = await parseBody(request, instructorsBody);
        await service.setBatchSubjectInstructors(db, actor, pathId(params.id, "BATCH_SUBJECT"), b.instructor_ids);
        return noContent();
      }),

    // POST /api/v1/batch-subjects/:id/slots
    addSlot: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "academic.manage");
        const b = await parseBody(request, slotBody);
        return json(await service.addScheduleSlot(db, actor, pathId(params.id, "BATCH_SUBJECT"), { weekday: b.weekday, startsAt: b.starts_at, endsAt: b.ends_at }), 201);
      }),

    // DELETE /api/v1/schedule-slots/:id
    removeSlot: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "academic.manage");
        await service.removeScheduleSlot(db, actor, pathId(params.id, "SCHEDULE_SLOT"));
        return noContent();
      }),

    // GET /api/v1/academic/assignable-instructors — the picker for who teaches a batch subject
    assignableInstructors: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "academic.manage");
        return json(await listAssignableInstructors(db, actor.tenantId));
      }),
  };
}

export type AcademicHandlers = ReturnType<typeof createAcademicHandlers>;
