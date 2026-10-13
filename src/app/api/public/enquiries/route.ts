import { websiteHandlers as h } from "@/server/modules/website/instance";

export const POST = (request: Request) => h.submitEnquiry(request);
