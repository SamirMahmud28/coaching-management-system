import { examsHandlers as h } from "@/server/modules/exams/instance";

export const GET = (request: Request) => h.getGradeScale(request);
export const PUT = (request: Request) => h.saveGradeScale(request);
export const DELETE = (request: Request) => h.resetGradeScale(request);
