import { db } from "../../core/db/client";
import { hostConfigFromEnv } from "../../core/tenancy/host";
import { tenantAuth } from "../auth/instance";
import { createStudentHandlers } from "./http";

export const studentHandlers = createStudentHandlers({ db, auth: tenantAuth, host: hostConfigFromEnv() });
