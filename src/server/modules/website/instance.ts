import { db } from "../../core/db/client";
import { storageFromEnv } from "../../core/files/storage";
import { hostConfigFromEnv } from "../../core/tenancy/host";
import { tenantAuth } from "../auth/instance";
import { createWebsiteHandlers } from "./http";

export const websiteHandlers = createWebsiteHandlers({ db, auth: tenantAuth, host: hostConfigFromEnv(), storage: storageFromEnv() });
