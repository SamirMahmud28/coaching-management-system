import { instructorHandlers as h } from "@/server/modules/instructors/instance";

export const GET = (request: Request) => h.list(request);
export const POST = (request: Request) => h.create(request);
