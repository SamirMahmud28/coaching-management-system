import { filesHandlers as h } from "@/server/modules/files/instance";

type Ctx = { params: Promise<{ id: string }> };

export const GET = async (request: Request, ctx: Ctx) => h.serve(request, await ctx.params);
