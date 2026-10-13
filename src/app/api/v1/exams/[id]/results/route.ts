import { examsHandlers as h } from "@/server/modules/exams/instance";

type Ctx = { params: Promise<{ id: string }> };

export const GET = async (request: Request, ctx: Ctx) => h.getResults(request, await ctx.params);
