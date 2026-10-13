import { websiteHandlers as h } from "@/server/modules/website/instance";

export const PUT = (request: Request) => h.reorderGallery(request);
