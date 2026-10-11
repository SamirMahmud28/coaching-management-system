import { db } from "../../core/db/client";
import { hostConfigFromEnv } from "../../core/tenancy/host";
import { tenantAuth } from "../auth/instance";
import { createInstructorHandlers } from "./http";

export const instructorHandlers = createInstructorHandlers({ db, auth: tenantAuth, host: hostConfigFromEnv() });
