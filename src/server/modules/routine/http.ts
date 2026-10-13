import { z } from "zod";
import type { Db } from "../../core/db/types";
import { handle, json, parseBody, parseQuery, pathId } from "../../core/http/respond";
import type { PermissionName } from "../../core/rbac/catalog";
import type { HostConfig } from "../../core/tenancy/host";
import type { TenantAuth } from "../auth/tenant-auth";
import { withAuthorization } from "../authorization/service";
import * as lessons from "./lessons";
import * as routine from "./service";

export interface RoutineHttpDeps {
  db: Db;
  auth: TenantAuth;
  host: HostConfig;
}

const date = z.string().max(10);
const time = z.string().max(8);
const rangeQuery = z.object({ from: date.optional(), days: z.coerce.number().int().optional() });
const dayQuery = z.object({ date: date.optional() });
const changesQuery = z.object({ from: date.optional() });
const changeBody = z.object({
  batch_subject_id: z.uuid(),
  class_date: date,
  starts_at: time,
  kind: z.enum(["CANCEL", "RESCHEDULE", "SUBSTITUTE"]),
  reason: z.string().max(300).nullable().optional(),
  new_date: date.nullable().optional(),
  new_starts_at: time.nullable().optional(),
  new_ends_at: time.nullable().optional(),
  substitute_instructor_id: z.uuid().nullable().optional(),
});
const topicStatus = z.enum(["PENDING", "ONGOING", "COMPLETED"]);
const topicBody = z.object({ title: z.string().max(200), start_date: date.nullable().optional(), target_date: date.nullable().optional() });
const topicUpdateBody = z.object({
  title: z.string().max(200).optional(),
  start_date: date.nullable().optional(),
  target_date: date.nullable().optional(),
  status: topicStatus.optional(),
  completed_on: date.nullable().optional(),
});
const orderBody = z.object({ topic_ids: z.array(z.uuid()).max(200) });
const copyBody = z.object({ from_batch_subject_id: z.uuid() });
const holidayBody = z.object({ name: z.string().max(120), from_date: date, to_date: date.nullable().optional() });

