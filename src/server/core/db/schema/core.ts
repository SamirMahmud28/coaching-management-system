import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { fileCategoryEnum, moduleTierEnum, tenantStatusEnum } from "./enums";

// tenants and users reference each other, so they share a file; Drizzle resolves `.references()` lazily.

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 150 }).notNull(),
  subdomain: varchar("subdomain", { length: 63 }).notNull(),
  status: tenantStatusEnum("status").notNull().default("PENDING"),
  ownerUserId: uuid("owner_user_id"),
  // Display only in Phase 1 (D4): nothing is enforced from it.
  paidUntil: date("paid_until"),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  suspendedReason: text("suspended_reason"),
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("tenants_subdomain_lower_idx").on(sql`lower(${t.subdomain})`),
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  // Sign-in identifiers (D17): instructors and admins by email or phone, students by username (their student ID).
  email: varchar("email", { length: 254 }),
  phone: varchar("phone", { length: 20 }),
  username: varchar("username", { length: 40 }),
  name: varchar("name", { length: 100 }).notNull(),
  // Required by Better Auth; logins are admin-provisioned, never email-verified.
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  // Blocks sign-in and drops sessions: a disabled user, or a student who isn't Active (D26).
  banned: boolean("banned").notNull().default(false),
  bannedAt: timestamp("banned_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("users_tenant_email_lower_idx").on(t.tenantId, sql`lower(${t.email})`).where(sql`${t.email} IS NOT NULL`),
  uniqueIndex("users_tenant_phone_idx").on(t.tenantId, t.phone).where(sql`${t.phone} IS NOT NULL`),
  uniqueIndex("users_tenant_username_lower_idx").on(t.tenantId, sql`lower(${t.username})`).where(sql`${t.username} IS NOT NULL`),
  // Must be a constraint, not an index: composite FKs require a UNIQUE constraint target.
  unique("users_tenant_id_unique").on(t.tenantId, t.id),
  check("users_has_identifier", sql`${t.email} IS NOT NULL OR ${t.phone} IS NOT NULL OR ${t.username} IS NOT NULL`),
]);

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 60 }).notNull(),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("roles_tenant_name_lower_idx").on(t.tenantId, sql`lower(${t.name})`),
  unique("roles_tenant_id_unique").on(t.tenantId, t.id),
]);

// Global catalog, not tenant-owned.
export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 80 }).notNull(),
  moduleId: uuid("module_id").references(() => modules.id),
}, (t) => [
  uniqueIndex("permissions_name_lower_idx").on(sql`lower(${t.name})`),
]);

export const rolePermissions = pgTable("role_permissions", {
  tenantId: uuid("tenant_id").notNull(),
  roleId: uuid("role_id").notNull(),
  permissionId: uuid("permission_id").notNull().references(() => permissions.id),
}, (t) => [
  primaryKey({ columns: [t.tenantId, t.roleId, t.permissionId] }),
  index("role_permissions_tenant_role_idx").on(t.tenantId, t.roleId),
  // Composite tenant FK: rejects a grant against another tenant's role.
  foreignKey({ columns: [t.tenantId, t.roleId], foreignColumns: [roles.tenantId, roles.id] }).onDelete("cascade"),
]);

export const userRoles = pgTable("user_roles", {
  tenantId: uuid("tenant_id").notNull(),
  userId: uuid("user_id").notNull(),
  roleId: uuid("role_id").notNull(),
}, (t) => [
  primaryKey({ columns: [t.tenantId, t.userId, t.roleId] }),
  index("user_roles_tenant_user_idx").on(t.tenantId, t.userId),
  foreignKey({ columns: [t.tenantId, t.userId], foreignColumns: [users.tenantId, users.id] }).onDelete("cascade"),
  foreignKey({ columns: [t.tenantId, t.roleId], foreignColumns: [roles.tenantId, roles.id] }).onDelete("restrict"),
]);

// Global, seeded from core/modules/registry.ts.
export const modules = pgTable("modules", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 40 }).notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  tier: moduleTierEnum("tier").notNull(),
}, (t) => [
  uniqueIndex("modules_key_lower_idx").on(sql`lower(${t.key})`),
]);

export const moduleDependencies = pgTable("module_dependencies", {
  moduleId: uuid("module_id").notNull().references(() => modules.id, { onDelete: "restrict" }),
  dependsOnModuleId: uuid("depends_on_module_id").notNull().references(() => modules.id, { onDelete: "restrict" }),
}, (t) => [
  primaryKey({ columns: [t.moduleId, t.dependsOnModuleId] }),
  check("module_dependencies_not_self", sql`${t.moduleId} <> ${t.dependsOnModuleId}`),
]);

// Stored in tenant-prefixed object storage; served only through an authenticated, tenant-checked route.
export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  category: fileCategoryEnum("category").notNull(),
  objectKey: text("object_key").notNull(),
  filename: text("filename").notNull(),
  mimeType: varchar("mime_type", { length: 127 }).notNull(),
  size: integer("size").notNull(),
  uploadedBy: uuid("uploaded_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("files_tenant_id_idx").on(t.tenantId),
  // Unlike the EMS, records can reference a file through a composite (tenant_id, file_id) FK.
  unique("files_tenant_id_unique").on(t.tenantId, t.id),
  foreignKey({ columns: [t.tenantId, t.uploadedBy], foreignColumns: [users.tenantId, users.id] }),
]);
