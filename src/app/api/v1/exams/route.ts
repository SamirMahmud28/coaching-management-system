import { examsHandlers as h } from "@/server/modules/exams/instance";

export const GET = (request: Request) => h.listExams(request);
export const POST = (request: Request) => h.createExam(request);
