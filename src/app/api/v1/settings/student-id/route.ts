import { settingsHandlers as h } from "@/server/modules/settings/instance";

export const GET = (request: Request) => h.getStudentIdPattern(request);
export const PUT = (request: Request) => h.saveStudentIdPattern(request);
