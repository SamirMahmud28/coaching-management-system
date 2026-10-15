import { z } from "zod";
import { todayInDhaka } from "@/lib/dates";
import type { Db } from "../../core/db/types";
import { handle, json, parseQuery } from "../../core/http/respond";
import type { PermissionName } from "../../core/rbac/catalog";
import type { HostConfig } from "../../core/tenancy/host";
import type { TenantAuth } from "../auth/tenant-auth";
import { authenticateTenantRequest, withAuthorization } from "../authorization/service";
import * as dashboard from "./service";

export interface DashboardHttpDeps {
  db: Db;
  auth: TenantAuth;
  host: HostConfig;
}

const periodQuery = z.object({ period: z.enum(["TODAY", "WEEK", "MONTH"]).default("TODAY") });
const dateQuery = z.object({ date: z.string().optional() });
const yearQuery = z.object({ year: z.coerce.number().int().optional() });

/**
 * The dashboard's API (U3, D163). Single-module widgets go through the guard with their own permission; the composite
 * ones (summary, pending actions, coming up, set-up) only need a signed-in user of the institute and include each
 * section only for the permissions held, which are already limited to the institute's active modules.
 */
export function createDashboardHandlers({ db, auth, host }: DashboardHttpDeps) {
  const authorize = async (request: Request, permission: PermissionName): Promise<dashboard.DashboardViewer> => {
    const ctx = await withAuthorization({ db, auth, headers: request.headers, host, method: request.method, permission });
    return { tenantId: ctx.tenant.id, userId: ctx.userId, permissions: ctx.permissions };
  };
  const signedIn = async (request: Request): Promise<dashboard.DashboardViewer> => {
    const ctx = await authenticateTenantRequest({ db, auth, headers: request.headers, host, method: request.method, module: "core" });
    return { tenantId: ctx.tenant.id, userId: ctx.userId, permissions: ctx.permissions };
  };

  return {
    // GET /api/v1/dashboard/summary — KPI figures, each only with its permission
    summary: (request: Request) =>
      handle(async () => json(await dashboard.summary(db, await signedIn(request)))),

    // GET /api/v1/dashboard/attendance?period=TODAY|WEEK|MONTH
    attendance: (request: Request) =>
      handle(async () => {
        const viewer = await authorize(request, "attendance.report.view");
        const q = parseQuery(request, periodQuery);
        return json(await dashboard.batchAttendance(db, viewer, q.period));
      }),

    // GET /api/v1/dashboard/classes?date=
    classes: (request: Request) =>
      handle(async () => {
        const viewer = await authorize(request, "attendance.view");
        const q = parseQuery(request, dateQuery);
        return json(await dashboard.todaysClasses(db, viewer, q.date));
      }),

    // GET /api/v1/dashboard/fees?year=
    fees: (request: Request) =>
      handle(async () => {
        const viewer = await authorize(request, "fees.report.view");
        const q = parseQuery(request, yearQuery);
        return json(await dashboard.feeMonths(db, viewer.tenantId, q.year ?? Number(todayInDhaka().slice(0, 4))));
      }),

    // GET /api/v1/dashboard/attention — pending actions, each only for those who can act on it
    attention: (request: Request) =>
      handle(async () => json({ items: await dashboard.attention(db, await signedIn(request)) })),

    // GET /api/v1/dashboard/upcoming — exams, holidays and class changes in the next 14 days
    upcoming: (request: Request) =>
      handle(async () => json({ items: await dashboard.upcoming(db, await signedIn(request)) })),

    // GET /api/v1/dashboard/setup — a new institute's first steps
    setup: (request: Request) =>
      handle(async () => json(await dashboard.setupChecklist(db, await authorize(request, "academic.manage")))),
  };
}
