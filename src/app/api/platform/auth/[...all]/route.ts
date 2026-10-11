import { toNextJsHandler } from "better-auth/next-js";
import { platformAuth } from "@/server/modules/auth/instance";

export const { GET, POST } = toNextJsHandler(platformAuth);
