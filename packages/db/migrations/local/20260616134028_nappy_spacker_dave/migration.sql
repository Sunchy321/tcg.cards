CREATE TYPE "hearthstone_data"."publish_operation_kind" AS ENUM('publish', 'repair', 'rollback', 'baseline_repair');--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_baselines" RENAME COLUMN "publish_target_id" TO "publish_target";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" RENAME COLUMN "publish_target_id" TO "publish_target";--> statement-breakpoint
DROP INDEX "publish_batches_target_status_idx";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_baselines" ADD COLUMN "publish_type" text DEFAULT 'card_data';--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ADD COLUMN "operation_kind" "hearthstone_data"."publish_operation_kind" DEFAULT 'publish'::"hearthstone_data"."publish_operation_kind" NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_baselines" DROP CONSTRAINT "publish_baselines_pkey";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_baselines" ADD PRIMARY KEY ("publish_target","environment","publish_type");--> statement-breakpoint
CREATE INDEX "publish_batches_stream_status_idx" ON "hearthstone_data"."publish_batches" ("publish_target","environment","publish_type","status");