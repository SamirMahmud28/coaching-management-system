import { db } from "../../core/db/client";
import { hostConfigFromEnv } from "../../core/tenancy/host";
import { tenantAuth } from "../auth/instance";
import { createDashboardHandlers } from "./http";

export const dashboardHandlers = createDashboardHandlers({ db, auth: tenantAuth, host: hostConfigFromEnv() });
