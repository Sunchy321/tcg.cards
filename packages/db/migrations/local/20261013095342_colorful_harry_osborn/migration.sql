DROP INDEX "magic"."idx_announcement_items_resolved_formats";--> statement-breakpoint
DROP INDEX "magic"."idx_announcement_items_resolved_cards";--> statement-breakpoint
ALTER TABLE "magic"."announcements" ADD COLUMN "prev_version" text;--> statement-breakpoint
ALTER TABLE "magic"."announcement_items" ADD COLUMN "prev_version" text;--> statement-breakpoint
ALTER TABLE "magic"."announcement_items" ADD COLUMN "projection" jsonb DEFAULT '{"formats":[],"cards":[]}' NOT NULL;--> statement-breakpoint
-- Backfill the projection jsonb from the dropped resolved columns before they are removed.
UPDATE "magic"."announcement_items" SET "projection" = jsonb_build_object('formats', to_jsonb("resolved_formats"), 'cards', to_jsonb("resolved_cards"));--> statement-breakpoint
ALTER TABLE "magic"."announcement_items" DROP COLUMN "resolved_formats";--> statement-breakpoint
ALTER TABLE "magic"."announcement_items" DROP COLUMN "resolved_cards";
