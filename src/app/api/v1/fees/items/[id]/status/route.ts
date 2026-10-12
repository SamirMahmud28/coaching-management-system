import { feesHandlers as h } from "@/server/modules/fees/instance";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = async (request: Request, ctx: Ctx) => h.setItemStatus(request, await ctx.params);
