import { studentHandlers as h } from "@/server/modules/students/instance";

type Ctx = { params: Promise<{ id: string }> };

export const GET = async (request: Request, ctx: Ctx) => h.batchStudents(request, await ctx.params);
