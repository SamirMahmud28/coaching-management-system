import { filesHandlers as h } from "@/server/modules/files/instance";

export const GET = (request: Request) => h.publicLogo(request);
