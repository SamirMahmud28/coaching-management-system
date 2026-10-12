import { studentHandlers as h } from "@/server/modules/students/instance";

export const GET = (request: Request) => h.list(request);
export const POST = (request: Request) => h.admit(request);
