import { websiteHandlers as h } from "@/server/modules/website/instance";

type Ctx = { params: Promise<{ id: string }> };

export const GET = async (request: Request, ctx: Ctx) => h.getEnquiry(request, await ctx.params);
export const PATCH = async (request: Request, ctx: Ctx) => h.updateEnquiry(request, await ctx.params);
