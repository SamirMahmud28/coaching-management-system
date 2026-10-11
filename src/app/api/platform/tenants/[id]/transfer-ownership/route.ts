import { platformHandlers as h } from "@/server/modules/platform/instance";

type Ctx = { params: Promise<{ id: string }> };

export const POST = async (request: Request, ctx: Ctx) => h.transferOwnership(request, await ctx.params);
