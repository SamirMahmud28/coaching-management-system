import { studentHandlers as h } from "@/server/modules/students/instance";

type Ctx = { params: Promise<{ id: string }> };

export const POST = async (request: Request, ctx: Ctx) => h.addMembership(request, await ctx.params);
