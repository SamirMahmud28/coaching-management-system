import { routineHandlers as h } from "@/server/modules/routine/instance";

export const GET = (request: Request) => h.dayView(request);
