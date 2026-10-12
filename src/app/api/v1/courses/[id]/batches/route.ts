import { academicHandlers as h } from "@/server/modules/academic/instance";

type Ctx = { params: Promise<{ id: string }> };

export const POST = async (request: Request, ctx: Ctx) => h.createBatch(request, await ctx.params);
