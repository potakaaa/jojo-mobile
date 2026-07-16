ALTER TABLE "deals" RENAME TO "offers";--> statement-breakpoint
ALTER TABLE "deal_products" RENAME TO "offer_products";--> statement-breakpoint
ALTER TABLE "offer_products" RENAME COLUMN "deal_id" TO "offer_id";--> statement-breakpoint
ALTER TABLE "deal_branches" RENAME TO "offer_branches";--> statement-breakpoint
ALTER TABLE "offer_branches" RENAME COLUMN "deal_id" TO "offer_id";--> statement-breakpoint
ALTER TABLE "coupons" RENAME COLUMN "deal_id" TO "offer_id";--> statement-breakpoint
ALTER TABLE "coupons" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"start_at" timestamp NOT NULL,
	"end_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "promotion_id" uuid;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE no action ON UPDATE no action;
