import { studentHandlers as h } from "@/server/modules/students/instance";

type Ctx = { params: Promise<{ id: string }> };

export const GET = async (request: Request, ctx: Ctx) => h.get(request, await ctx.params);
export const PATCH = async (request: Request, ctx: Ctx) => h.update(request, await ctx.params);
