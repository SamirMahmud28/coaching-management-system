import { feesHandlers as h } from "@/server/modules/fees/instance";

export const POST = (request: Request) => h.generate(request);
