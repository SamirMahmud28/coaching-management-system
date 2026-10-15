import { platformHandlers as h } from "@/server/modules/platform/instance";

export const PATCH = (request: Request) => h.setMyAppTheme(request);
