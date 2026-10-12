import { attendanceHandlers as h } from "@/server/modules/attendance/instance";

export const GET = (request: Request) => h.reportOptions(request);
