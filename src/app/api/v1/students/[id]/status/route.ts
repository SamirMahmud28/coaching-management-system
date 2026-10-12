import { studentHandlers as h } from "@/server/modules/students/instance";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = async (request: Request, ctx: Ctx) => h.setStatus(request, await ctx.params);
