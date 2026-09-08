CREATE TYPE "shadowverse_data"."evolve_image_import_batch_status" AS ENUM('running', 'completed', 'completed_with_errors', 'failed', 'interrupted');--> statement-breakpoint
CREATE TYPE "shadowverse_data"."evolve_import_batch_status" AS ENUM('running', 'completed', 'completed_with_errors', 'failed', 'interrupted');--> statement-breakpoint
CREATE TABLE "shadowverse"."evolve_cards" (
	"card_no" text PRIMARY KEY,
	"card_set_code" text,
	"craft" text,
	"card_type" text,
	"tribes" text,
	"rarity" text,
	"cost" integer,
	"attack" integer,
	"life" integer,
	"related_card_nos" text[],
	"image_url_ja" text,
	"image_url_en" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "shadowverse"."evolve_card_localizations" (
	"card_no" text,
	"lang" text,
	"name" text NOT NULL,
	"skill_text" text,
	"flavour_text" text,
	"illustrator" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evolve_card_localizations_pkey" PRIMARY KEY("card_no","lang"),
	CONSTRAINT "evolve_card_localizations_lang_chk" CHECK ("lang" in ('ja', 'en', 'zh-cn')),
	CONSTRAINT "evolve_card_localizations_name_nonempty_chk" CHECK (length("name") > 0)
);
--> statement-breakpoint
CREATE TABLE "shadowverse"."evolve_card_questions" (
	"id" text PRIMARY KEY,
	"card_no" text NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"answered_at" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shadowverse"."evolve_card_sets" (
	"card_set_code" text PRIMARY KEY,
	"name" text NOT NULL,
	"release_date" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "evolve_card_sets_name_nonempty_chk" CHECK (length("name") > 0)
);
--> statement-breakpoint
CREATE TABLE "shadowverse_data"."evolve_image_assets" (
	"id" bigserial PRIMARY KEY,
	"lang" text NOT NULL,
	"card_no" text NOT NULL,
	"file_path" text NOT NULL,
	"byte_size" integer,
	"downloaded_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evolve_image_assets_lang_chk" CHECK ("lang" in ('ja', 'en'))
);
--> statement-breakpoint
CREATE TABLE "shadowverse_data"."evolve_image_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source" text NOT NULL,
	"asset_count" integer DEFAULT 0 NOT NULL,
	"downloaded_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"missing_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"downloaded_byte_count" integer DEFAULT 0 NOT NULL,
	"status" "shadowverse_data"."evolve_image_import_batch_status" DEFAULT 'running'::"shadowverse_data"."evolve_image_import_batch_status" NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "evolve_image_import_batches_asset_count_nonnegative_chk" CHECK ("asset_count" >= 0),
	CONSTRAINT "evolve_image_import_batches_downloaded_count_nonnegative_chk" CHECK ("downloaded_count" >= 0),
	CONSTRAINT "evolve_image_import_batches_skipped_count_nonnegative_chk" CHECK ("skipped_count" >= 0),
	CONSTRAINT "evolve_image_import_batches_missing_count_nonnegative_chk" CHECK ("missing_count" >= 0),
	CONSTRAINT "evolve_image_import_batches_failed_count_nonnegative_chk" CHECK ("failed_count" >= 0),
	CONSTRAINT "evolve_image_import_batches_downloaded_byte_count_nonnegative_chk" CHECK ("downloaded_byte_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "shadowverse_data"."evolve_image_import_failures" (
	"batch_id" uuid,
	"asset_key" text,
	"stage" text NOT NULL,
	"code" text NOT NULL,
	"message" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evolve_image_import_failures_pkey" PRIMARY KEY("batch_id","asset_key")
);
--> statement-breakpoint
CREATE TABLE "shadowverse_data"."evolve_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source" text NOT NULL,
	"source_url" text NOT NULL,
	"source_record_count" integer DEFAULT 0 NOT NULL,
	"added_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"soft_deleted_count" integer DEFAULT 0 NOT NULL,
	"status" "shadowverse_data"."evolve_import_batch_status" DEFAULT 'running'::"shadowverse_data"."evolve_import_batch_status" NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "evolve_import_batches_source_record_count_nonnegative_chk" CHECK ("source_record_count" >= 0),
	CONSTRAINT "evolve_import_batches_added_count_nonnegative_chk" CHECK ("added_count" >= 0),
	CONSTRAINT "evolve_import_batches_updated_count_nonnegative_chk" CHECK ("updated_count" >= 0),
	CONSTRAINT "evolve_import_batches_skipped_count_nonnegative_chk" CHECK ("skipped_count" >= 0),
	CONSTRAINT "evolve_import_batches_failed_count_nonnegative_chk" CHECK ("failed_count" >= 0),
	CONSTRAINT "evolve_import_batches_soft_deleted_count_nonnegative_chk" CHECK ("soft_deleted_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "shadowverse_data"."evolve_import_failures" (
	"batch_id" uuid,
	"source_record_id" text,
	"stage" text NOT NULL,
	"code" text NOT NULL,
	"message" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evolve_import_failures_pkey" PRIMARY KEY("batch_id","source_record_id")
);
--> statement-breakpoint
CREATE TABLE "shadowverse_data"."evolve_import_states" (
	"source" text PRIMARY KEY,
	"source_url" text NOT NULL,
	"last_successful_batch_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "evolve_cards_card_set_code_idx" ON "shadowverse"."evolve_cards" ("card_set_code");--> statement-breakpoint
CREATE INDEX "evolve_cards_craft_idx" ON "shadowverse"."evolve_cards" ("craft");--> statement-breakpoint
CREATE INDEX "evolve_cards_rarity_idx" ON "shadowverse"."evolve_cards" ("rarity");--> statement-breakpoint
CREATE INDEX "evolve_cards_deleted_at_idx" ON "shadowverse"."evolve_cards" ("deleted_at");--> statement-breakpoint
CREATE INDEX "evolve_card_localizations_lang_idx" ON "shadowverse"."evolve_card_localizations" ("lang");--> statement-breakpoint
CREATE INDEX "evolve_card_localizations_name_idx" ON "shadowverse"."evolve_card_localizations" ("name");--> statement-breakpoint
CREATE INDEX "evolve_card_questions_card_no_idx" ON "shadowverse"."evolve_card_questions" ("card_no");--> statement-breakpoint
CREATE INDEX "evolve_card_sets_deleted_at_idx" ON "shadowverse"."evolve_card_sets" ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "evolve_image_assets_lang_card_no_uidx" ON "shadowverse_data"."evolve_image_assets" ("lang","card_no");--> statement-breakpoint
CREATE INDEX "evolve_image_assets_card_no_idx" ON "shadowverse_data"."evolve_image_assets" ("card_no");--> statement-breakpoint
CREATE INDEX "evolve_image_assets_retired_at_idx" ON "shadowverse_data"."evolve_image_assets" ("retired_at");--> statement-breakpoint
CREATE INDEX "evolve_image_import_batches_source_started_at_idx" ON "shadowverse_data"."evolve_image_import_batches" ("source","started_at");--> statement-breakpoint
CREATE INDEX "evolve_image_import_failures_batch_id_idx" ON "shadowverse_data"."evolve_image_import_failures" ("batch_id");--> statement-breakpoint
CREATE INDEX "evolve_import_batches_source_started_at_idx" ON "shadowverse_data"."evolve_import_batches" ("source","started_at");--> statement-breakpoint
CREATE INDEX "evolve_import_batches_status_started_at_idx" ON "shadowverse_data"."evolve_import_batches" ("status","started_at");--> statement-breakpoint
CREATE INDEX "evolve_import_failures_batch_id_idx" ON "shadowverse_data"."evolve_import_failures" ("batch_id");--> statement-breakpoint
ALTER TABLE "shadowverse"."evolve_cards" ADD CONSTRAINT "evolve_cards_card_set_code_evolve_card_sets_card_set_code_fkey" FOREIGN KEY ("card_set_code") REFERENCES "shadowverse"."evolve_card_sets"("card_set_code");--> statement-breakpoint
ALTER TABLE "shadowverse"."evolve_card_localizations" ADD CONSTRAINT "evolve_card_localizations_card_no_evolve_cards_card_no_fkey" FOREIGN KEY ("card_no") REFERENCES "shadowverse"."evolve_cards"("card_no") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "shadowverse"."evolve_card_questions" ADD CONSTRAINT "evolve_card_questions_card_no_evolve_cards_card_no_fkey" FOREIGN KEY ("card_no") REFERENCES "shadowverse"."evolve_cards"("card_no") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "shadowverse_data"."evolve_image_assets" ADD CONSTRAINT "evolve_image_assets_card_no_evolve_cards_card_no_fkey" FOREIGN KEY ("card_no") REFERENCES "shadowverse"."evolve_cards"("card_no") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "shadowverse_data"."evolve_image_import_failures" ADD CONSTRAINT "evolve_image_import_failures_nj59BZZ96sRh_fkey" FOREIGN KEY ("batch_id") REFERENCES "shadowverse_data"."evolve_image_import_batches"("id");--> statement-breakpoint
ALTER TABLE "shadowverse_data"."evolve_import_failures" ADD CONSTRAINT "evolve_import_failures_batch_id_evolve_import_batches_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "shadowverse_data"."evolve_import_batches"("id");--> statement-breakpoint
ALTER TABLE "shadowverse_data"."evolve_import_states" ADD CONSTRAINT "evolve_import_states_vFOn0hEpbzwW_fkey" FOREIGN KEY ("last_successful_batch_id") REFERENCES "shadowverse_data"."evolve_import_batches"("id");