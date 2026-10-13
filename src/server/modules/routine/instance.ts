import { db } from "../../core/db/client";
import { hostConfigFromEnv } from "../../core/tenancy/host";
import { tenantAuth } from "../auth/instance";
import { createRoutineHandlers } from "./http";

export const routineHandlers = createRoutineHandlers({ db, auth: tenantAuth, host: hostConfigFromEnv() });
