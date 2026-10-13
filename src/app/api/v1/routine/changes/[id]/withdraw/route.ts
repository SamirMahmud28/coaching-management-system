import { routineHandlers as h } from "@/server/modules/routine/instance";

type Ctx = { params: Promise<{ id: string }> };

export const POST = async (request: Request, ctx: Ctx) => h.withdrawChange(request, await ctx.params);
