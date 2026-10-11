import { settingsHandlers as h } from "@/server/modules/settings/instance";

export const GET = (request: Request) => h.getProfile(request);
export const PUT = (request: Request) => h.saveProfile(request);
