import { db } from "../../core/db/client";
import { hostConfigFromEnv } from "../../core/tenancy/host";
import { tenantAuth } from "../auth/instance";
import { createAcademicHandlers } from "./http";

export const academicHandlers = createAcademicHandlers({ db, auth: tenantAuth, host: hostConfigFromEnv() });
