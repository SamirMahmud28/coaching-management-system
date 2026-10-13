import { websiteHandlers as h } from "@/server/modules/website/instance";

export const GET = (request: Request) => h.listEnquiries(request);
