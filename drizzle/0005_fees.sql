CREATE TYPE "public"."fee_charge_source" AS ENUM('GENERATED', 'FINE');--> statement-breakpoint
CREATE TYPE "public"."fee_charge_status" AS ENUM('ACTIVE', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."fee_item_kind" AS ENUM('ADMISSION', 'MONTHLY', 'ONE_TIME');--> statement-breakpoint
CREATE TYPE "public"."fee_payment_method" AS ENUM('CASH', 'BANK_TRANSFER', 'CHEQUE', 'BKASH', 'NAGAD', 'ROCKET', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."fee_payment_status" AS ENUM('VALID', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."fee_waiver_kind" AS ENUM('FIXED', 'PERCENT');--> statement-breakpoint
CREATE TABLE "fee_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"course_id" uuid,
	"fee_item_id" uuid,
	"generation_run_id" uuid,
	"source" "fee_charge_source" NOT NULL,
	"title" varchar(150) NOT NULL,
	"period" varchar(7),
	"amount" numeric(14, 2) NOT NULL,
	"due_date" date NOT NULL,
	"note" varchar(300),
	"status" "fee_charge_status" DEFAULT 'ACTIVE' NOT NULL,
	"cancel_reason" varchar(300),
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "fee_charges_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "fee_charges_amount_positive" CHECK ("fee_charges"."amount" > 0),
	CONSTRAINT "fee_charges_source" CHECK (("fee_charges"."source" = 'GENERATED' AND "fee_charges"."fee_item_id" IS NOT NULL AND "fee_charges"."generation_run_id" IS NOT NULL AND "fee_charges"."course_id" IS NOT NULL AND "fee_charges"."period" IS NOT NULL)
     OR ("fee_charges"."source" = 'FINE' AND "fee_charges"."fee_item_id" IS NULL AND "fee_charges"."generation_run_id" IS NULL AND "fee_charges"."period" IS NULL AND "fee_charges"."note" IS NOT NULL)),
	CONSTRAINT "fee_charges_cancellation" CHECK (("fee_charges"."status" = 'ACTIVE' AND "fee_charges"."cancelled_at" IS NULL AND "fee_charges"."cancel_reason" IS NULL) OR ("fee_charges"."status" = 'CANCELLED' AND "fee_charges"."cancelled_at" IS NOT NULL AND "fee_charges"."cancel_reason" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "fee_generation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"fee_item_id" uuid NOT NULL,
	"period" varchar(7) NOT NULL,
	"created_count" integer NOT NULL,
	"skipped" jsonb NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "fee_generation_runs_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "fee_generation_runs_period" CHECK ("fee_generation_runs"."period" = 'ONCE' OR "fee_generation_runs"."period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
CREATE TABLE "fee_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"kind" "fee_item_kind" NOT NULL,
	"name" varchar(100) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"status" "academic_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "fee_items_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "fee_items_amount_positive" CHECK ("fee_items"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "fee_payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	CONSTRAINT "fee_payment_allocations_payment_charge_unique" UNIQUE("tenant_id","payment_id","charge_id"),
	CONSTRAINT "fee_payment_allocations_amount_positive" CHECK ("fee_payment_allocations"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "fee_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"receipt_no" integer NOT NULL,
	"receipt_label" varchar(20) NOT NULL,
	"paid_on" date NOT NULL,
	"method" "fee_payment_method" NOT NULL,
	"reference" varchar(100),
	"amount" numeric(14, 2) NOT NULL,
	"remarks" varchar(500),
	"received_by" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"status" "fee_payment_status" DEFAULT 'VALID' NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_payments_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "fee_payments_tenant_receipt_unique" UNIQUE("tenant_id","receipt_no"),
	CONSTRAINT "fee_payments_tenant_idempotency_unique" UNIQUE("tenant_id","idempotency_key"),
	CONSTRAINT "fee_payments_amount_positive" CHECK ("fee_payments"."amount" > 0),
	CONSTRAINT "fee_payments_reference" CHECK ("fee_payments"."method" = 'CASH' OR "fee_payments"."reference" IS NOT NULL),
	CONSTRAINT "fee_payments_void" CHECK (("fee_payments"."status" = 'VALID' AND "fee_payments"."voided_at" IS NULL AND "fee_payments"."void_reason" IS NULL) OR ("fee_payments"."status" = 'VOID' AND "fee_payments"."voided_at" IS NOT NULL AND "fee_payments"."void_reason" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "fee_receipt_counters" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"next_value" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"method" "fee_payment_method" NOT NULL,
	"reference" varchar(100),
	"reason" varchar(300) NOT NULL,
	"refunded_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "fee_refunds_amount_positive" CHECK ("fee_refunds"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "fee_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"receipt_prefix" varchar(10) DEFAULT 'R' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "fee_settings_receipt_prefix" CHECK ("fee_settings"."receipt_prefix" ~ '^[A-Z][A-Z0-9]{0,9}$')
);
--> statement-breakpoint
CREATE TABLE "fee_waivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"kind" "fee_waiver_kind" NOT NULL,
	"value" numeric(14, 2) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"reason" varchar(300) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "fee_waivers_amount_positive" CHECK ("fee_waivers"."amount" > 0),
	CONSTRAINT "fee_waivers_value" CHECK ("fee_waivers"."value" > 0 AND ("fee_waivers"."kind" = 'FIXED' OR "fee_waivers"."value" <= 100))
);
--> statement-breakpoint
CREATE TABLE "student_fee_amounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"fee_item_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"reason" varchar(300) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "student_fee_amounts_student_item_unique" UNIQUE("tenant_id","student_id","fee_item_id"),
	CONSTRAINT "student_fee_amounts_amount" CHECK ("student_fee_amounts"."amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_student_fk" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_course_fk" FOREIGN KEY ("tenant_id","course_id") REFERENCES "public"."courses"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_item_fk" FOREIGN KEY ("tenant_id","fee_item_id") REFERENCES "public"."fee_items"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_run_fk" FOREIGN KEY ("tenant_id","generation_run_id") REFERENCES "public"."fee_generation_runs"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_generation_runs" ADD CONSTRAINT "fee_generation_runs_item_fk" FOREIGN KEY ("tenant_id","fee_item_id") REFERENCES "public"."fee_items"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_items" ADD CONSTRAINT "fee_items_course_fk" FOREIGN KEY ("tenant_id","course_id") REFERENCES "public"."courses"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_payment_allocations" ADD CONSTRAINT "fee_payment_allocations_payment_fk" FOREIGN KEY ("tenant_id","payment_id") REFERENCES "public"."fee_payments"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_payment_allocations" ADD CONSTRAINT "fee_payment_allocations_charge_fk" FOREIGN KEY ("tenant_id","charge_id") REFERENCES "public"."fee_charges"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_student_fk" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_received_by_fk" FOREIGN KEY ("tenant_id","received_by") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_receipt_counters" ADD CONSTRAINT "fee_receipt_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_refunds" ADD CONSTRAINT "fee_refunds_charge_fk" FOREIGN KEY ("tenant_id","charge_id") REFERENCES "public"."fee_charges"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_refunds" ADD CONSTRAINT "fee_refunds_payment_fk" FOREIGN KEY ("tenant_id","payment_id") REFERENCES "public"."fee_payments"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_refunds" ADD CONSTRAINT "fee_refunds_created_by_fk" FOREIGN KEY ("tenant_id","created_by") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_settings" ADD CONSTRAINT "fee_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_waivers" ADD CONSTRAINT "fee_waivers_charge_fk" FOREIGN KEY ("tenant_id","charge_id") REFERENCES "public"."fee_charges"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_fee_amounts" ADD CONSTRAINT "student_fee_amounts_student_fk" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_fee_amounts" ADD CONSTRAINT "student_fee_amounts_item_fk" FOREIGN KEY ("tenant_id","fee_item_id") REFERENCES "public"."fee_items"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fee_charges_active_month_idx" ON "fee_charges" USING btree ("tenant_id","student_id","fee_item_id","period") WHERE "fee_charges"."status" = 'ACTIVE' AND "fee_charges"."period" IS NOT NULL AND "fee_charges"."period" <> 'ONCE';--> statement-breakpoint
CREATE UNIQUE INDEX "fee_charges_active_once_idx" ON "fee_charges" USING btree ("tenant_id","student_id","fee_item_id") WHERE "fee_charges"."status" = 'ACTIVE' AND "fee_charges"."period" = 'ONCE';--> statement-breakpoint
CREATE INDEX "fee_charges_student_idx" ON "fee_charges" USING btree ("tenant_id","student_id");--> statement-breakpoint
CREATE INDEX "fee_charges_run_idx" ON "fee_charges" USING btree ("tenant_id","generation_run_id");--> statement-breakpoint
CREATE INDEX "fee_charges_due_idx" ON "fee_charges" USING btree ("tenant_id","status","due_date");--> statement-breakpoint
CREATE INDEX "fee_generation_runs_item_idx" ON "fee_generation_runs" USING btree ("tenant_id","fee_item_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_items_course_name_lower_idx" ON "fee_items" USING btree ("tenant_id","course_id",lower("name"));--> statement-breakpoint
CREATE INDEX "fee_payment_allocations_charge_idx" ON "fee_payment_allocations" USING btree ("tenant_id","charge_id");--> statement-breakpoint
CREATE INDEX "fee_payments_paid_on_idx" ON "fee_payments" USING btree ("tenant_id","paid_on");--> statement-breakpoint
CREATE INDEX "fee_payments_student_idx" ON "fee_payments" USING btree ("tenant_id","student_id");--> statement-breakpoint
CREATE INDEX "fee_refunds_charge_idx" ON "fee_refunds" USING btree ("tenant_id","charge_id");--> statement-breakpoint
CREATE INDEX "fee_refunds_refunded_on_idx" ON "fee_refunds" USING btree ("tenant_id","refunded_on");--> statement-breakpoint
CREATE INDEX "fee_waivers_charge_idx" ON "fee_waivers" USING btree ("tenant_id","charge_id");