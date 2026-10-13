import { websiteHandlers as h } from "@/server/modules/website/instance";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = async (request: Request, ctx: Ctx) => h.updateNotice(request, await ctx.params);
