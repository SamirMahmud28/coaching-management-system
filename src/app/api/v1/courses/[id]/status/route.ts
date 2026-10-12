import { academicHandlers as h } from "@/server/modules/academic/instance";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = async (request: Request, ctx: Ctx) => h.setCourseStatus(request, await ctx.params);
