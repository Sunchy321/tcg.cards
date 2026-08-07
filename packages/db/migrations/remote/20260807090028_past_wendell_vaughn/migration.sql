DROP INDEX "idx_announcement_items_resolved_formats";--> statement-breakpoint
DROP INDEX "idx_announcement_items_resolved_cards";--> statement-breakpoint
ALTER TABLE "hearthstone"."announcement_items" ADD COLUMN "projection" jsonb DEFAULT '{"formats":[],"cards":[]}' NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone"."announcement_items" DROP COLUMN "resolved_formats";--> statement-breakpoint
ALTER TABLE "hearthstone"."announcement_items" DROP COLUMN "resolved_cards";