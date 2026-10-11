import { toNextJsHandler } from "better-auth/next-js";
import { tenantAuth } from "@/server/modules/auth/instance";

export const { GET, POST } = toNextJsHandler(tenantAuth);
