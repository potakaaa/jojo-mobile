ALTER TABLE "device_tokens" DROP CONSTRAINT "device_tokens_user_device_unique";--> statement-breakpoint
UPDATE "users" SET "marketing_opt_in" = false WHERE "marketing_opt_in" IS NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "marketing_opt_in" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "marketing_opt_in" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_device_unique" UNIQUE("device_id");