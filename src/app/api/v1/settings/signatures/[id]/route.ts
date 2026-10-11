import { settingsHandlers as h } from "@/server/modules/settings/instance";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = async (request: Request, ctx: Ctx) => h.updateSignature(request, await ctx.params);
export const DELETE = async (request: Request, ctx: Ctx) => h.deleteSignature(request, await ctx.params);
