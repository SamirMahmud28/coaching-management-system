CREATE TABLE "institution_profiles" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"display_name" varchar(150) NOT NULL,
	"short_name" varchar(50),
	"address" text,
	"phone" varchar(30),
	"email" varchar(254),
	"website" varchar(200),
	"institution_code" varchar(30),
	"logo_file_id" uuid,
	"primary_color" varchar(7),
	"secondary_color" varchar(7),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "institution_profiles_colors_hex" CHECK (("institution_profiles"."primary_color" IS NULL OR "institution_profiles"."primary_color" ~ '^#[0-9a-f]{6}$') AND ("institution_profiles"."secondary_color" IS NULL OR "institution_profiles"."secondary_color" ~ '^#[0-9a-f]{6}$'))
);
--> statement-breakpoint
CREATE TABLE "signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" varchar(50) NOT NULL,
	"person_name" varchar(100) NOT NULL,
	"signature_file_id" uuid,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "signatures_tenant_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "student_id_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"prefix" varchar(10) DEFAULT '' NOT NULL,
	"include_course_code" boolean DEFAULT false NOT NULL,
	"separator" varchar(1) DEFAULT '-' NOT NULL,
	"sequence_width" smallint DEFAULT 4 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "student_id_settings_prefix" CHECK ("student_id_settings"."prefix" ~ '^[A-Z][A-Z0-9]{0,9}$' OR "student_id_settings"."prefix" = ''),
	CONSTRAINT "student_id_settings_separator" CHECK ("student_id_settings"."separator" IN ('-', '/', '')),
	CONSTRAINT "student_id_settings_width" CHECK ("student_id_settings"."sequence_width" BETWEEN 3 AND 6)
);
--> statement-breakpoint
ALTER TABLE "institution_profiles" ADD CONSTRAINT "institution_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_profiles" ADD CONSTRAINT "institution_profiles_logo_file_id_files_id_fk" FOREIGN KEY ("logo_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_signature_file_id_files_id_fk" FOREIGN KEY ("signature_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_id_settings" ADD CONSTRAINT "student_id_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "signatures_tenant_title_lower_idx" ON "signatures" USING btree ("tenant_id",lower("title"));