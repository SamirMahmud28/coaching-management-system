import { websiteHandlers as h } from "@/server/modules/website/instance";

type Ctx = { params: Promise<{ id: string }> };

export const GET = async (request: Request, ctx: Ctx) => h.publicImage(request, await ctx.params);
