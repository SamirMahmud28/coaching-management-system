import { instructorHandlers as h } from "@/server/modules/instructors/instance";

type Ctx = { params: Promise<{ id: string }> };

export const POST = async (request: Request, ctx: Ctx) => h.resetPassword(request, await ctx.params);
