import { examsHandlers as h } from "@/server/modules/exams/instance";

type Ctx = { params: Promise<{ id: string }> };

export const GET = async (request: Request, ctx: Ctx) => h.getExam(request, await ctx.params);
export const PUT = async (request: Request, ctx: Ctx) => h.updateExam(request, await ctx.params);
export const DELETE = async (request: Request, ctx: Ctx) => h.deleteExam(request, await ctx.params);
