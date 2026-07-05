ALTER TABLE "hearthstone_data"."card_image_assets" ADD COLUMN "category" text DEFAULT 'base';--> statement-breakpoint
ALTER TABLE "hearthstone_data"."card_image_assets" DROP COLUMN "image_spec_version";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."card_image_assets" ADD PRIMARY KEY ("render_hash","category","zone","template","premium");--> statement-breakpoint
DROP INDEX "card_image_assets_variant_status_idx";--> statement-breakpoint
CREATE INDEX "card_image_assets_variant_status_idx" ON "hearthstone_data"."card_image_assets" ("category","zone","template","premium","status");