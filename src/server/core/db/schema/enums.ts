import { pgEnum } from "drizzle-orm/pg-core";

export const tenantStatusEnum = pgEnum("tenant_status", ["PENDING", "ACTIVE", "SUSPENDED", "DEACTIVATED"]);

export const moduleTierEnum = pgEnum("module_tier", ["CORE", "PAID"]);

export const platformUserStatusEnum = pgEnum("platform_user_status", ["ACTIVE", "DISABLED"]);

export const moduleRequestStatusEnum = pgEnum("module_request_status", ["PENDING", "FULFILLED", "DISMISSED"]);

export const actorTypeEnum = pgEnum("actor_type", ["TENANT_USER", "PLATFORM_USER"]);

// What an uploaded file is for: limits, processing and viewing rules follow it.
// The app colour themes; keep in step with src/lib/app-themes.ts.
export const appThemeEnum = pgEnum("app_theme", ["MIDNIGHT", "AMBER", "INDIGO", "EMERALD", "PLUM"]);

export const fileCategoryEnum = pgEnum("file_category", ["STUDENT_PHOTO", "INSTRUCTOR_PHOTO", "LOGO", "SIGNATURE", "WEBSITE_IMAGE"]);
