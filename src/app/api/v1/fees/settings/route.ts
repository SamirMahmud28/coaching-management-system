import { feesHandlers as h } from "@/server/modules/fees/instance";

export const GET = (request: Request) => h.getSettings(request);
export const PUT = (request: Request) => h.saveSettings(request);
