import { examsHandlers as h } from "@/server/modules/exams/instance";

export const GET = (request: Request) => h.setupOptions(request);
