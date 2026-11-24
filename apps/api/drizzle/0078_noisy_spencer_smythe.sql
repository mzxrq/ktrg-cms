ALTER TABLE "places" ADD COLUMN "photos" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- A place's one photo becomes the first of its list, so the list editor shows it (and saving the list keeps it).
UPDATE "places" SET "photos" = jsonb_build_array(jsonb_build_object('url', "photo_url", 'credit', "photo_credit", 'sourceUrl', null)) WHERE "photo_url" IS NOT NULL;
