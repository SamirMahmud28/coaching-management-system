CREATE TABLE "website_achievers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"result" varchar(80) NOT NULL,
	"exam" varchar(40),
	"photo_file_id" uuid,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "website_achievers_tenant_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "website_faculty" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"instructor_id" uuid NOT NULL,
	"line" varchar(120),
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "website_faculty_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "website_faculty_instructor_unique" UNIQUE("tenant_id","instructor_id")
);
--> statement-breakpoint
ALTER TABLE "website_achievers" ADD CONSTRAINT "website_achievers_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_achievers" ADD CONSTRAINT "website_achievers_photo_fk" FOREIGN KEY ("tenant_id","photo_file_id") REFERENCES "public"."files"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_achievers" ADD CONSTRAINT "website_achievers_updated_by_fk" FOREIGN KEY ("tenant_id","updated_by") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_faculty" ADD CONSTRAINT "website_faculty_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_faculty" ADD CONSTRAINT "website_faculty_instructor_fk" FOREIGN KEY ("tenant_id","instructor_id") REFERENCES "public"."instructors"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_faculty" ADD CONSTRAINT "website_faculty_updated_by_fk" FOREIGN KEY ("tenant_id","updated_by") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "website_achievers_order_idx" ON "website_achievers" USING btree ("tenant_id","sort_order");--> statement-breakpoint
CREATE INDEX "website_faculty_order_idx" ON "website_faculty" USING btree ("tenant_id","sort_order");