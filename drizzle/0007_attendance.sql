CREATE TYPE "public"."attendance_class_source" AS ENUM('SCHEDULED', 'EXTRA');--> statement-breakpoint
CREATE TYPE "public"."attendance_class_state" AS ENUM('OPEN', 'TAKEN', 'NOT_HELD');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');--> statement-breakpoint
CREATE TYPE "public"."leave_source" AS ENUM('STUDENT', 'OFFICE');--> statement-breakpoint
CREATE TYPE "public"."leave_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'REVOKED');--> statement-breakpoint
CREATE TABLE "attendance_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"batch_subject_id" uuid NOT NULL,
	"source" "attendance_class_source" NOT NULL,
	"class_date" date NOT NULL,
	"starts_at" time NOT NULL,
	"ends_at" time NOT NULL,
	"state" "attendance_class_state" NOT NULL,
	"not_held_reason" varchar(300),
	"taken_at" timestamp with time zone,
	"taken_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_classes_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "attendance_classes_subject_date_start_unique" UNIQUE("tenant_id","batch_subject_id","class_date","starts_at"),
	CONSTRAINT "attendance_classes_times" CHECK ("attendance_classes"."starts_at" < "attendance_classes"."ends_at"),
	CONSTRAINT "attendance_classes_not_held" CHECK (("attendance_classes"."state" = 'NOT_HELD') = ("attendance_classes"."not_held_reason" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "attendance_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"status" "attendance_status",
	"leave_id" uuid,
	"marked_at" timestamp with time zone,
	"marked_by" uuid,
	CONSTRAINT "attendance_marks_tenant_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "leave_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"reason" text NOT NULL,
	"source" "leave_source" NOT NULL,
	"status" "leave_status" NOT NULL,
	"applied_by" uuid NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" varchar(300),
	"revoked_by" uuid,
	"revoked_at" timestamp with time zone,
	"revoke_reason" varchar(300),
	CONSTRAINT "leave_applications_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "leave_applications_dates" CHECK ("leave_applications"."from_date" <= "leave_applications"."to_date"),
	CONSTRAINT "leave_applications_revoked" CHECK (("leave_applications"."status" = 'REVOKED') = ("leave_applications"."revoke_reason" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "attendance_classes" ADD CONSTRAINT "attendance_classes_batch_subject_fk" FOREIGN KEY ("tenant_id","batch_subject_id") REFERENCES "public"."batch_subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_classes" ADD CONSTRAINT "attendance_classes_taken_by_fk" FOREIGN KEY ("tenant_id","taken_by") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_marks" ADD CONSTRAINT "attendance_marks_class_fk" FOREIGN KEY ("tenant_id","class_id") REFERENCES "public"."attendance_classes"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_marks" ADD CONSTRAINT "attendance_marks_student_fk" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_marks" ADD CONSTRAINT "attendance_marks_membership_fk" FOREIGN KEY ("tenant_id","membership_id") REFERENCES "public"."batch_memberships"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_marks" ADD CONSTRAINT "attendance_marks_leave_fk" FOREIGN KEY ("tenant_id","leave_id") REFERENCES "public"."leave_applications"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_marks" ADD CONSTRAINT "attendance_marks_marked_by_fk" FOREIGN KEY ("tenant_id","marked_by") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_student_fk" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_applied_by_fk" FOREIGN KEY ("tenant_id","applied_by") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_classes_date_idx" ON "attendance_classes" USING btree ("tenant_id","class_date");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_marks_class_student_unique" ON "attendance_marks" USING btree ("tenant_id","class_id","student_id");--> statement-breakpoint
CREATE INDEX "attendance_marks_student_idx" ON "attendance_marks" USING btree ("tenant_id","student_id");--> statement-breakpoint
CREATE INDEX "attendance_marks_leave_idx" ON "attendance_marks" USING btree ("tenant_id","leave_id");--> statement-breakpoint
CREATE INDEX "leave_applications_student_idx" ON "leave_applications" USING btree ("tenant_id","student_id","from_date");--> statement-breakpoint
CREATE INDEX "leave_applications_status_idx" ON "leave_applications" USING btree ("tenant_id","status");