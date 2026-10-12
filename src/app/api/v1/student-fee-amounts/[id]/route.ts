import { feesHandlers as h } from "@/server/modules/fees/instance";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = async (request: Request, ctx: Ctx) => h.removeStudentAmount(request, await ctx.params);
