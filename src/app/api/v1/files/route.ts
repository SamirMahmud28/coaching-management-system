import { filesHandlers as h } from "@/server/modules/files/instance";

export const POST = (request: Request) => h.upload(request);
