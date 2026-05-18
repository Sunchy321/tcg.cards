CREATE TYPE "hearthstone_data"."publish_batch_card_action" AS ENUM('insert', 'update', 'delete', 'unchanged');--> statement-breakpoint
CREATE TYPE "hearthstone_data"."publish_batch_card_status" AS ENUM('pending', 'applied', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "hearthstone_data"."publish_batch_status" AS ENUM('draft', 'applying', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "hearthstone_data"."publish_baselines" (
	"publish_target_id" text PRIMARY KEY,
	"environment" text NOT NULL,
	"target_fingerprint" text NOT NULL,
	"batch_id" uuid NOT NULL,
	"source_tag_min" integer NOT NULL,
	"source_tag_max" integer NOT NULL,
	"build_min" integer NOT NULL,
	"build_max" integer NOT NULL,
	"manifest_hash" text NOT NULL,
	"card_count" integer NOT NULL,
	"published_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "publish_baselines_source_tag_range_chk" CHECK ("source_tag_min" <= "source_tag_max"),
	CONSTRAINT "publish_baselines_build_range_chk" CHECK ("build_min" <= "build_max"),
	CONSTRAINT "publish_baselines_source_tag_min_positive_chk" CHECK ("source_tag_min" > 0),
	CONSTRAINT "publish_baselines_build_min_positive_chk" CHECK ("build_min" > 0),
	CONSTRAINT "publish_baselines_card_count_nonnegative_chk" CHECK ("card_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."publish_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"publish_target_id" text NOT NULL,
	"environment" text NOT NULL,
	"target_fingerprint" text NOT NULL,
	"source_tag_min" integer NOT NULL,
	"source_tag_max" integer NOT NULL,
	"build_min" integer NOT NULL,
	"build_max" integer NOT NULL,
	"manifest_hash" text NOT NULL,
	"previous_manifest_hash" text,
	"card_count" integer NOT NULL,
	"changed_card_count" integer DEFAULT 0 NOT NULL,
	"inserted_card_count" integer DEFAULT 0 NOT NULL,
	"updated_card_count" integer DEFAULT 0 NOT NULL,
	"deleted_card_count" integer DEFAULT 0 NOT NULL,
	"unchanged_card_count" integer DEFAULT 0 NOT NULL,
	"status" "hearthstone_data"."publish_batch_status" DEFAULT 'draft'::"hearthstone_data"."publish_batch_status" NOT NULL,
	"error" text,
	"summary" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	CONSTRAINT "publish_batches_source_tag_range_chk" CHECK ("source_tag_min" <= "source_tag_max"),
	CONSTRAINT "publish_batches_build_range_chk" CHECK ("build_min" <= "build_max"),
	CONSTRAINT "publish_batches_source_tag_min_positive_chk" CHECK ("source_tag_min" > 0),
	CONSTRAINT "publish_batches_build_min_positive_chk" CHECK ("build_min" > 0),
	CONSTRAINT "publish_batches_card_count_nonnegative_chk" CHECK ("card_count" >= 0),
	CONSTRAINT "publish_batches_changed_card_count_nonnegative_chk" CHECK ("changed_card_count" >= 0),
	CONSTRAINT "publish_batches_inserted_card_count_nonnegative_chk" CHECK ("inserted_card_count" >= 0),
	CONSTRAINT "publish_batches_updated_card_count_nonnegative_chk" CHECK ("updated_card_count" >= 0),
	CONSTRAINT "publish_batches_deleted_card_count_nonnegative_chk" CHECK ("deleted_card_count" >= 0),
	CONSTRAINT "publish_batches_unchanged_card_count_nonnegative_chk" CHECK ("unchanged_card_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."publish_batch_cards" (
	"batch_id" uuid,
	"card_id" text,
	"entity_family_hash" text NOT NULL,
	"localization_family_hash" text NOT NULL,
	"relation_family_hash" text NOT NULL,
	"manifest_hash" text NOT NULL,
	"previous_manifest_hash" text,
	"action" "hearthstone_data"."publish_batch_card_action" DEFAULT 'unchanged'::"hearthstone_data"."publish_batch_card_action" NOT NULL,
	"status" "hearthstone_data"."publish_batch_card_status" DEFAULT 'pending'::"hearthstone_data"."publish_batch_card_status" NOT NULL,
	"error" text,
	"entity_row_count" integer DEFAULT 0 NOT NULL,
	"localization_row_count" integer DEFAULT 0 NOT NULL,
	"relation_row_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"applied_at" timestamp,
	CONSTRAINT "publish_batch_cards_pkey" PRIMARY KEY("batch_id","card_id"),
	CONSTRAINT "publish_batch_cards_entity_row_count_nonnegative_chk" CHECK ("entity_row_count" >= 0),
	CONSTRAINT "publish_batch_cards_localization_row_count_nonnegative_chk" CHECK ("localization_row_count" >= 0),
	CONSTRAINT "publish_batch_cards_relation_row_count_nonnegative_chk" CHECK ("relation_row_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX "publish_baselines_batch_id_idx" ON "hearthstone_data"."publish_baselines" ("batch_id");--> statement-breakpoint
CREATE INDEX "publish_batches_target_status_idx" ON "hearthstone_data"."publish_batches" ("publish_target_id","status");--> statement-breakpoint
CREATE INDEX "publish_batches_created_at_idx" ON "hearthstone_data"."publish_batches" ("created_at");--> statement-breakpoint
CREATE INDEX "publish_batches_manifest_hash_idx" ON "hearthstone_data"."publish_batches" ("manifest_hash");--> statement-breakpoint
CREATE INDEX "publish_batch_cards_batch_action_idx" ON "hearthstone_data"."publish_batch_cards" ("batch_id","action");--> statement-breakpoint
CREATE INDEX "publish_batch_cards_batch_status_idx" ON "hearthstone_data"."publish_batch_cards" ("batch_id","status");--> statement-breakpoint
CREATE INDEX "publish_batch_cards_manifest_hash_idx" ON "hearthstone_data"."publish_batch_cards" ("manifest_hash");--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_baselines" ADD CONSTRAINT "publish_baselines_batch_id_publish_batches_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "hearthstone_data"."publish_batches"("id");--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batch_cards" ADD CONSTRAINT "publish_batch_cards_batch_id_publish_batches_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "hearthstone_data"."publish_batches"("id") ON DELETE CASCADE;