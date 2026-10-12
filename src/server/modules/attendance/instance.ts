import { db } from "../../core/db/client";
import { hostConfigFromEnv } from "../../core/tenancy/host";
import { tenantAuth } from "../auth/instance";
import { createAttendanceHandlers } from "./http";

export const attendanceHandlers = createAttendanceHandlers({ db, auth: tenantAuth, host: hostConfigFromEnv() });
