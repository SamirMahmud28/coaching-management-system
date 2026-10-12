import { db } from "../../core/db/client";
import { hostConfigFromEnv } from "../../core/tenancy/host";
import { tenantAuth } from "../auth/instance";
import { createFeesHandlers } from "./http";

export const feesHandlers = createFeesHandlers({ db, auth: tenantAuth, host: hostConfigFromEnv() });
