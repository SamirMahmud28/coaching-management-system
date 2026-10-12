import { attendanceHandlers as h } from "@/server/modules/attendance/instance";

type Ctx = { params: Promise<{ id: string }> };

export const GET = async (request: Request, ctx: Ctx) => h.getRegister(request, await ctx.params);
export const PUT = async (request: Request, ctx: Ctx) => h.saveRegister(request, await ctx.params);
