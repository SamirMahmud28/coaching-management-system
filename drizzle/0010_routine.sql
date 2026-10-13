CREATE TYPE "public"."lesson_topic_status" AS ENUM('PENDING', 'ONGOING', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."routine_change_kind" AS ENUM('CANCEL', 'RESCHEDULE', 'SUBSTITUTE');--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"withdrawn_by" uuid,
	CONSTRAINT "holidays_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "holidays_dates" CHECK ("holidays"."from_date" <= "holidays"."to_date"),
	CONSTRAINT "holidays_withdrawn" CHECK (("holidays"."withdrawn_at" IS NULL) = ("holidays"."withdrawn_by" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "lesson_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"batch_subject_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"start_date" date,
	"target_date" date,
	"status" "lesson_topic_status" DEFAULT 'PENDING' NOT NULL,
	"completed_on" date,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "lesson_topics_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "lesson_topics_dates" CHECK ("lesson_topics"."start_date" IS NULL OR "lesson_topics"."target_date" IS NULL OR "lesson_topics"."start_date" <= "lesson_topics"."target_date"),
	CONSTRAINT "lesson_topics_completed" CHECK (("lesson_topics"."status" = 'COMPLETED') = ("lesson_topics"."completed_on" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "routine_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"batch_subject_id" uuid NOT NULL,
	"class_date" date NOT NULL,
	"starts_at" time NOT NULL,
	"kind" "routine_change_kind" NOT NULL,
	"reason" varchar(300),
	"new_date" date,
	"new_starts_at" time,
	"new_ends_at" time,
	"substitute_instructor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"withdrawn_by" uuid,
	CONSTRAINT "routine_changes_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "routine_changes_shape" CHECK (("routine_changes"."kind" = 'CANCEL' AND "routine_changes"."reason" IS NOT NULL AND "routine_changes"."new_date" IS NULL AND "routine_changes"."substitute_instructor_id" IS NULL)
     OR ("routine_changes"."kind" = 'RESCHEDULE' AND "routine_changes"."new_date" IS NOT NULL AND "routine_changes"."new_starts_at" IS NOT NULL AND "routine_changes"."new_ends_at" IS NOT NULL AND "routine_changes"."new_starts_at" < "routine_changes"."new_ends_at" AND "routine_changes"."substitute_instructor_id" IS NULL)
     OR ("routine_changes"."kind" = 'SUBSTITUTE' AND "routine_changes"."substitute_instructor_id" IS NOT NULL AND "routine_changes"."new_date" IS NULL)),
	CONSTRAINT "routine_changes_withdrawn" CHECK (("routine_changes"."withdrawn_at" IS NULL) = ("routine_changes"."withdrawn_by" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_created_by_fk" FOREIGN KEY ("tenant_id","created_by") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_withdrawn_by_fk" FOREIGN KEY ("tenant_id","withdrawn_by") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_topics" ADD CONSTRAINT "lesson_topics_batch_subject_fk" FOREIGN KEY ("tenant_id","batch_subject_id") REFERENCES "public"."batch_subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_changes" ADD CONSTRAINT "routine_changes_batch_subject_fk" FOREIGN KEY ("tenant_id","batch_subject_id") REFERENCES "public"."batch_subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_changes" ADD CONSTRAINT "routine_changes_substitute_fk" FOREIGN KEY ("tenant_id","substitute_instructor_id") REFERENCES "public"."instructors"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_changes" ADD CONSTRAINT "routine_changes_created_by_fk" FOREIGN KEY ("tenant_id","created_by") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_changes" ADD CONSTRAINT "routine_changes_withdrawn_by_fk" FOREIGN KEY ("tenant_id","withdrawn_by") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "holidays_dates_idx" ON "holidays" USING btree ("tenant_id","from_date","to_date");--> statement-breakpoint
CREATE INDEX "lesson_topics_batch_subject_idx" ON "lesson_topics" USING btree ("tenant_id","batch_subject_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "routine_changes_active_unique" ON "routine_changes" USING btree ("tenant_id","batch_subject_id","class_date","starts_at") WHERE "routine_changes"."withdrawn_at" IS NULL;--> statement-breakpoint
CREATE INDEX "routine_changes_date_idx" ON "routine_changes" USING btree ("tenant_id","class_date");--> statement-breakpoint
CREATE INDEX "routine_changes_new_date_idx" ON "routine_changes" USING btree ("tenant_id","new_date");