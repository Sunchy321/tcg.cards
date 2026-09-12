ALTER TABLE "magic_data"."card_slug_resolutions" RENAME COLUMN "oracle_ids" TO "unit_ids";--> statement-breakpoint
ALTER TABLE "magic_data"."card_slug_resolutions" ADD COLUMN "canonical_unit" text;--> statement-breakpoint
ALTER TABLE "magic_data"."card_slug_resolutions" ALTER COLUMN "unit_ids" SET DATA TYPE text[] USING "unit_ids"::text[];