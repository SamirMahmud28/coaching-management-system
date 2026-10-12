import { feesHandlers as h } from "@/server/modules/fees/instance";

type Ctx = { params: Promise<{ id: string }> };

export const GET = async (request: Request, ctx: Ctx) => h.studentCharges(request, await ctx.params);
