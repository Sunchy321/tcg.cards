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
CREATE INDEX "publish_ledgers_target_idx" ON "yugioh_data"."publish_ledgers" ("target");--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'publish_writer') THEN
    CREATE ROLE publish_writer NOLOGIN;
  END IF;
END $$;--> statement-breakpoint
GRANT USAGE ON SCHEMA magic, magic_app, hearthstone, yugioh, yugioh_data TO publish_writer;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA magic, magic_app, hearthstone, yugioh, yugioh_data TO publish_writer;--> statement-breakpoint
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA magic, magic_app, hearthstone, yugioh, yugioh_data TO publish_writer;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publish_ledgers, public.publish_stream_registrations TO publish_writer;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA magic, magic_app, hearthstone, yugioh, yugioh_data GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO publish_writer;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA magic, magic_app, hearthstone, yugioh, yugioh_data GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO publish_writer;
