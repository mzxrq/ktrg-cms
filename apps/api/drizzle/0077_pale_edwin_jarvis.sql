ALTER TABLE "spots" DROP CONSTRAINT "spots_stamp_lat_range";--> statement-breakpoint
ALTER TABLE "spots" DROP CONSTRAINT "spots_stamp_lng_range";--> statement-breakpoint
ALTER TABLE "spots" DROP CONSTRAINT "spots_stamp_point_together";--> statement-breakpoint
ALTER TABLE "spots" DROP COLUMN "stamp_lat";--> statement-breakpoint
ALTER TABLE "spots" DROP COLUMN "stamp_lng";