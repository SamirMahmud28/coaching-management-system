import { feesHandlers as h } from "@/server/modules/fees/instance";

export const GET = (request: Request) => h.listPayments(request);
