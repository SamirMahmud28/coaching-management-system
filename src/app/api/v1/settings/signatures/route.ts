import { settingsHandlers as h } from "@/server/modules/settings/instance";

export const GET = (request: Request) => h.listSignatures(request);
export const POST = (request: Request) => h.createSignature(request);
