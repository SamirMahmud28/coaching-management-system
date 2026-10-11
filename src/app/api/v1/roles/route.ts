import { instituteHandlers as h } from "@/server/modules/institute/instance";

export const GET = (request: Request) => h.listRoles(request);
