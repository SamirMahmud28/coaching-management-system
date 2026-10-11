import { instituteHandlers as h } from "@/server/modules/institute/instance";

export const GET = (request: Request) => h.listUsers(request);
export const POST = (request: Request) => h.createUser(request);
