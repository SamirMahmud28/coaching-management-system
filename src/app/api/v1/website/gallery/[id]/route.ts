import { websiteHandlers as h } from "@/server/modules/website/instance";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = async (request: Request, ctx: Ctx) => h.updateGalleryPhoto(request, await ctx.params);
export const DELETE = async (request: Request, ctx: Ctx) => h.removeGalleryPhoto(request, await ctx.params);
