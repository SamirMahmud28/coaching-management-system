import { boolean, check, integer, pgTable, smallint, text, timestamp, unique, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { files, tenants } from "./core";

/**
 * Institute profile and branding: what prints on receipts and marksheets and brands the institute's pages. One row
 * per tenant, created on first save; until then the tenant's name is used.
 */
export const institutionProfiles = pgTable("institution_profiles", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id),
  displayName: varchar("display_name", { length: 150 }).notNull(),
  shortName: varchar("short_name", { length: 50 }),
  address: text("address"),
  phone: varchar("phone", { length: 30 }),
  email: varchar("email", { length: 254 }),
  website: varchar("website", { length: 200 }),
  // Trade licence or another official registration number.
  institutionCode: varchar("institution_code", { length: 30 }),
  logoFileId: uuid("logo_file_id").references(() => files.id, { onDelete: "set null" }),
  primaryColor: varchar("primary_color", { length: 7 }),
  secondaryColor: varchar("secondary_color", { length: 7 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  updatedBy: uuid("updated_by"),
}, (t) => [
  check("institution_profiles_colors_hex", sql`(${t.primaryColor} IS NULL OR ${t.primaryColor} ~ '^#[0-9a-f]{6}$') AND (${t.secondaryColor} IS NULL OR ${t.secondaryColor} ~ '^#[0-9a-f]{6}$')`),
]);

/** People whose signature prints on documents (Director, Accounts Officer, …). Never shared across tenants. */
export const signatures = pgTable("signatures", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  title: varchar("title", { length: 50 }).notNull(),
  personName: varchar("person_name", { length: 100 }).notNull(),
  signatureFileId: uuid("signature_file_id").references(() => files.id, { onDelete: "set null" }),
  sortOrder: integer("sort_order").notNull().default(100),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  updatedBy: uuid("updated_by"),
}, (t) => [
  uniqueIndex("signatures_tenant_title_lower_idx").on(t.tenantId, sql`lower(${t.title})`),
  unique("signatures_tenant_id_unique").on(t.tenantId, t.id),
]);

/**
 * The institute's student ID pattern (D8, D15, D16): PREFIX · COURSE CODE (optional) · ADMISSION YEAR · NUMBER, joined
 * by the separator, e.g. "KC-HSC-2026-0001". The year is always included because the number restarts every year
 * (D16). One row per tenant, created on first save; until then the defaults below apply.
 */
export const studentIdSettings = pgTable("student_id_settings", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id),
  prefix: varchar("prefix", { length: 10 }).notNull().default(""),
  includeCourseCode: boolean("include_course_code").notNull().default(false),
  separator: varchar("separator", { length: 1 }).notNull().default("-"),
  sequenceWidth: smallint("sequence_width").notNull().default(4),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
}, (t) => [
  check("student_id_settings_prefix", sql`${t.prefix} ~ '^[A-Z][A-Z0-9]{0,9}$' OR ${t.prefix} = ''`),
  check("student_id_settings_separator", sql`${t.separator} IN ('-', '/', '')`),
  check("student_id_settings_width", sql`${t.sequenceWidth} BETWEEN 3 AND 6`),
]);
