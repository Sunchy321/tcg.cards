CREATE TABLE "hearthstone_data"."extracted_card_tags" (
	"snapshot_id" uuid,
	"dbf_id" integer NOT NULL,
	"tag_id" integer,
	"tag_value" integer NOT NULL,
	"is_reference_tag" boolean NOT NULL,
	"is_power_keyword_tag" boolean NOT NULL,
	CONSTRAINT "extracted_card_tags_pkey" PRIMARY KEY("snapshot_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "hearthstone_data"."unpack_card_data" RENAME TO "extracted_card";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."extracted_card" ADD COLUMN "id" uuid DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "hearthstone_data"."extracted_card" ADD COLUMN "build_numbers" integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."extracted_card" ADD COLUMN "snapshot_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."extracted_card" ADD COLUMN "projection_state" text DEFAULT 'not_projected' NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."extracted_card" RENAME CONSTRAINT "unpack_card_data_pkey" TO "extracted_card_pkey";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."extracted_card" DROP COLUMN "build_number";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."extracted_card" ADD PRIMARY KEY ("id");--> statement-breakpoint
CREATE UNIQUE INDEX "extracted_card_card_hash_uq" ON "hearthstone_data"."extracted_card" ("card_id","snapshot_hash");--> statement-breakpoint
CREATE INDEX "extracted_card_card_id_idx" ON "hearthstone_data"."extracted_card" ("card_id");--> statement-breakpoint
CREATE INDEX "extracted_card_build_numbers_gin_idx" ON "hearthstone_data"."extracted_card" USING gin ("build_numbers");--> statement-breakpoint
CREATE INDEX "extracted_card_projection_state_idx" ON "hearthstone_data"."extracted_card" ("projection_state") WHERE "projection_state" != 'projected';--> statement-breakpoint
CREATE INDEX "extracted_card_tags_dbf_id_idx" ON "hearthstone_data"."extracted_card_tags" ("dbf_id");--> statement-breakpoint
ALTER TABLE "hearthstone_data"."extracted_card_tags" ADD CONSTRAINT "extracted_card_tags_snapshot_id_extracted_card_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "hearthstone_data"."extracted_card"("id") ON DELETE CASCADE;