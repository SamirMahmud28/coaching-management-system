import { websiteHandlers as h } from "@/server/modules/website/instance";

export const GET = (request: Request) => h.listTestimonials(request);
export const POST = (request: Request) => h.createTestimonial(request);
