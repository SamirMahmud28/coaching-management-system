import { routineHandlers as h } from "@/server/modules/routine/instance";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = async (request: Request, ctx: Ctx) => h.updateTopic(request, await ctx.params);
export const DELETE = async (request: Request, ctx: Ctx) => h.deleteTopic(request, await ctx.params);
