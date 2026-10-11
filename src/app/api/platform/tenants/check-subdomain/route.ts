import { platformHandlers as h } from "@/server/modules/platform/instance";

export const GET = (request: Request) => h.checkSubdomain(request);
