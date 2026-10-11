import { instituteHandlers as h } from "@/server/modules/institute/instance";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = async (request: Request, ctx: Ctx) => h.setRoles(request, await ctx.params);
