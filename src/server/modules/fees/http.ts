import { z } from "zod";
import type { Db } from "../../core/db/types";
import { handle, json, parseBody, parseQuery, pathId } from "../../core/http/respond";
import type { PermissionName } from "../../core/rbac/catalog";
import type { HostConfig } from "../../core/tenancy/host";
import type { TenantAuth } from "../auth/tenant-auth";
import { withAuthorization } from "../authorization/service";
import * as setup from "./setup";

export interface FeesHttpDeps {
  db: Db;
  auth: TenantAuth;
  host: HostConfig;
}

// Amounts travel as taka strings ("2000.50"), never floats.
const amount = z.string().max(16);
const itemBody = z.object({ course_id: z.uuid(), kind: z.enum(["ADMISSION", "MONTHLY", "ONE_TIME"]), name: z.string().max(100), amount });
const itemUpdateBody = z.object({ name: z.string().max(100).optional(), amount: amount.optional() });
const statusBody = z.object({ status: z.enum(["ACTIVE", "ARCHIVED"]) });
const itemQuery = z.object({ course_id: z.uuid().optional(), status: z.enum(["ACTIVE", "ARCHIVED"]).optional() });
const studentAmountBody = z.object({ fee_item_id: z.uuid(), amount, reason: z.string().max(300) });
const settingsBody = z.object({ receipt_prefix: z.string().max(10) });

export function createFeesHandlers({ db, auth, host }: FeesHttpDeps) {
  const authorize = async (request: Request, permission: PermissionName) => {
    const ctx = await withAuthorization({ db, auth, headers: request.headers, host, method: request.method, permission });
    return { tenantId: ctx.tenant.id, userId: ctx.userId, permissions: ctx.permissions };
  };
  const noContent = () => new Response(null, { status: 204 });

  return {
    // GET /api/v1/fees/items
    listItems: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "fees.view");
        const q = parseQuery(request, itemQuery);
        return json(await setup.listFeeItems(db, actor.tenantId, { courseId: q.course_id, status: q.status }));
      }),

    // POST /api/v1/fees/items
    createItem: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "fees.configure");
        const b = await parseBody(request, itemBody);
        return json(await setup.createFeeItem(db, actor, { courseId: b.course_id, kind: b.kind, name: b.name, amount: b.amount }), 201);
      }),

    // PATCH /api/v1/fees/items/:id
    updateItem: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "fees.configure");
        const b = await parseBody(request, itemUpdateBody);
        return json(await setup.updateFeeItem(db, actor, pathId(params.id, "FEE_ITEM"), b));
      }),

    // PATCH /api/v1/fees/items/:id/status
    setItemStatus: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "fees.configure");
        const b = await parseBody(request, statusBody);
        return json(await setup.setFeeItemStatus(db, actor, pathId(params.id, "FEE_ITEM"), b.status));
      }),

    // DELETE /api/v1/fees/items/:id
    deleteItem: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "fees.configure");
        await setup.deleteFeeItem(db, actor, pathId(params.id, "FEE_ITEM"));
        return noContent();
      }),

    // GET /api/v1/students/:id/fee-amounts
    studentAmounts: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "fees.view");
        return json(await setup.listStudentFeeAmounts(db, actor.tenantId, pathId(params.id, "STUDENT")));
      }),

    // PUT /api/v1/students/:id/fee-amounts
    setStudentAmount: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "fees.adjust");
        const b = await parseBody(request, studentAmountBody);
        return json(await setup.setStudentFeeAmount(db, actor, pathId(params.id, "STUDENT"), { feeItemId: b.fee_item_id, amount: b.amount, reason: b.reason }));
      }),

    // DELETE /api/v1/student-fee-amounts/:id
    removeStudentAmount: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "fees.adjust");
        await setup.removeStudentFeeAmount(db, actor, pathId(params.id, "STUDENT_FEE_AMOUNT"));
        return noContent();
      }),

    // GET /api/v1/fees/settings
    getSettings: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "fees.view");
        return json(await setup.getFeeSettings(db, actor.tenantId));
      }),

    // PUT /api/v1/fees/settings
    saveSettings: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "fees.configure");
        const b = await parseBody(request, settingsBody);
        return json(await setup.saveFeeSettings(db, actor, { receiptPrefix: b.receipt_prefix }));
      }),
  };
}

export type FeesHandlers = ReturnType<typeof createFeesHandlers>;
