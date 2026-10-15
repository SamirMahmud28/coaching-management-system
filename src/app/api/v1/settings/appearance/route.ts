import { settingsHandlers as h } from "@/server/modules/settings/instance";

export const GET = (request: Request) => h.getAppearance(request);
export const PUT = (request: Request) => h.saveAppearance(request);
