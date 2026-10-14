import { websiteHandlers as h } from "@/server/modules/website/instance";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = async (request: Request, ctx: Ctx) => h.updateFaculty(request, await ctx.params);
export const DELETE = async (request: Request, ctx: Ctx) => h.removeFaculty(request, await ctx.params);
