import { boolean, check, date, foreignKey, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { courses } from "./academic";
import { files, tenants, users } from "./core";
import { instructors } from "./instructors";
import { students } from "./students";
import { WEBSITE_FONTS, WEBSITE_THEMES, type WebsiteSectionKey } from "../../../modules/website/design";

// Website (paid module `website`): D13, D19–D23, D124–D133. The themed public site at `<sub>.<domain>/`, its notices,
// gallery and testimonials, and the admission enquiry inbox. Website Pro (D135–D141) adds the `design` settings. Every save is public at once (D126). Image files are
// never deleted, so their composite FKs need no ON DELETE action.

export const websiteThemeEnum = pgEnum("website_theme", WEBSITE_THEMES);
export const websiteFontEnum = pgEnum("website_font", WEBSITE_FONTS);
export const heroButtonEnum = pgEnum("website_hero_button", ["ENQUIRE", "CALL", "NONE"]);
export const enquiryStatusEnum = pgEnum("enquiry_status", ["NEW", "CONTACTED", "CONVERTED", "CLOSED"]);

export { WEBSITE_SECTIONS, type WebsiteSectionKey } from "../../../modules/website/design";
export type WebsiteSectionSetting = { key: WebsiteSectionKey; enabled: boolean };

/** One row per institute, created on first save; until then the defaults in `website/settings.ts` apply. */
export const websiteSettings = pgTable("website_settings", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id),
  theme: websiteThemeEnum("theme").notNull().default("CLASSIC"),
  headingFont: websiteFontEnum("heading_font").notNull().default("INTER"),
  sections: jsonb("sections").$type<WebsiteSectionSetting[]>().notNull(),
  heroHeading: varchar("hero_heading", { length: 120 }),
  heroSubheading: varchar("hero_subheading", { length: 250 }),
  heroImageFileId: uuid("hero_image_file_id"),
  heroButton: heroButtonEnum("hero_button").notNull().default("ENQUIRE"),
  aboutHeading: varchar("about_heading", { length: 120 }),
  aboutText: text("about_text"),
  aboutImageFileId: uuid("about_image_file_id"),
  /** The look beyond theme and heading font (D135, D136), validated and completed in `website/design.ts`. */
  design: jsonb("design").$type<object>().notNull().default({}),
  /** Section titles, the announcement bar and social links (D138, D140), validated and completed in `website/site-content.ts`. */
  content: jsonb("content").$type<object>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
}, (t) => [
  foreignKey({ name: "website_settings_hero_image_fk", columns: [t.tenantId, t.heroImageFileId], foreignColumns: [files.tenantId, files.id] }),
  foreignKey({ name: "website_settings_about_image_fk", columns: [t.tenantId, t.aboutImageFileId], foreignColumns: [files.tenantId, files.id] }),
  foreignKey({ name: "website_settings_updated_by_fk", columns: [t.tenantId, t.updatedBy], foreignColumns: [users.tenantId, users.id] }),
  check("website_settings_about_text", sql`${t.aboutText} IS NULL OR length(${t.aboutText}) <= 3000`),
]);

/** A public notice (D23, D128): shown from its date until "show until"; hidden rather than deleted. */
export const websiteNotices = pgTable("website_notices", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  title: varchar("title", { length: 150 }).notNull(),
  body: text("body").notNull(),
  noticeDate: date("notice_date").notNull(),
  pinned: boolean("pinned").notNull().default(false),
  showUntil: date("show_until"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").notNull(),
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  hiddenBy: uuid("hidden_by"),
}, (t) => [
  unique("website_notices_tenant_id_unique").on(t.tenantId, t.id),
  index("website_notices_date_idx").on(t.tenantId, t.noticeDate),
  foreignKey({ name: "website_notices_tenant_fk", columns: [t.tenantId], foreignColumns: [tenants.id] }),
  foreignKey({ name: "website_notices_created_by_fk", columns: [t.tenantId, t.createdBy], foreignColumns: [users.tenantId, users.id] }),
  foreignKey({ name: "website_notices_updated_by_fk", columns: [t.tenantId, t.updatedBy], foreignColumns: [users.tenantId, users.id] }),
  foreignKey({ name: "website_notices_hidden_by_fk", columns: [t.tenantId, t.hiddenBy], foreignColumns: [users.tenantId, users.id] }),
  check("website_notices_dates", sql`${t.showUntil} IS NULL OR ${t.showUntil} >= ${t.noticeDate}`),
  check("website_notices_body", sql`length(${t.body}) <= 5000`),
  check("website_notices_hidden", sql`(${t.hiddenAt} IS NULL) = (${t.hiddenBy} IS NULL)`),
]);

/** A gallery photo (D125): at most 60 per institute, shown in `sort_order`. Removing one deletes the row. */
export const galleryPhotos = pgTable("gallery_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  fileId: uuid("file_id").notNull(),
  caption: varchar("caption", { length: 200 }),
  sortOrder: integer("sort_order").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by").notNull(),
}, (t) => [
  unique("gallery_photos_tenant_id_unique").on(t.tenantId, t.id),
  index("gallery_photos_order_idx").on(t.tenantId, t.sortOrder),
  foreignKey({ name: "gallery_photos_tenant_fk", columns: [t.tenantId], foreignColumns: [tenants.id] }),
  foreignKey({ name: "gallery_photos_file_fk", columns: [t.tenantId, t.fileId], foreignColumns: [files.tenantId, files.id] }),
  foreignKey({ name: "gallery_photos_created_by_fk", columns: [t.tenantId, t.createdBy], foreignColumns: [users.tenantId, users.id] }),
]);

