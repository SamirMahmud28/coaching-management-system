CREATE TYPE "public"."guardian_relation" AS ENUM('FATHER', 'MOTHER', 'BROTHER', 'SISTER', 'UNCLE', 'AUNT', 'GRANDPARENT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('ACTIVE', 'COMPLETED', 'LEFT');--> statement-breakpoint
CREATE TYPE "public"."student_status" AS ENUM('ACTIVE', 'ON_HOLD', 'COMPLETED', 'LEFT');--> statement-breakpoint
CREATE TABLE "batch_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"status" "membership_status" DEFAULT 'ACTIVE' NOT NULL,
	"started_on" date NOT NULL,
	"ended_on" date,
	"roll_number" varchar(10),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "batch_memberships_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "batch_memberships_dates" CHECK (("batch_memberships"."status" = 'ACTIVE') = ("batch_memberships"."ended_on" IS NULL) AND ("batch_memberships"."ended_on" IS NULL OR "batch_memberships"."ended_on" >= "batch_memberships"."started_on"))
);
--> statement-breakpoint
CREATE TABLE "student_id_counters" (
	"tenant_id" uuid NOT NULL,
	"scope" varchar(36) NOT NULL,
	"year" smallint NOT NULL,
	"next_value" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "student_id_counters_pk" PRIMARY KEY("tenant_id","scope","year")
);
--> statement-breakpoint
CREATE TABLE "student_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"from_status" "student_status",
	"to_status" "student_status" NOT NULL,
	"reason" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"student_code" varchar(30) NOT NULL,
	"full_name" varchar(100) NOT NULL,
	"gender" "gender" NOT NULL,
	"date_of_birth" date,
	"phone" varchar(11),
	"school_name" varchar(150),
	"school_class" varchar(50),
	"address" text,
	"admin_note" text,
	"guardian_name" varchar(100) NOT NULL,
	"guardian_relation" "guardian_relation" NOT NULL,
	"guardian_phone" varchar(11) NOT NULL,
	"photo_file_id" uuid,
	"admission_date" date NOT NULL,
	"admission_course_id" uuid,
	"status" "student_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "students_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "students_tenant_user_unique" UNIQUE("tenant_id","user_id"),
	CONSTRAINT "students_guardian_phone" CHECK ("students"."guardian_phone" ~ '^01[3-9][0-9]{8}$'),
	CONSTRAINT "students_phone" CHECK ("students"."phone" IS NULL OR "students"."phone" ~ '^01[3-9][0-9]{8}$')
);
--> statement-breakpoint
ALTER TABLE "batch_memberships" ADD CONSTRAINT "batch_memberships_student_fk" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_memberships" ADD CONSTRAINT "batch_memberships_batch_fk" FOREIGN KEY ("tenant_id","batch_id") REFERENCES "public"."batches"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_id_counters" ADD CONSTRAINT "student_id_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_status_history" ADD CONSTRAINT "student_status_history_student_fk" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_photo_file_id_files_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_user_fk" FOREIGN KEY ("tenant_id","user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_admission_course_fk" FOREIGN KEY ("tenant_id","admission_course_id") REFERENCES "public"."courses"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "batch_memberships_active_unique" ON "batch_memberships" USING btree ("tenant_id","student_id","batch_id") WHERE "batch_memberships"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "batch_memberships_active_roll_unique" ON "batch_memberships" USING btree ("tenant_id","batch_id",lower("roll_number")) WHERE "batch_memberships"."status" = 'ACTIVE' AND "batch_memberships"."roll_number" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "batch_memberships_batch_idx" ON "batch_memberships" USING btree ("tenant_id","batch_id","status");--> statement-breakpoint
CREATE INDEX "batch_memberships_student_idx" ON "batch_memberships" USING btree ("tenant_id","student_id");--> statement-breakpoint
CREATE INDEX "student_status_history_student_idx" ON "student_status_history" USING btree ("tenant_id","student_id","changed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "students_tenant_code_lower_idx" ON "students" USING btree ("tenant_id",lower("student_code"));--> statement-breakpoint
CREATE INDEX "students_tenant_status_name_idx" ON "students" USING btree ("tenant_id","status","full_name");