ALTER TABLE "magic_data"."print_commits" RENAME COLUMN "metadata" TO "data";--> statement-breakpoint
CREATE INDEX "gatherer_set_code_idx" ON "magic_data"."gatherer" (lower("data" ->> 'setCode'));--> statement-breakpoint
CREATE INDEX "scryfall_cards_set_number_idx" ON "magic_data"."scryfall_cards" ("set","collector_number");