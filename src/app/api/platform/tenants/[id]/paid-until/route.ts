import { platformHandlers as h } from "@/server/modules/platform/instance";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = async (request: Request, ctx: Ctx) => h.setTenantPaidUntil(request, await ctx.params);
