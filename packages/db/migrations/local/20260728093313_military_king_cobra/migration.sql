ALTER TABLE "hearthstone_data"."extracted_card" ALTER COLUMN "gameplay_event" SET DATA TYPE text USING "gameplay_event"::text;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."extracted_card" ALTER COLUMN "crafting_event" SET DATA TYPE text USING "crafting_event"::text;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."extracted_card" ALTER COLUMN "golden_crafting_event" SET DATA TYPE text USING "golden_crafting_event"::text;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."extracted_card" ALTER COLUMN "signature_crafting_event" SET DATA TYPE text USING "signature_crafting_event"::text;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."extracted_card" ALTER COLUMN "diamond_crafting_event" SET DATA TYPE text USING "diamond_crafting_event"::text;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."extracted_card" ALTER COLUMN "featured_cards_event" SET DATA TYPE text USING "featured_cards_event"::text;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."extracted_card" ALTER COLUMN "battlegrounds_active_event" SET DATA TYPE text USING "battlegrounds_active_event"::text;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."extracted_card" ALTER COLUMN "battlegrounds_early_access_event" SET DATA TYPE text USING "battlegrounds_early_access_event"::text;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."extracted_card" ALTER COLUMN "battlegrounds_every_game_event" SET DATA TYPE text USING "battlegrounds_every_game_event"::text;