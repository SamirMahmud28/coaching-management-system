import { feesHandlers as h } from "@/server/modules/fees/instance";

type Ctx = { params: Promise<{ id: string }> };

export const GET = async (request: Request, ctx: Ctx) => h.studentPayments(request, await ctx.params);
export const POST = async (request: Request, ctx: Ctx) => h.collect(request, await ctx.params);
