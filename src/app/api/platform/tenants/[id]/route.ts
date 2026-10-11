import { platformHandlers as h } from "@/server/modules/platform/instance";

type Ctx = { params: Promise<{ id: string }> };

export const GET = async (request: Request, ctx: Ctx) => h.getTenant(request, await ctx.params);
