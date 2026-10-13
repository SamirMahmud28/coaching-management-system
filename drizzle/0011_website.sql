CREATE TYPE "public"."enquiry_status" AS ENUM('NEW', 'CONTACTED', 'CONVERTED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."website_hero_button" AS ENUM('ENQUIRE', 'CALL', 'NONE');--> statement-breakpoint
CREATE TYPE "public"."website_font" AS ENUM('INTER', 'POPPINS', 'MERRIWEATHER', 'PLAYFAIR', 'HIND_SILIGURI');--> statement-breakpoint
CREATE TYPE "public"."website_theme" AS ENUM('CLASSIC', 'MODERN', 'BOLD');--> statement-breakpoint
ALTER TYPE "public"."file_category" ADD VALUE 'WEBSITE_IMAGE';--> statement-breakpoint
CREATE TABLE "enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"mobile" varchar(20) NOT NULL,
	"course_id" uuid,
	"message" varchar(1000),
	"status" "enquiry_status" DEFAULT 'NEW' NOT NULL,
	"note" varchar(500),
	"student_id" uuid,
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "enquiries_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "enquiries_converted" CHECK (("enquiries"."status" = 'CONVERTED') = ("enquiries"."student_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "gallery_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"caption" varchar(200),
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "gallery_photos_tenant_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "testimonials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"quote" varchar(600) NOT NULL,
	"name" varchar(100) NOT NULL,
	"line" varchar(120),
	"photo_file_id" uuid,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "testimonials_tenant_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "website_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" varchar(150) NOT NULL,
	"body" text NOT NULL,
	"notice_date" date NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"show_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"hidden_at" timestamp with time zone,
	"hidden_by" uuid,
	CONSTRAINT "website_notices_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "website_notices_dates" CHECK ("website_notices"."show_until" IS NULL OR "website_notices"."show_until" >= "website_notices"."notice_date"),
	CONSTRAINT "website_notices_body" CHECK (length("website_notices"."body") <= 5000),
	CONSTRAINT "website_notices_hidden" CHECK (("website_notices"."hidden_at" IS NULL) = ("website_notices"."hidden_by" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "website_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"theme" "website_theme" DEFAULT 'CLASSIC' NOT NULL,
	"heading_font" "website_font" DEFAULT 'INTER' NOT NULL,
	"sections" jsonb NOT NULL,
	"hero_heading" varchar(120),
	"hero_subheading" varchar(250),
	"hero_image_file_id" uuid,
	"hero_button" "website_hero_button" DEFAULT 'ENQUIRE' NOT NULL,
	"about_heading" varchar(120),
	"about_text" text,
	"about_image_file_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "website_settings_about_text" CHECK ("website_settings"."about_text" IS NULL OR length("website_settings"."about_text") <= 3000)
);
--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_course_fk" FOREIGN KEY ("tenant_id","course_id") REFERENCES "public"."courses"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_student_fk" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_updated_by_fk" FOREIGN KEY ("tenant_id","updated_by") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_photos" ADD CONSTRAINT "gallery_photos_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_photos" ADD CONSTRAINT "gallery_photos_file_fk" FOREIGN KEY ("tenant_id","file_id") REFERENCES "public"."files"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_photos" ADD CONSTRAINT "gallery_photos_created_by_fk" FOREIGN KEY ("tenant_id","created_by") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_photo_fk" FOREIGN KEY ("tenant_id","photo_file_id") REFERENCES "public"."files"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_updated_by_fk" FOREIGN KEY ("tenant_id","updated_by") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_notices" ADD CONSTRAINT "website_notices_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_notices" ADD CONSTRAINT "website_notices_created_by_fk" FOREIGN KEY ("tenant_id","created_by") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_notices" ADD CONSTRAINT "website_notices_updated_by_fk" FOREIGN KEY ("tenant_id","updated_by") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_notices" ADD CONSTRAINT "website_notices_hidden_by_fk" FOREIGN KEY ("tenant_id","hidden_by") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_settings" ADD CONSTRAINT "website_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_settings" ADD CONSTRAINT "website_settings_hero_image_fk" FOREIGN KEY ("tenant_id","hero_image_file_id") REFERENCES "public"."files"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_settings" ADD CONSTRAINT "website_settings_about_image_fk" FOREIGN KEY ("tenant_id","about_image_file_id") REFERENCES "public"."files"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_settings" ADD CONSTRAINT "website_settings_updated_by_fk" FOREIGN KEY ("tenant_id","updated_by") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enquiries_status_idx" ON "enquiries" USING btree ("tenant_id","status","created_at");--> statement-breakpoint
CREATE INDEX "enquiries_ip_idx" ON "enquiries" USING btree ("tenant_id","ip_address","created_at");--> statement-breakpoint
CREATE INDEX "gallery_photos_order_idx" ON "gallery_photos" USING btree ("tenant_id","sort_order");--> statement-breakpoint
CREATE INDEX "testimonials_order_idx" ON "testimonials" USING btree ("tenant_id","sort_order");--> statement-breakpoint
CREATE INDEX "website_notices_date_idx" ON "website_notices" USING btree ("tenant_id","notice_date");