import { db } from "../../core/db/client";
import { hostConfigFromEnv } from "../../core/tenancy/host";
import { tenantAuth } from "../auth/instance";
import { createSettingsHandlers } from "./http";

export const settingsHandlers = createSettingsHandlers({ db, auth: tenantAuth, host: hostConfigFromEnv() });
