CREATE TYPE "public"."exam_kind" AS ENUM('WEEKLY', 'MONTHLY', 'MODEL', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."exam_state" AS ENUM('DRAFT', 'PUBLISHED');--> statement-breakpoint
CREATE TABLE "exam_batches" (
	"tenant_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	CONSTRAINT "exam_batches_pk" PRIMARY KEY("tenant_id","exam_id","batch_id")
);
--> statement-breakpoint
CREATE TABLE "exam_mark_parts" (
	"tenant_id" uuid NOT NULL,
	"mark_id" uuid NOT NULL,
	"part_id" uuid NOT NULL,
	"obtained" numeric(7, 2) NOT NULL,
	CONSTRAINT "exam_mark_parts_pk" PRIMARY KEY("tenant_id","mark_id","part_id"),
	CONSTRAINT "exam_mark_parts_obtained" CHECK ("exam_mark_parts"."obtained" >= 0)
);
--> statement-breakpoint
CREATE TABLE "exam_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"paper_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"absent" boolean DEFAULT false NOT NULL,
	"obtained" numeric(7, 2),
	"entered_by" uuid NOT NULL,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_marks_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "exam_marks_paper_student_unique" UNIQUE("tenant_id","paper_id","student_id"),
	CONSTRAINT "exam_marks_obtained" CHECK ("exam_marks"."obtained" IS NULL OR "exam_marks"."obtained" >= 0),
	CONSTRAINT "exam_marks_absent" CHECK (NOT ("exam_marks"."absent" AND "exam_marks"."obtained" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "exam_paper_parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"paper_id" uuid NOT NULL,
	"name" varchar(40) NOT NULL,
	"full_marks" numeric(7, 2) NOT NULL,
	"pass_marks" numeric(7, 2),
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "exam_paper_parts_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "exam_paper_parts_paper_name_unique" UNIQUE("tenant_id","paper_id","name"),
	CONSTRAINT "exam_paper_parts_marks" CHECK ("exam_paper_parts"."full_marks" > 0 AND ("exam_paper_parts"."pass_marks" IS NULL OR ("exam_paper_parts"."pass_marks" >= 0 AND "exam_paper_parts"."pass_marks" <= "exam_paper_parts"."full_marks")))
);
--> statement-breakpoint
CREATE TABLE "exam_papers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"full_marks" numeric(7, 2) NOT NULL,
	"pass_marks" numeric(7, 2) NOT NULL,
	"optional" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "exam_papers_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "exam_papers_exam_subject_unique" UNIQUE("tenant_id","exam_id","subject_id"),
	CONSTRAINT "exam_papers_marks" CHECK ("exam_papers"."full_marks" > 0 AND "exam_papers"."pass_marks" >= 0 AND "exam_papers"."pass_marks" <= "exam_papers"."full_marks")
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"kind" "exam_kind" NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"syllabus" text,
	"show_grades" boolean DEFAULT true NOT NULL,
	"state" "exam_state" DEFAULT 'DRAFT' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "exams_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "exams_tenant_id_course_unique" UNIQUE("tenant_id","id","course_id"),
	CONSTRAINT "exams_dates" CHECK ("exams"."starts_on" <= "exams"."ends_on"),
	CONSTRAINT "exams_published" CHECK (("exams"."state" = 'PUBLISHED') = ("exams"."published_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "grade_scales" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"bands" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "exam_batches" ADD CONSTRAINT "exam_batches_exam_fk" FOREIGN KEY ("tenant_id","exam_id","course_id") REFERENCES "public"."exams"("tenant_id","id","course_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_batches" ADD CONSTRAINT "exam_batches_batch_fk" FOREIGN KEY ("tenant_id","course_id","batch_id") REFERENCES "public"."batches"("tenant_id","course_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_mark_parts" ADD CONSTRAINT "exam_mark_parts_mark_fk" FOREIGN KEY ("tenant_id","mark_id") REFERENCES "public"."exam_marks"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_mark_parts" ADD CONSTRAINT "exam_mark_parts_part_fk" FOREIGN KEY ("tenant_id","part_id") REFERENCES "public"."exam_paper_parts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_marks" ADD CONSTRAINT "exam_marks_paper_fk" FOREIGN KEY ("tenant_id","paper_id") REFERENCES "public"."exam_papers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_marks" ADD CONSTRAINT "exam_marks_student_fk" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_marks" ADD CONSTRAINT "exam_marks_entered_by_fk" FOREIGN KEY ("tenant_id","entered_by") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_paper_parts" ADD CONSTRAINT "exam_paper_parts_paper_fk" FOREIGN KEY ("tenant_id","paper_id") REFERENCES "public"."exam_papers"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_papers" ADD CONSTRAINT "exam_papers_exam_fk" FOREIGN KEY ("tenant_id","exam_id","course_id") REFERENCES "public"."exams"("tenant_id","id","course_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_papers" ADD CONSTRAINT "exam_papers_subject_fk" FOREIGN KEY ("tenant_id","course_id","subject_id") REFERENCES "public"."subjects"("tenant_id","course_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_course_fk" FOREIGN KEY ("tenant_id","course_id") REFERENCES "public"."courses"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_published_by_fk" FOREIGN KEY ("tenant_id","published_by") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_scales" ADD CONSTRAINT "grade_scales_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exam_batches_batch_idx" ON "exam_batches" USING btree ("tenant_id","batch_id");--> statement-breakpoint
CREATE INDEX "exam_marks_student_idx" ON "exam_marks" USING btree ("tenant_id","student_id");--> statement-breakpoint
CREATE INDEX "exams_course_idx" ON "exams" USING btree ("tenant_id","course_id","starts_on");