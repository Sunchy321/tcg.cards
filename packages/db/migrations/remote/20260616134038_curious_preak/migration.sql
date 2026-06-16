ALTER TABLE "hearthstone_data"."publish_ledgers" RENAME COLUMN "publish_target_id" TO "publish_target";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_ledgers" ADD COLUMN "publish_type" text DEFAULT 'card_data';--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_ledgers" DROP CONSTRAINT "publish_ledgers_pkey";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_ledgers" ADD PRIMARY KEY ("publish_target","environment","publish_type");--> statement-breakpoint
CREATE INDEX "publish_ledgers_stream_idx" ON "hearthstone_data"."publish_ledgers" ("publish_target","environment","publish_type");