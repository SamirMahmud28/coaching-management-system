import { routineHandlers as h } from "@/server/modules/routine/instance";

type Ctx = { params: Promise<{ id: string }> };

export const GET = async (request: Request, ctx: Ctx) => h.batchWeek(request, await ctx.params);
