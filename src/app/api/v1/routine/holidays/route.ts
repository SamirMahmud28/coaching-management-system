import { routineHandlers as h } from "@/server/modules/routine/instance";

export const POST = (request: Request) => h.createHoliday(request);
