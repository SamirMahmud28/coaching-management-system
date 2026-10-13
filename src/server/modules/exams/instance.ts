import { db } from "../../core/db/client";
import { hostConfigFromEnv } from "../../core/tenancy/host";
import { tenantAuth } from "../auth/instance";
import { createExamsHandlers } from "./http";

export const examsHandlers = createExamsHandlers({ db, auth: tenantAuth, host: hostConfigFromEnv() });
