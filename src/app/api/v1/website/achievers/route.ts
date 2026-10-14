import { websiteHandlers as h } from "@/server/modules/website/instance";

export const GET = (request: Request) => h.listAchievers(request);
export const POST = (request: Request) => h.createAchiever(request);
