import { feesHandlers as h } from "@/server/modules/fees/instance";

type Ctx = { params: Promise<{ id: string }> };

export const POST = async (request: Request, ctx: Ctx) => h.voidPayment(request, await ctx.params);
