import { instituteHandlers as h } from "@/server/modules/institute/instance";

export const POST = (request: Request) => h.requestModule(request);
