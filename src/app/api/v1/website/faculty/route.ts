import { websiteHandlers as h } from "@/server/modules/website/instance";

export const GET = (request: Request) => h.listFaculty(request);
export const POST = (request: Request) => h.addFaculty(request);
