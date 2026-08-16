ALTER TABLE "task_runs" ADD COLUMN "result" jsonb;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ALTER COLUMN "operation_kind" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ALTER COLUMN "operation_kind" DROP DEFAULT;--> statement-breakpoint
DROP TYPE "publish_operation_kind";--> statement-breakpoint
CREATE TYPE "publish_operation_kind" AS ENUM('publish', 'repair', 'rollback', 'pin');--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ALTER COLUMN "operation_kind" SET DATA TYPE "publish_operation_kind" USING "operation_kind"::"publish_operation_kind";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ALTER COLUMN "operation_kind" SET DEFAULT 'publish'::"publish_operation_kind";--> statement-breakpoint
ALTER TABLE "task_runs" DROP COLUMN "selection_anchor";--> statement-breakpoint
ALTER TABLE "task_stages" DROP COLUMN "selection_anchor";