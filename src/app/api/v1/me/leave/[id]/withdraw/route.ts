import { attendanceHandlers as h } from "@/server/modules/attendance/instance";

type Ctx = { params: Promise<{ id: string }> };

export const POST = async (request: Request, ctx: Ctx) => h.withdrawLeave(request, await ctx.params);
