import { z } from "zod";
import type { Db } from "../../core/db/types";
import { handle, json, parseBody, parseQuery, pathId } from "../../core/http/respond";
import type { PermissionName } from "../../core/rbac/catalog";
import type { HostConfig } from "../../core/tenancy/host";
import type { TenantAuth } from "../auth/tenant-auth";
import { withAuthorization } from "../authorization/service";
import * as charges from "./charges";
import * as payments from "./payments";
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
const period = z.string().max(7).nullable().optional();
const previewBody = z.object({ fee_item_id: z.uuid(), period });
const generateBody = z.object({
  fee_item_id: z.uuid(),
  period,
  exclude: z.array(z.uuid()).max(5000).optional(),
  amounts: z.array(z.object({ student_id: z.uuid(), amount })).max(5000).optional(),
});
const reasonBody = z.object({ reason: z.string().max(300) });
const fineBody = z.object({ amount, reason: z.string().max(300), due_date: z.string().max(10).nullable().optional(), course_id: z.uuid().nullable().optional() });
const runsQuery = z.object({ fee_item_id: z.uuid().optional() });
const method = z.enum(payments.PAYMENT_METHODS);
const date = z.string().max(10).nullable().optional();
const collectBody = z.object({
  charge_ids: z.array(z.uuid()).min(1).max(100),
  paid_on: date,
  method,
  reference: z.string().max(100).nullable().optional(),
  remarks: z.string().max(500).nullable().optional(),
  idempotency_key: z.uuid(),
});
const waiverBody = z.object({ kind: z.enum(["FIXED", "PERCENT"]), value: amount, reason: z.string().max(300) });
const refundBody = z.object({ amount, method, reference: z.string().max(100).nullable().optional(), reason: z.string().max(300), refunded_on: date });

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

    // POST /api/v1/fees/generation/preview — read-only: who would be charged and who is skipped
    previewGeneration: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "fees.generate");
        const b = await parseBody(request, previewBody);
        return json(await charges.previewGeneration(db, actor.tenantId, { feeItemId: b.fee_item_id, period: b.period }));
      }),

    // POST /api/v1/fees/generation
    generate: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "fees.generate");
        const b = await parseBody(request, generateBody);
        return json(
          await charges.confirmGeneration(db, actor, {
            feeItemId: b.fee_item_id, period: b.period, exclude: b.exclude, amounts: b.amounts?.map((a) => ({ studentId: a.student_id, amount: a.amount })),
          }),
          201,
        );
      }),

    // GET /api/v1/fees/runs
    listRuns: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "fees.view");
        const q = parseQuery(request, runsQuery);
        return json(await charges.listRuns(db, actor.tenantId, { feeItemId: q.fee_item_id }));
      }),

    // POST /api/v1/fees/runs/:id/cancel — cancels the run's unpaid charges
    cancelRun: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "fees.generate");
        const b = await parseBody(request, reasonBody);
        return json(await charges.cancelRun(db, actor, pathId(params.id, "FEE_GENERATION_RUN"), b));
      }),

    // GET /api/v1/students/:id/fee-charges
    studentCharges: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "fees.view");
        return json(await charges.listStudentCharges(db, actor.tenantId, pathId(params.id, "STUDENT")));
      }),

    // POST /api/v1/students/:id/fines
    addFine: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "fees.adjust");
        const b = await parseBody(request, fineBody);
        return json(await charges.addFine(db, actor, pathId(params.id, "STUDENT"), { amount: b.amount, reason: b.reason, dueDate: b.due_date, courseId: b.course_id }), 201);
      }),

    // POST /api/v1/fee-charges/:id/cancel
    cancelCharge: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "fees.generate");
        const b = await parseBody(request, reasonBody);
        return json(await charges.cancelCharge(db, actor, pathId(params.id, "FEE_CHARGE"), b));
      }),

    // POST /api/v1/students/:id/payments — 201 when recorded, 200 when the idempotency key was already used
    collect: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "fees.collect");
        const b = await parseBody(request, collectBody);
        const result = await payments.collectPayment(db, actor, pathId(params.id, "STUDENT"), {
          chargeIds: b.charge_ids, paidOn: b.paid_on, method: b.method, reference: b.reference, remarks: b.remarks, idempotencyKey: b.idempotency_key,
        });
        return json(result.payment, result.repeated ? 200 : 201);
      }),

    // GET /api/v1/students/:id/payments
    studentPayments: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "fees.view");
        return json(await payments.listStudentPayments(db, actor.tenantId, pathId(params.id, "STUDENT")));
      }),

    // POST /api/v1/fee-payments/:id/void
    voidPayment: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "fees.payment.void");
        const b = await parseBody(request, reasonBody);
        return json(await payments.voidPayment(db, actor, pathId(params.id, "FEE_PAYMENT"), b));
      }),

    // POST /api/v1/fee-charges/:id/waivers
    addWaiver: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "fees.waive");
        const b = await parseBody(request, waiverBody);
        return json(await payments.addWaiver(db, actor, pathId(params.id, "FEE_CHARGE"), b), 201);
      }),

    // POST /api/v1/fee-charges/:id/refunds
    addRefund: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "fees.refund");
        const b = await parseBody(request, refundBody);
        return json(await payments.addRefund(db, actor, pathId(params.id, "FEE_CHARGE"), { amount: b.amount, method: b.method, reference: b.reference, reason: b.reason, refundedOn: b.refunded_on }), 201);
      }),
  };
}

export type FeesHandlers = ReturnType<typeof createFeesHandlers>;
