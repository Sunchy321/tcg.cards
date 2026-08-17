CREATE TYPE "yugioh_data"."image_import_batch_status" AS ENUM('running', 'completed', 'completed_with_errors', 'failed', 'interrupted');--> statement-breakpoint
CREATE TABLE "yugioh_data"."card_image_sources" (
	"source" text,
	"source_record_id" text,
	"card_id" bigint NOT NULL,
	"source_url" text NOT NULL,
	"source_md5" varchar(32) NOT NULL,
	"source_byte_size" integer NOT NULL,
	"source_modified_at" timestamp with time zone NOT NULL,
	"asset_sha256" varchar(64) NOT NULL,
	"r2_key" text NOT NULL,
	"first_seen_batch_id" uuid NOT NULL,
	"last_seen_batch_id" uuid NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_image_sources_pkey" PRIMARY KEY("source","source_record_id"),
	CONSTRAINT "card_image_sources_source_md5_format_chk" CHECK ("source_md5" ~ '^[a-f0-9]{32}$'),
	CONSTRAINT "card_image_sources_asset_sha256_format_chk" CHECK ("asset_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "card_image_sources_source_byte_size_positive_chk" CHECK ("source_byte_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "yugioh_data"."image_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source" text NOT NULL,
	"metadata_url" text NOT NULL,
	"metadata_hash" varchar(64),
	"etag" text,
	"last_modified" text,
	"metadata_record_count" integer DEFAULT 0 NOT NULL,
	"eligible_card_count" integer DEFAULT 0 NOT NULL,
	"unavailable_card_count" integer DEFAULT 0 NOT NULL,
	"unmatched_source_count" integer DEFAULT 0 NOT NULL,
	"added_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"missing_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"soft_deleted_count" integer DEFAULT 0 NOT NULL,
	"downloaded_byte_count" bigint DEFAULT 0 NOT NULL,
	"status" "yugioh_data"."image_import_batch_status" DEFAULT 'running'::"yugioh_data"."image_import_batch_status" NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "image_import_batches_metadata_record_count_nonnegative_chk" CHECK ("metadata_record_count" >= 0),
	CONSTRAINT "image_import_batches_eligible_card_count_nonnegative_chk" CHECK ("eligible_card_count" >= 0),
	CONSTRAINT "image_import_batches_unavailable_card_count_nonnegative_chk" CHECK ("unavailable_card_count" >= 0),
	CONSTRAINT "image_import_batches_unmatched_source_count_nonnegative_chk" CHECK ("unmatched_source_count" >= 0),
	CONSTRAINT "image_import_batches_added_count_nonnegative_chk" CHECK ("added_count" >= 0),
	CONSTRAINT "image_import_batches_updated_count_nonnegative_chk" CHECK ("updated_count" >= 0),
	CONSTRAINT "image_import_batches_skipped_count_nonnegative_chk" CHECK ("skipped_count" >= 0),
	CONSTRAINT "image_import_batches_missing_count_nonnegative_chk" CHECK ("missing_count" >= 0),
	CONSTRAINT "image_import_batches_failed_count_nonnegative_chk" CHECK ("failed_count" >= 0),
	CONSTRAINT "image_import_batches_soft_deleted_count_nonnegative_chk" CHECK ("soft_deleted_count" >= 0),
	CONSTRAINT "image_import_batches_downloaded_byte_count_nonnegative_chk" CHECK ("downloaded_byte_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "yugioh_data"."image_import_failures" (
	"batch_id" uuid,
	"source_record_id" text,
	"stage" text NOT NULL,
	"code" text NOT NULL,
	"message" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "image_import_failures_pkey" PRIMARY KEY("batch_id","source_record_id")
);
--> statement-breakpoint
CREATE TABLE "yugioh_data"."image_import_states" (
	"source" text PRIMARY KEY,
	"metadata_url" text NOT NULL,
	"last_successful_batch_id" uuid,
	"metadata_hash" varchar(64),
	"etag" text,
	"last_modified" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "yugioh"."cards" ADD COLUMN "primary_image_r2_bucket" text;--> statement-breakpoint
ALTER TABLE "yugioh"."cards" ADD COLUMN "primary_image_r2_key" text;--> statement-breakpoint
ALTER TABLE "yugioh"."cards" ADD COLUMN "primary_image_content_type" text;--> statement-breakpoint
ALTER TABLE "yugioh"."cards" ADD COLUMN "primary_image_byte_size" integer;--> statement-breakpoint
ALTER TABLE "yugioh"."cards" ADD COLUMN "primary_image_width" integer;--> statement-breakpoint
ALTER TABLE "yugioh"."cards" ADD COLUMN "primary_image_height" integer;--> statement-breakpoint
ALTER TABLE "yugioh"."cards" ADD COLUMN "primary_image_sha256" varchar(64);--> statement-breakpoint
ALTER TABLE "yugioh"."cards" ADD COLUMN "primary_image_deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "cards_primary_image_r2_key_uidx" ON "yugioh"."cards" ("primary_image_r2_key");--> statement-breakpoint
CREATE INDEX "cards_primary_image_deleted_at_idx" ON "yugioh"."cards" ("primary_image_deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "card_image_sources_source_card_id_active_uidx" ON "yugioh_data"."card_image_sources" ("source","card_id") WHERE "retired_at" is null;--> statement-breakpoint
CREATE INDEX "card_image_sources_card_id_idx" ON "yugioh_data"."card_image_sources" ("card_id");--> statement-breakpoint
CREATE INDEX "card_image_sources_last_seen_batch_id_idx" ON "yugioh_data"."card_image_sources" ("last_seen_batch_id");--> statement-breakpoint
CREATE INDEX "card_image_sources_retired_at_idx" ON "yugioh_data"."card_image_sources" ("retired_at");--> statement-breakpoint
CREATE INDEX "image_import_batches_source_started_at_idx" ON "yugioh_data"."image_import_batches" ("source","started_at");--> statement-breakpoint
CREATE INDEX "image_import_batches_status_started_at_idx" ON "yugioh_data"."image_import_batches" ("status","started_at");--> statement-breakpoint
CREATE INDEX "image_import_batches_metadata_hash_idx" ON "yugioh_data"."image_import_batches" ("metadata_hash");--> statement-breakpoint
CREATE INDEX "image_import_failures_batch_id_idx" ON "yugioh_data"."image_import_failures" ("batch_id");--> statement-breakpoint
ALTER TABLE "yugioh_data"."card_image_sources" ADD CONSTRAINT "card_image_sources_card_id_cards_id_fkey" FOREIGN KEY ("card_id") REFERENCES "yugioh"."cards"("id");--> statement-breakpoint
ALTER TABLE "yugioh_data"."card_image_sources" ADD CONSTRAINT "card_image_sources_F5kfRtKjGm5K_fkey" FOREIGN KEY ("first_seen_batch_id") REFERENCES "yugioh_data"."image_import_batches"("id");--> statement-breakpoint
ALTER TABLE "yugioh_data"."card_image_sources" ADD CONSTRAINT "card_image_sources_TOlT0mqbm6qg_fkey" FOREIGN KEY ("last_seen_batch_id") REFERENCES "yugioh_data"."image_import_batches"("id");--> statement-breakpoint
ALTER TABLE "yugioh_data"."image_import_failures" ADD CONSTRAINT "image_import_failures_batch_id_image_import_batches_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "yugioh_data"."image_import_batches"("id");--> statement-breakpoint
ALTER TABLE "yugioh_data"."image_import_states" ADD CONSTRAINT "image_import_states_oJUkAzOokddw_fkey" FOREIGN KEY ("last_successful_batch_id") REFERENCES "yugioh_data"."image_import_batches"("id");--> statement-breakpoint
ALTER TABLE "yugioh"."cards" ADD CONSTRAINT "cards_primary_image_sha256_format_chk" CHECK ("primary_image_sha256" is null or "primary_image_sha256" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
ALTER TABLE "yugioh"."cards" ADD CONSTRAINT "cards_primary_image_byte_size_positive_chk" CHECK ("primary_image_byte_size" is null or "primary_image_byte_size" > 0);--> statement-breakpoint
ALTER TABLE "yugioh"."cards" ADD CONSTRAINT "cards_primary_image_width_positive_chk" CHECK ("primary_image_width" is null or "primary_image_width" > 0);--> statement-breakpoint
ALTER TABLE "yugioh"."cards" ADD CONSTRAINT "cards_primary_image_height_positive_chk" CHECK ("primary_image_height" is null or "primary_image_height" > 0);--> statement-breakpoint
ALTER TABLE "yugioh"."cards" ADD CONSTRAINT "cards_primary_image_fields_complete_chk" CHECK (
    ("primary_image_r2_key" is null
      and "primary_image_r2_bucket" is null
      and "primary_image_content_type" is null
      and "primary_image_byte_size" is null
      and "primary_image_width" is null
      and "primary_image_height" is null
      and "primary_image_sha256" is null)
    or
    ("primary_image_r2_key" is not null
      and "primary_image_r2_bucket" is not null
      and "primary_image_content_type" is not null
      and "primary_image_byte_size" is not null
      and "primary_image_width" is not null
      and "primary_image_height" is not null
      and "primary_image_sha256" is not null)
  );