import { platformHandlers as h } from "@/server/modules/platform/instance";

export const GET = (request: Request) => h.listAdmins(request);
export const POST = (request: Request) => h.createAdmin(request);
