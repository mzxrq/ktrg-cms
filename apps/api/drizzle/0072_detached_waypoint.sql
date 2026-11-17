ALTER TABLE "spot_translations" ADD COLUMN "detached_label" text;--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN "detached" boolean DEFAULT false NOT NULL;