import { db } from "../../core/db/client";
import { hostConfigFromEnv } from "../../core/tenancy/host";
import { tenantAuth } from "../auth/instance";
import { createAcademicHandlers } from "./http";
// Other modules guard deletes of courses, batches and batch subjects they refer to (students, fee items, registers, exams).
import "../students/references";
import "../fees/references";
import "../attendance/references";
import "../exams/references";

export const academicHandlers = createAcademicHandlers({ db, auth: tenantAuth, host: hostConfigFromEnv() });
