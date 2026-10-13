ALTER TABLE "magic_data"."scryfall_cards" ALTER COLUMN "oracle_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "magic_data"."scryfall_cards" ALTER COLUMN "type_line" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "magic_data"."scryfall_cards" ALTER COLUMN "cmc" DROP NOT NULL;