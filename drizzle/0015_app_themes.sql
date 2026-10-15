CREATE TYPE "public"."app_theme" AS ENUM('MIDNIGHT', 'AMBER', 'INDIGO', 'EMERALD', 'PLUM');--> statement-breakpoint
ALTER TABLE "platform_users" ADD COLUMN "app_theme" "app_theme" DEFAULT 'MIDNIGHT' NOT NULL;--> statement-breakpoint
ALTER TABLE "institution_profiles" ADD COLUMN "app_theme" "app_theme" DEFAULT 'MIDNIGHT' NOT NULL;