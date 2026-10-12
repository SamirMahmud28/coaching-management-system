import { academicHandlers as h } from "@/server/modules/academic/instance";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = async (request: Request, ctx: Ctx) => h.updateSubject(request, await ctx.params);
export const DELETE = async (request: Request, ctx: Ctx) => h.deleteSubject(request, await ctx.params);
