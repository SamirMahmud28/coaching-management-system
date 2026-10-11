import { getEnv } from "../../core/config/env";
import { db } from "../../core/db/client";
import { platformAuth } from "../auth/instance";
import { createPlatformHandlers } from "./http";

const protocol = getEnv().NODE_ENV === "production" ? "https" : "http";

export const platformHandlers = createPlatformHandlers({
  db,
  auth: platformAuth,
  origin: `${protocol}://${getEnv().PLATFORM_HOST}`,
});
