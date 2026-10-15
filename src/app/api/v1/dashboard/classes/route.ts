import { dashboardHandlers as h } from "@/server/modules/dashboard/instance";

export const GET = (request: Request) => h.classes(request);
