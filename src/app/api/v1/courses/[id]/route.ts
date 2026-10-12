import { academicHandlers as h } from "@/server/modules/academic/instance";

type Ctx = { params: Promise<{ id: string }> };

export const GET = async (request: Request, ctx: Ctx) => h.getCourse(request, await ctx.params);
export const PATCH = async (request: Request, ctx: Ctx) => h.updateCourse(request, await ctx.params);
export const DELETE = async (request: Request, ctx: Ctx) => h.deleteCourse(request, await ctx.params);
