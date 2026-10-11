import { platformHandlers as h } from "@/server/modules/platform/instance";

export const GET = (request: Request) => h.listTenants(request);
export const POST = (request: Request) => h.createTenant(request);
