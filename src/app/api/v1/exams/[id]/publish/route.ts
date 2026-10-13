import { examsHandlers as h } from "@/server/modules/exams/instance";

type Ctx = { params: Promise<{ id: string }> };

export const POST = async (request: Request, ctx: Ctx) => h.publishExam(request, await ctx.params);
