ALTER TABLE "spots" ADD COLUMN "stamp_lat" double precision;--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN "stamp_lng" double precision;--> statement-breakpoint
ALTER TABLE "spots" ADD CONSTRAINT "spots_stamp_lat_range" CHECK ("spots"."stamp_lat" is null or "spots"."stamp_lat" between -90 and 90);--> statement-breakpoint
ALTER TABLE "spots" ADD CONSTRAINT "spots_stamp_lng_range" CHECK ("spots"."stamp_lng" is null or "spots"."stamp_lng" between -180 and 180);--> statement-breakpoint
ALTER TABLE "spots" ADD CONSTRAINT "spots_stamp_point_together" CHECK (("spots"."stamp_lat" is null) = ("spots"."stamp_lng" is null));