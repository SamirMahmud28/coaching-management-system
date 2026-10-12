import { feesHandlers as h } from "@/server/modules/fees/instance";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = async (request: Request, ctx: Ctx) => h.updateItem(request, await ctx.params);
export const DELETE = async (request: Request, ctx: Ctx) => h.deleteItem(request, await ctx.params);
