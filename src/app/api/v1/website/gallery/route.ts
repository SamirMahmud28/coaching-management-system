import { websiteHandlers as h } from "@/server/modules/website/instance";

export const GET = (request: Request) => h.listGallery(request);
export const POST = (request: Request) => h.addGalleryPhoto(request);
