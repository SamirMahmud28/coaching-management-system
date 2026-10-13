import { routineHandlers as h } from "@/server/modules/routine/instance";

export const GET = (request: Request) => h.listChanges(request);
export const POST = (request: Request) => h.createChange(request);
