import { boolean, foreignKey, index, inet, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { actorTypeEnum, moduleRequestStatusEnum, platformUserStatusEnum } from "./enums";
import { modules, tenants, users } from "./core";

// Platform-owned tables: tenant_id here is a plain reference, not a tenant-isolation boundary.

export const platformUsers = pgTable("platform_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 254 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  // Required by Better Auth; accounts are provisioned, never email-verified.
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  status: platformUserStatusEnum("status").notNull().default("ACTIVE"),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("platform_users_email_lower_idx").on(sql`lower(${t.email})`),
]);

export const tenantModules = pgTable("tenant_modules", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  moduleId: uuid("module_id").notNull().references(() => modules.id, { onDelete: "restrict" }),
  enabled: boolean("enabled").notNull().default(false),
  enabledAt: timestamp("enabled_at", { withTimezone: true }),
  enabledBy: uuid("enabled_by").references(() => platformUsers.id, { onDelete: "set null" }),
}, (t) => [
  primaryKey({ columns: [t.tenantId, t.moduleId] }),
]);

export const moduleRequests = pgTable("module_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  moduleId: uuid("module_id").notNull().references(() => modules.id, { onDelete: "restrict" }),
  requestedBy: uuid("requested_by").notNull(),
  note: text("note"),
  status: moduleRequestStatusEnum("status").notNull().default("PENDING"),
  resolvedBy: uuid("resolved_by").references(() => platformUsers.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("module_requests_pending_unique_idx").on(t.tenantId, t.moduleId).where(sql`${t.status} = 'PENDING'`),
  index("module_requests_status_created_idx").on(t.status, t.createdAt),
  // The requester must be a user of the same institute.
  foreignKey({ columns: [t.tenantId, t.requestedBy], foreignColumns: [users.tenantId, users.id] }).onDelete("restrict"),
]);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  // NULL for platform-only actions.
  tenantId: uuid("tenant_id").references(() => tenants.id),
  actorType: actorTypeEnum("actor_type").notNull(),
  // Exactly one of userId / platformUserId is set, matching actorType (enforced by the audit service).
  userId: uuid("user_id").references(() => users.id),
  platformUserId: uuid("platform_user_id").references(() => platformUsers.id),
  action: varchar("action", { length: 80 }).notNull(),
  resourceType: varchar("resource_type", { length: 80 }).notNull(),
  resourceId: uuid("resource_id"),
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),
  ipAddress: inet("ip_address"),
  userAgent: text("user_agent"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("audit_logs_tenant_actor_timestamp_idx").on(t.tenantId, t.actorType, t.timestamp),
  index("audit_logs_tenant_null_idx").on(t.timestamp).where(sql`${t.tenantId} IS NULL`),
]);
