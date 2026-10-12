import { feesHandlers as h } from "@/server/modules/fees/instance";

export const GET = (request: Request) => h.listItems(request);
export const POST = (request: Request) => h.createItem(request);
