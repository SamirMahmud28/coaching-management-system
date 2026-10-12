import { db } from "../../core/db/client";
import { hostConfigFromEnv } from "../../core/tenancy/host";
import { tenantAuth } from "../auth/instance";
import { createAcademicHandlers } from "./http";
// Other modules guard deletes of courses and batches they refer to (students, M6).
import "../students/references";

export const academicHandlers = createAcademicHandlers({ db, auth: tenantAuth, host: hostConfigFromEnv() });
