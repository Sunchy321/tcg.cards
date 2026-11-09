ALTER TABLE "magic_data"."mtgch_scryfall_card" ALTER COLUMN "scryfall_id" SET DATA TYPE uuid USING "scryfall_id"::uuid;--> statement-breakpoint
ALTER TABLE "magic_data"."mtgch_scryfall_card" ALTER COLUMN "oracle_id" SET DATA TYPE uuid USING "oracle_id"::uuid;--> statement-breakpoint
ALTER TABLE "magic_data"."mtgch_scryfall_card" ALTER COLUMN "face_oracle_id" SET DATA TYPE uuid USING "face_oracle_id"::uuid;--> statement-breakpoint
ALTER TABLE "magic_data"."mtgch_zhs_oracle" ALTER COLUMN "face_oracle_id" SET DATA TYPE uuid USING "face_oracle_id"::uuid;--> statement-breakpoint
ALTER TABLE "magic_data"."mtgch_zhs_oracle" ALTER COLUMN "oracle_id" SET DATA TYPE uuid USING "oracle_id"::uuid;