import { db } from "../../core/db/client";
import { hostConfigFromEnv } from "../../core/tenancy/host";
import { tenantAuth } from "../auth/instance";
import { createInstituteHandlers } from "./http";

export const instituteHandlers = createInstituteHandlers({ db, auth: tenantAuth, host: hostConfigFromEnv() });
