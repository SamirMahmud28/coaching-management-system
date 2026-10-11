import { getEnv } from "../../core/config/env";
import { db } from "../../core/db/client";
import { hostConfigFromEnv } from "../../core/tenancy/host";
import { createPlatformAuth } from "./platform-auth";
import { createTenantAuth } from "./tenant-auth";

const protocol = getEnv().NODE_ENV === "production" ? "https" : "http";

export const tenantAuth = createTenantAuth(db, {
  secret: getEnv().AUTH_SECRET,
  host: hostConfigFromEnv(),
  protocol,
});

export const platformAuth = createPlatformAuth(db, {
  secret: getEnv().PLATFORM_AUTH_SECRET,
  platformHost: getEnv().PLATFORM_HOST,
  protocol,
});
