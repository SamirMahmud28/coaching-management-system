import { attendanceHandlers as h } from "@/server/modules/attendance/instance";

export const GET = (request: Request) => h.myLeave(request);
export const POST = (request: Request) => h.applyForLeave(request);
