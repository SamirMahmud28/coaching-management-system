import { academicHandlers as h } from "@/server/modules/academic/instance";

export const GET = (request: Request) => h.assignableInstructors(request);
