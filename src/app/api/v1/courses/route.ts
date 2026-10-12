import { academicHandlers as h } from "@/server/modules/academic/instance";

export const GET = (request: Request) => h.listCourses(request);
export const POST = (request: Request) => h.createCourse(request);
