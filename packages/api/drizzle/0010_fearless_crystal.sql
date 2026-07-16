CREATE TABLE "deal_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_product_id" uuid NOT NULL,
	"component_product_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_deal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "deal_components" ADD CONSTRAINT "deal_components_deal_product_id_products_id_fk" FOREIGN KEY ("deal_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_components" ADD CONSTRAINT "deal_components_component_product_id_products_id_fk" FOREIGN KEY ("component_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deal_components_deal_component_idx" ON "deal_components" USING btree ("deal_product_id","component_product_id");