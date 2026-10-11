import { instituteHandlers as h } from "@/server/modules/institute/instance";

type Ctx = { params: Promise<{ id: string }> };

export const POST = async (request: Request, ctx: Ctx) => h.resetPassword(request, await ctx.params);
