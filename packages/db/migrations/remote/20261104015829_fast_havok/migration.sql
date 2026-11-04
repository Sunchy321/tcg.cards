ALTER TABLE "public"."publish_ledgers" RENAME COLUMN "publish_target" TO "game";--> statement-breakpoint
ALTER TABLE "public"."publish_ledgers" RENAME COLUMN "environment" TO "target";--> statement-breakpoint
ALTER TABLE "public"."publish_ledgers" ALTER COLUMN "game" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."publish_ledgers" ALTER COLUMN "target" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."publish_stream_registrations" RENAME COLUMN "publish_target" TO "game";--> statement-breakpoint
ALTER TABLE "public"."publish_stream_registrations" RENAME COLUMN "environment" TO "target";--> statement-breakpoint
ALTER TABLE "public"."publish_stream_registrations" ALTER COLUMN "game" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."publish_stream_registrations" ALTER COLUMN "target" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "yugioh_data"."publish_ledgers" RENAME COLUMN "publish_target_id" TO "game";--> statement-breakpoint
ALTER TABLE "yugioh_data"."publish_ledgers" RENAME COLUMN "environment" TO "target";--> statement-breakpoint
ALTER TABLE "yugioh_data"."publish_ledgers" ALTER COLUMN "game" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "yugioh_data"."publish_ledgers" ALTER COLUMN "target" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."publish_ledgers" DROP CONSTRAINT IF EXISTS "publish_ledgers_pkey";--> statement-breakpoint
ALTER TABLE "public"."publish_stream_registrations" DROP CONSTRAINT IF EXISTS "publish_stream_registrations_pkey";--> statement-breakpoint
ALTER TABLE "yugioh_data"."publish_ledgers" DROP CONSTRAINT IF EXISTS "publish_ledgers_pkey";--> statement-breakpoint
ALTER TABLE "public"."publish_ledgers" ADD PRIMARY KEY ("game","target","publish_type");--> statement-breakpoint
ALTER TABLE "public"."publish_stream_registrations" ADD PRIMARY KEY ("game","target","publish_type");--> statement-breakpoint
ALTER TABLE "yugioh_data"."publish_ledgers" ADD PRIMARY KEY ("game","target");--> statement-breakpoint
DROP INDEX IF EXISTS "public"."publish_ledgers_stream_idx";--> statement-breakpoint
CREATE INDEX "publish_ledgers_stream_idx" ON "public"."publish_ledgers" ("game","target","publish_type");--> statement-breakpoint
DROP INDEX IF EXISTS "public"."publish_stream_registrations_stream_idx";--> statement-breakpoint
CREATE INDEX "publish_stream_registrations_stream_idx" ON "public"."publish_stream_registrations" ("game","target","publish_type");--> statement-breakpoint
DROP INDEX IF EXISTS "public"."publish_ledgers_environment_idx";--> statement-breakpoint
CREATE INDEX "publish_ledgers_target_idx" ON "public"."publish_ledgers" ("target");--> statement-breakpoint
DROP INDEX IF EXISTS "yugioh_data"."publish_ledgers_environment_idx";--> statement-breakpoint
CREATE INDEX "publish_ledgers_target_idx" ON "yugioh_data"."publish_ledgers" ("target");
