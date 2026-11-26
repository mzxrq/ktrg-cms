ALTER TABLE "spot_translations" ADD COLUMN "fly_note" text;--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN "fly_show" boolean;--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN "fly_seconds" smallint;--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN "fly_photo_url" text;--> statement-breakpoint
ALTER TABLE "spots" ADD CONSTRAINT "spots_fly_seconds_range" CHECK ("spots"."fly_seconds" is null or "spots"."fly_seconds" between 3 and 15);