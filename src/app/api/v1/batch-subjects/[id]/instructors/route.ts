import { academicHandlers as h } from "@/server/modules/academic/instance";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = async (request: Request, ctx: Ctx) => h.setInstructors(request, await ctx.params);
