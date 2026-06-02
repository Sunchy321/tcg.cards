CREATE TYPE "hearthstone_data"."publish_batch_row_action" AS ENUM('insert', 'update', 'delete', 'unchanged');--> statement-breakpoint
CREATE TYPE "hearthstone_data"."publish_batch_row_status" AS ENUM('pending', 'applied', 'skipped', 'failed');--> statement-breakpoint
CREATE TABLE "hearthstone_data"."publish_batch_rows" (
	"batch_id" uuid,
	"table_name" text,
	"row_pk" text,
	"row_hash" text NOT NULL,
	"previous_row_hash" text,
	"action" "hearthstone_data"."publish_batch_row_action" NOT NULL,
	"status" "hearthstone_data"."publish_batch_row_status" DEFAULT 'pending'::"hearthstone_data"."publish_batch_row_status" NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"applied_at" timestamp,
	CONSTRAINT "publish_batch_rows_pkey" PRIMARY KEY("batch_id","table_name","row_pk")
);
--> statement-breakpoint
DROP TABLE "hearthstone_data"."publish_batch_cards";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_baselines" DROP CONSTRAINT "publish_baselines_card_count_nonnegative_chk";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" DROP CONSTRAINT "publish_batches_card_count_nonnegative_chk";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" DROP CONSTRAINT "publish_batches_changed_card_count_nonnegative_chk";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" DROP CONSTRAINT "publish_batches_inserted_card_count_nonnegative_chk";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" DROP CONSTRAINT "publish_batches_updated_card_count_nonnegative_chk";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" DROP CONSTRAINT "publish_batches_deleted_card_count_nonnegative_chk";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" DROP CONSTRAINT "publish_batches_unchanged_card_count_nonnegative_chk";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_baselines" ADD COLUMN "total_row_count" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ADD COLUMN "total_row_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ADD COLUMN "changed_row_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ADD COLUMN "inserted_row_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ADD COLUMN "updated_row_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ADD COLUMN "deleted_row_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ADD COLUMN "unchanged_row_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ADD COLUMN "card_row_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ADD COLUMN "entity_row_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ADD COLUMN "localization_row_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ADD COLUMN "relation_row_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_baselines" DROP COLUMN "card_count";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" DROP COLUMN "card_count";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" DROP COLUMN "changed_card_count";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" DROP COLUMN "inserted_card_count";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" DROP COLUMN "updated_card_count";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" DROP COLUMN "deleted_card_count";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" DROP COLUMN "unchanged_card_count";--> statement-breakpoint
CREATE INDEX "publish_batch_rows_batch_action_idx" ON "hearthstone_data"."publish_batch_rows" ("batch_id","action");--> statement-breakpoint
CREATE INDEX "publish_batch_rows_batch_status_idx" ON "hearthstone_data"."publish_batch_rows" ("batch_id","status");--> statement-breakpoint
CREATE INDEX "publish_batch_rows_batch_table_idx" ON "hearthstone_data"."publish_batch_rows" ("batch_id","table_name");--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batch_rows" ADD CONSTRAINT "publish_batch_rows_batch_id_publish_batches_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "hearthstone_data"."publish_batches"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_baselines" ADD CONSTRAINT "publish_baselines_total_row_count_nonnegative_chk" CHECK ("total_row_count" >= 0);--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ADD CONSTRAINT "publish_batches_total_row_count_nonnegative_chk" CHECK ("total_row_count" >= 0);--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ADD CONSTRAINT "publish_batches_changed_row_count_nonnegative_chk" CHECK ("changed_row_count" >= 0);--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ADD CONSTRAINT "publish_batches_inserted_row_count_nonnegative_chk" CHECK ("inserted_row_count" >= 0);--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ADD CONSTRAINT "publish_batches_updated_row_count_nonnegative_chk" CHECK ("updated_row_count" >= 0);--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ADD CONSTRAINT "publish_batches_deleted_row_count_nonnegative_chk" CHECK ("deleted_row_count" >= 0);--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ADD CONSTRAINT "publish_batches_unchanged_row_count_nonnegative_chk" CHECK ("unchanged_row_count" >= 0);--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ADD CONSTRAINT "publish_batches_card_row_count_nonnegative_chk" CHECK ("card_row_count" >= 0);--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ADD CONSTRAINT "publish_batches_entity_row_count_nonnegative_chk" CHECK ("entity_row_count" >= 0);--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ADD CONSTRAINT "publish_batches_localization_row_count_nonnegative_chk" CHECK ("localization_row_count" >= 0);--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ADD CONSTRAINT "publish_batches_relation_row_count_nonnegative_chk" CHECK ("relation_row_count" >= 0);--> statement-breakpoint
DROP TYPE "hearthstone_data"."publish_batch_card_action";--> statement-breakpoint
DROP TYPE "hearthstone_data"."publish_batch_card_status";