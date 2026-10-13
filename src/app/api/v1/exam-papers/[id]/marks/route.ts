import { examsHandlers as h } from "@/server/modules/exams/instance";

type Ctx = { params: Promise<{ id: string }> };

export const GET = async (request: Request, ctx: Ctx) => h.getRoster(request, await ctx.params);
export const PUT = async (request: Request, ctx: Ctx) => h.saveMarks(request, await ctx.params);
