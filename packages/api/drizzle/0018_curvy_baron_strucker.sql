CREATE TABLE "deal_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_product_id" uuid NOT NULL,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deal_schedules" ADD CONSTRAINT "deal_schedules_deal_product_id_products_id_fk" FOREIGN KEY ("deal_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;