/** A testimonial entered by the office (D130), shown in `sort_order`. Removing one deletes the row. */
export const testimonials = pgTable("testimonials", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  quote: varchar("quote", { length: 600 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  line: varchar("line", { length: 120 }),
  photoFileId: uuid("photo_file_id"),
  sortOrder: integer("sort_order").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").notNull(),
}, (t) => [
  unique("testimonials_tenant_id_unique").on(t.tenantId, t.id),
  index("testimonials_order_idx").on(t.tenantId, t.sortOrder),
  foreignKey({ name: "testimonials_tenant_fk", columns: [t.tenantId], foreignColumns: [tenants.id] }),
  foreignKey({ name: "testimonials_photo_fk", columns: [t.tenantId, t.photoFileId], foreignColumns: [files.tenantId, files.id] }),
  foreignKey({ name: "testimonials_updated_by_fk", columns: [t.tenantId, t.updatedBy], foreignColumns: [users.tenantId, users.id] }),
]);

/**
 * An admission enquiry from the public form (D22, D129). The sender's IP is kept only for the per-IP limit. "Convert"
 * links the student that admission created.
 */
export const enquiries = pgTable("enquiries", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  mobile: varchar("mobile", { length: 20 }).notNull(),
  courseId: uuid("course_id"),
  message: varchar("message", { length: 1000 }),
  status: enquiryStatusEnum("status").notNull().default("NEW"),
  note: varchar("note", { length: 500 }),
  studentId: uuid("student_id"),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
}, (t) => [
  unique("enquiries_tenant_id_unique").on(t.tenantId, t.id),
  index("enquiries_status_idx").on(t.tenantId, t.status, t.createdAt),
  index("enquiries_ip_idx").on(t.tenantId, t.ipAddress, t.createdAt),
  foreignKey({ name: "enquiries_tenant_fk", columns: [t.tenantId], foreignColumns: [tenants.id] }),
  foreignKey({ name: "enquiries_course_fk", columns: [t.tenantId, t.courseId], foreignColumns: [courses.tenantId, courses.id] }),
  foreignKey({ name: "enquiries_student_fk", columns: [t.tenantId, t.studentId], foreignColumns: [students.tenantId, students.id] }),
  foreignKey({ name: "enquiries_updated_by_fk", columns: [t.tenantId, t.updatedBy], foreignColumns: [users.tenantId, users.id] }),
  check("enquiries_converted", sql`(${t.status} = 'CONVERTED') = (${t.studentId} IS NOT NULL)`),
]);

/**
 * An instructor the office shows on the website (D141): opt-in, with an optional line such as "BUET, 8 years". The
 * public site shows the name, photo and subjects only, and only while the instructor is active. Removing one deletes
 * the row, never the instructor.
 */
export const websiteFaculty = pgTable("website_faculty", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  instructorId: uuid("instructor_id").notNull(),
  line: varchar("line", { length: 120 }),
  sortOrder: integer("sort_order").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").notNull(),
}, (t) => [
  unique("website_faculty_tenant_id_unique").on(t.tenantId, t.id),
  unique("website_faculty_instructor_unique").on(t.tenantId, t.instructorId),
  index("website_faculty_order_idx").on(t.tenantId, t.sortOrder),
  foreignKey({ name: "website_faculty_tenant_fk", columns: [t.tenantId], foreignColumns: [tenants.id] }),
  foreignKey({ name: "website_faculty_instructor_fk", columns: [t.tenantId, t.instructorId], foreignColumns: [instructors.tenantId, instructors.id] }),
  foreignKey({ name: "website_faculty_updated_by_fk", columns: [t.tenantId, t.updatedBy], foreignColumns: [users.tenantId, users.id] }),
]);

/** A top result typed in by the office (D141), like a testimonial (D130); not linked to a student record. */
export const websiteAchievers = pgTable("website_achievers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  result: varchar("result", { length: 80 }).notNull(),
  exam: varchar("exam", { length: 40 }),
  photoFileId: uuid("photo_file_id"),
  sortOrder: integer("sort_order").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").notNull(),
}, (t) => [
  unique("website_achievers_tenant_id_unique").on(t.tenantId, t.id),
  index("website_achievers_order_idx").on(t.tenantId, t.sortOrder),
  foreignKey({ name: "website_achievers_tenant_fk", columns: [t.tenantId], foreignColumns: [tenants.id] }),
  foreignKey({ name: "website_achievers_photo_fk", columns: [t.tenantId, t.photoFileId], foreignColumns: [files.tenantId, files.id] }),
  foreignKey({ name: "website_achievers_updated_by_fk", columns: [t.tenantId, t.updatedBy], foreignColumns: [users.tenantId, users.id] }),
]);
