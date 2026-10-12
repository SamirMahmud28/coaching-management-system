import { feesHandlers as h } from "@/server/modules/fees/instance";

type Ctx = { params: Promise<{ id: string }> };

export const GET = async (request: Request, ctx: Ctx) => h.studentAmounts(request, await ctx.params);
export const PUT = async (request: Request, ctx: Ctx) => h.setStudentAmount(request, await ctx.params);
