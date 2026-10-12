import { z } from "zod";
import { todayInDhaka } from "@/lib/dates";
import type { Db } from "../../core/db/types";
import { handle, json, parseBody, parseQuery, pathId } from "../../core/http/respond";
import type { PermissionName } from "../../core/rbac/catalog";
import type { HostConfig } from "../../core/tenancy/host";
import type { TenantAuth } from "../auth/tenant-auth";
import { withAuthorization } from "../authorization/service";
import * as registers from "./registers";

export interface AttendanceHttpDeps {
  db: Db;
  auth: TenantAuth;
  host: HostConfig;
}

const date = z.string().max(10);
const time = z.string().max(8);
const dayQuery = z.object({ date: date.optional() });
const classQuery = z.object({ date, starts_at: time });
const status = z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]);
const registerBody = z.object({
  date,
  starts_at: time,
  marks: z.array(z.object({ student_id: z.uuid(), status })).max(1000),
  reason: z.string().max(300).nullable().optional(),
});
const notHeldBody = z.object({ date, starts_at: time, reason: z.string().max(300) });
const extraBody = z.object({ date, starts_at: time, ends_at: time });

export function createAttendanceHandlers({ db, auth, host }: AttendanceHttpDeps) {
  const authorize = async (request: Request, permission: PermissionName) => {
    const ctx = await withAuthorization({ db, auth, headers: request.headers, host, method: request.method, permission });
    return { tenantId: ctx.tenant.id, userId: ctx.userId, permissions: ctx.permissions };
  };

  return {
    // GET /api/v1/attendance/classes?date= — the viewer's classes that day (today by default)
    classes: (request: Request) =>
      handle(async () => {
        const viewer = await authorize(request, "attendance.view");
        const q = parseQuery(request, dayQuery);
        const day = q.date ?? todayInDhaka();
        const [classes, subjects] = await Promise.all([registers.classesOn(db, viewer, day), registers.registerSubjects(db, viewer)]);
        return json({ date: day, today: todayInDhaka(), classes, subjects });
      }),

    // GET /api/v1/attendance/batch-subjects/:id/register?date=&starts_at=
    getRegister: (request: Request, params: { id: string }) =>
      handle(async () => {
        const viewer = await authorize(request, "attendance.view");
        const q = parseQuery(request, classQuery);
        return json(await registers.getRegister(db, viewer, { batchSubjectId: pathId(params.id, "BATCH_SUBJECT"), date: q.date, startsAt: q.starts_at }));
      }),

    // PUT /api/v1/attendance/batch-subjects/:id/register
    saveRegister: (request: Request, params: { id: string }) =>
      handle(async () => {
        const viewer = await authorize(request, "attendance.take");
        const b = await parseBody(request, registerBody);
        return json(
          await registers.saveRegister(db, viewer, {
            batchSubjectId: pathId(params.id, "BATCH_SUBJECT"),
            date: b.date,
            startsAt: b.starts_at,
            marks: b.marks.map((m) => ({ studentId: m.student_id, status: m.status })),
            reason: b.reason,
          }),
        );
      }),

    // POST /api/v1/attendance/batch-subjects/:id/not-held
    markNotHeld: (request: Request, params: { id: string }) =>
      handle(async () => {
        const viewer = await authorize(request, "attendance.take");
        const b = await parseBody(request, notHeldBody);
        return json(await registers.markNotHeld(db, viewer, { batchSubjectId: pathId(params.id, "BATCH_SUBJECT"), date: b.date, startsAt: b.starts_at, reason: b.reason }));
      }),

    // POST /api/v1/attendance/batch-subjects/:id/extra-classes
    addExtraClass: (request: Request, params: { id: string }) =>
      handle(async () => {
        const viewer = await authorize(request, "attendance.take");
        const b = await parseBody(request, extraBody);
        return json(await registers.addExtraClass(db, viewer, { batchSubjectId: pathId(params.id, "BATCH_SUBJECT"), date: b.date, startsAt: b.starts_at, endsAt: b.ends_at }), 201);
      }),
  };
}
