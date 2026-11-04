ALTER TABLE "hearthstone_data"."publish_baselines" RENAME COLUMN "publish_target" TO "game";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_baselines" RENAME COLUMN "environment" TO "target";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" RENAME COLUMN "publish_target" TO "game";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" RENAME COLUMN "environment" TO "target";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_row_baselines" RENAME COLUMN "publish_target" TO "game";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_row_baselines" RENAME COLUMN "environment" TO "target";--> statement-breakpoint
ALTER TABLE "magic_data"."publish_baselines" RENAME COLUMN "publish_target" TO "game";--> statement-breakpoint
ALTER TABLE "magic_data"."publish_baselines" RENAME COLUMN "environment" TO "target";--> statement-breakpoint
ALTER TABLE "magic_data"."publish_batches" RENAME COLUMN "publish_target" TO "game";--> statement-breakpoint
ALTER TABLE "magic_data"."publish_batches" RENAME COLUMN "environment" TO "target";--> statement-breakpoint
ALTER TABLE "magic_data"."publish_row_baselines" RENAME COLUMN "publish_target" TO "game";--> statement-breakpoint
ALTER TABLE "magic_data"."publish_row_baselines" RENAME COLUMN "environment" TO "target";--> statement-breakpoint
ALTER TABLE "yugioh_data"."publish_baselines" RENAME COLUMN "publish_target_id" TO "game";--> statement-breakpoint
ALTER TABLE "yugioh_data"."publish_baselines" RENAME COLUMN "environment" TO "target";--> statement-breakpoint
ALTER TABLE "yugioh_data"."publish_batches" RENAME COLUMN "publish_target_id" TO "game";--> statement-breakpoint
ALTER TABLE "yugioh_data"."publish_batches" RENAME COLUMN "environment" TO "target";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ALTER COLUMN "game" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ALTER COLUMN "target" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "magic_data"."publish_batches" ALTER COLUMN "game" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "magic_data"."publish_batches" ALTER COLUMN "target" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "yugioh_data"."publish_baselines" ALTER COLUMN "target" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "yugioh_data"."publish_batches" ALTER COLUMN "game" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "yugioh_data"."publish_batches" ALTER COLUMN "target" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_baselines" ALTER COLUMN "game" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_baselines" ALTER COLUMN "target" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_row_baselines" ALTER COLUMN "game" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_row_baselines" ALTER COLUMN "target" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "magic_data"."publish_baselines" ALTER COLUMN "game" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "magic_data"."publish_baselines" ALTER COLUMN "target" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "magic_data"."publish_row_baselines" ALTER COLUMN "game" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "magic_data"."publish_row_baselines" ALTER COLUMN "target" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "yugioh_data"."publish_baselines" ALTER COLUMN "game" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_baselines" DROP CONSTRAINT IF EXISTS "publish_baselines_pkey";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_row_baselines" DROP CONSTRAINT IF EXISTS "publish_row_baselines_pkey";--> statement-breakpoint
ALTER TABLE "magic_data"."publish_baselines" DROP CONSTRAINT IF EXISTS "publish_baselines_pkey";--> statement-breakpoint
ALTER TABLE "magic_data"."publish_row_baselines" DROP CONSTRAINT IF EXISTS "publish_row_baselines_pkey";--> statement-breakpoint
ALTER TABLE "yugioh_data"."publish_baselines" DROP CONSTRAINT IF EXISTS "publish_baselines_pkey";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_baselines" ADD PRIMARY KEY ("game","target","publish_type");--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_row_baselines" ADD PRIMARY KEY ("game","target","publish_type","table_name","row_key");--> statement-breakpoint
ALTER TABLE "magic_data"."publish_baselines" ADD PRIMARY KEY ("game","target","publish_type");--> statement-breakpoint
ALTER TABLE "magic_data"."publish_row_baselines" ADD PRIMARY KEY ("game","target","publish_type","table_name","row_key");--> statement-breakpoint
ALTER TABLE "yugioh_data"."publish_baselines" ADD PRIMARY KEY ("game");--> statement-breakpoint
DROP INDEX IF EXISTS "hearthstone_data"."publish_batches_stream_status_idx";--> statement-breakpoint
CREATE INDEX "publish_batches_stream_status_idx" ON "hearthstone_data"."publish_batches" ("game","target","publish_type","status");--> statement-breakpoint
DROP INDEX IF EXISTS "hearthstone_data"."publish_row_baselines_stream_idx";--> statement-breakpoint
CREATE INDEX "publish_row_baselines_stream_idx" ON "hearthstone_data"."publish_row_baselines" ("game","target","publish_type");--> statement-breakpoint
DROP INDEX IF EXISTS "magic_data"."publish_batches_stream_status_idx";--> statement-breakpoint
CREATE INDEX "publish_batches_stream_status_idx" ON "magic_data"."publish_batches" ("game","target","publish_type","status");--> statement-breakpoint
DROP INDEX IF EXISTS "magic_data"."publish_row_baselines_stream_idx";--> statement-breakpoint
CREATE INDEX "publish_row_baselines_stream_idx" ON "magic_data"."publish_row_baselines" ("game","target","publish_type");--> statement-breakpoint
DROP INDEX IF EXISTS "yugioh_data"."publish_batches_target_status_idx";--> statement-breakpoint
CREATE INDEX "publish_batches_target_status_idx" ON "yugioh_data"."publish_batches" ("game","status");
