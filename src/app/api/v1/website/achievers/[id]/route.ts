import { websiteHandlers as h } from "@/server/modules/website/instance";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = async (request: Request, ctx: Ctx) => h.updateAchiever(request, await ctx.params);
export const DELETE = async (request: Request, ctx: Ctx) => h.removeAchiever(request, await ctx.params);