export function createRoutineHandlers({ db, auth, host }: RoutineHttpDeps) {
  const authorize = async (request: Request, permission: PermissionName) => {
    const ctx = await withAuthorization({ db, auth, headers: request.headers, host, method: request.method, permission });
    return { tenantId: ctx.tenant.id, userId: ctx.userId, permissions: ctx.permissions };
  };
  const noContent = () => new Response(null, { status: 204 });

  return {
    // GET /api/v1/routine/options — the batches (and instructors) the viewer can see
    routineOptions: (request: Request) =>
      handle(async () => {
        const viewer = await authorize(request, "routine.view");
        return json(await routine.routineOptions(db, viewer));
      }),

    // GET /api/v1/routine/batches/:id?from=&days=
    batchWeek: (request: Request, params: { id: string }) =>
      handle(async () => {
        const viewer = await authorize(request, "routine.view");
        const q = parseQuery(request, rangeQuery);
        return json(await routine.batchWeek(db, viewer, pathId(params.id, "BATCH"), { from: q.from, days: q.days }));
      }),

    // GET /api/v1/routine/instructors/:id?from=&days=
    instructorWeek: (request: Request, params: { id: string }) =>
      handle(async () => {
        const viewer = await authorize(request, "routine.view");
        const q = parseQuery(request, rangeQuery);
        return json(await routine.instructorWeek(db, viewer, pathId(params.id, "INSTRUCTOR"), { from: q.from, days: q.days }));
      }),

    // GET /api/v1/routine/day?date=
    dayView: (request: Request) =>
      handle(async () => {
        const viewer = await authorize(request, "routine.view");
        return json(await routine.dayView(db, viewer, parseQuery(request, dayQuery).date));
      }),

    // GET /api/v1/routine/changes?from= — changes and holidays from a date (a week ago by default)
    listChanges: (request: Request) =>
      handle(async () => {
        const viewer = await authorize(request, "routine.view");
        return json(await routine.listChanges(db, viewer, parseQuery(request, changesQuery)));
      }),

    // POST /api/v1/routine/changes
    createChange: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "routine.manage");
        const b = await parseBody(request, changeBody);
        return json(
          await routine.createChange(db, actor, {
            batchSubjectId: b.batch_subject_id, classDate: b.class_date, startsAt: b.starts_at, kind: b.kind, reason: b.reason,
            newDate: b.new_date, newStartsAt: b.new_starts_at, newEndsAt: b.new_ends_at, substituteInstructorId: b.substitute_instructor_id,
          }),
          201,
        );
      }),

    // POST /api/v1/routine/changes/:id/withdraw
    withdrawChange: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "routine.manage");
        await routine.withdrawChange(db, actor, pathId(params.id, "ROUTINE_CHANGE"));
        return noContent();
      }),

    // POST /api/v1/routine/holidays
    createHoliday: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "routine.manage");
        const b = await parseBody(request, holidayBody);
        return json(await routine.createHoliday(db, actor, { name: b.name, fromDate: b.from_date, toDate: b.to_date }), 201);
      }),

    // GET /api/v1/lessons — every visible batch subject with its plan's progress
    lessonOverview: (request: Request) =>
      handle(async () => {
        const viewer = await authorize(request, "routine.view");
        return json(await lessons.lessonOverview(db, viewer));
      }),

    // GET /api/v1/lessons/:id — a batch subject's plan
    lessonPlan: (request: Request, params: { id: string }) =>
      handle(async () => {
        const viewer = await authorize(request, "routine.view");
        return json(await lessons.lessonPlan(db, viewer, pathId(params.id, "BATCH_SUBJECT")));
      }),

    // POST /api/v1/lessons/:id/topics
    addTopic: (request: Request, params: { id: string }) =>
      handle(async () => {
        const viewer = await authorize(request, "lessons.manage");
        const b = await parseBody(request, topicBody);
        return json(await lessons.addTopic(db, viewer, pathId(params.id, "BATCH_SUBJECT"), { title: b.title, startDate: b.start_date, targetDate: b.target_date }), 201);
      }),

    // PUT /api/v1/lessons/:id/order
    reorderTopics: (request: Request, params: { id: string }) =>
      handle(async () => {
        const viewer = await authorize(request, "lessons.manage");
        const b = await parseBody(request, orderBody);
        await lessons.reorderTopics(db, viewer, pathId(params.id, "BATCH_SUBJECT"), b.topic_ids);
        return noContent();
      }),

    // POST /api/v1/lessons/:id/copy — the office (routine.manage) copies another batch's plan (D118)
    copyPlan: (request: Request, params: { id: string }) =>
      handle(async () => {
        const viewer = await authorize(request, "routine.manage");
        const b = await parseBody(request, copyBody);
        return json(await lessons.copyPlan(db, viewer, pathId(params.id, "BATCH_SUBJECT"), b.from_batch_subject_id));
      }),

    // PATCH /api/v1/lesson-topics/:id
    updateTopic: (request: Request, params: { id: string }) =>
      handle(async () => {
        const viewer = await authorize(request, "lessons.manage");
        const b = await parseBody(request, topicUpdateBody);
        return json(
          await lessons.updateTopic(db, viewer, pathId(params.id, "LESSON_TOPIC"), {
            title: b.title, startDate: b.start_date, targetDate: b.target_date, status: b.status, completedOn: b.completed_on,
          }),
        );
      }),

    // DELETE /api/v1/lesson-topics/:id
    deleteTopic: (request: Request, params: { id: string }) =>
      handle(async () => {
        const viewer = await authorize(request, "lessons.manage");
        await lessons.deleteTopic(db, viewer, pathId(params.id, "LESSON_TOPIC"));
        return noContent();
      }),

    // POST /api/v1/routine/holidays/:id/withdraw
    withdrawHoliday: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "routine.manage");
        await routine.withdrawHoliday(db, actor, pathId(params.id, "HOLIDAY"));
        return noContent();
      }),
  };
}
