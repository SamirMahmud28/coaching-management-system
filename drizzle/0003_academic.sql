CREATE TYPE "public"."academic_status" AS ENUM('ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."weekday" AS ENUM('SAT', 'SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI');--> statement-breakpoint
CREATE TABLE "batch_subject_instructors" (
	"tenant_id" uuid NOT NULL,
	"batch_subject_id" uuid NOT NULL,
	"instructor_id" uuid NOT NULL,
	CONSTRAINT "batch_subject_instructors_pk" PRIMARY KEY("tenant_id","batch_subject_id","instructor_id")
);
--> statement-breakpoint
CREATE TABLE "batch_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batch_subjects_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "batch_subjects_batch_subject_unique" UNIQUE("tenant_id","batch_id","subject_id")
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"status" "academic_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "batches_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "batches_tenant_course_id_unique" UNIQUE("tenant_id","course_id","id")
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(10) NOT NULL,
	"description" text,
	"due_day" smallint,
	"status" "academic_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "courses_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "courses_code_format" CHECK ("courses"."code" ~ '^[A-Z][A-Z0-9]{0,9}$'),
	CONSTRAINT "courses_due_day" CHECK ("courses"."due_day" IS NULL OR "courses"."due_day" BETWEEN 1 AND 28 OR "courses"."due_day" = 31)
);
--> statement-breakpoint
CREATE TABLE "schedule_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"batch_subject_id" uuid NOT NULL,
	"weekday" "weekday" NOT NULL,
	"starts_at" time NOT NULL,
	"ends_at" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_slots_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "schedule_slots_subject_day_start_unique" UNIQUE("tenant_id","batch_subject_id","weekday","starts_at"),
	CONSTRAINT "schedule_slots_order" CHECK ("schedule_slots"."starts_at" < "schedule_slots"."ends_at")
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"status" "academic_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "subjects_tenant_course_id_unique" UNIQUE("tenant_id","course_id","id")
);
--> statement-breakpoint
ALTER TABLE "batch_subject_instructors" ADD CONSTRAINT "batch_subject_instructors_batch_subject_fk" FOREIGN KEY ("tenant_id","batch_subject_id") REFERENCES "public"."batch_subjects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_subject_instructors" ADD CONSTRAINT "batch_subject_instructors_instructor_fk" FOREIGN KEY ("tenant_id","instructor_id") REFERENCES "public"."instructors"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_subjects" ADD CONSTRAINT "batch_subjects_batch_fk" FOREIGN KEY ("tenant_id","course_id","batch_id") REFERENCES "public"."batches"("tenant_id","course_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_subjects" ADD CONSTRAINT "batch_subjects_subject_fk" FOREIGN KEY ("tenant_id","course_id","subject_id") REFERENCES "public"."subjects"("tenant_id","course_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_course_fk" FOREIGN KEY ("tenant_id","course_id") REFERENCES "public"."courses"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_batch_subject_fk" FOREIGN KEY ("tenant_id","batch_subject_id") REFERENCES "public"."batch_subjects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_course_fk" FOREIGN KEY ("tenant_id","course_id") REFERENCES "public"."courses"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "batch_subject_instructors_instructor_idx" ON "batch_subject_instructors" USING btree ("tenant_id","instructor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "batches_tenant_course_name_lower_idx" ON "batches" USING btree ("tenant_id","course_id",lower("name"));--> statement-breakpoint
CREATE INDEX "batches_tenant_status_idx" ON "batches" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "courses_tenant_name_lower_idx" ON "courses" USING btree ("tenant_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "courses_tenant_code_idx" ON "courses" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_tenant_course_name_lower_idx" ON "subjects" USING btree ("tenant_id","course_id",lower("name"));