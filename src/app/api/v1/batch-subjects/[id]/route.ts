import { academicHandlers as h } from "@/server/modules/academic/instance";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = async (request: Request, ctx: Ctx) => h.removeBatchSubject(request, await ctx.params);
