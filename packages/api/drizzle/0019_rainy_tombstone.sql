ALTER TABLE "deal_schedules" ADD COLUMN "recur_days" smallint[];--> statement-breakpoint
ALTER TABLE "deal_schedules" ADD COLUMN "recur_start_time" varchar(5);--> statement-breakpoint
ALTER TABLE "deal_schedules" ADD COLUMN "recur_end_time" varchar(5);