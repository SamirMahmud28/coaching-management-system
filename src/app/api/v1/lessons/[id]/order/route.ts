import { routineHandlers as h } from "@/server/modules/routine/instance";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = async (request: Request, ctx: Ctx) => h.reorderTopics(request, await ctx.params);
