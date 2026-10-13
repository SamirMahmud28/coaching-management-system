import { routineHandlers as h } from "@/server/modules/routine/instance";

type Ctx = { params: Promise<{ id: string }> };

export const POST = async (request: Request, ctx: Ctx) => h.copyPlan(request, await ctx.params);
