ALTER TABLE "hearthstone_data"."publish_ledgers" DROP CONSTRAINT "publish_ledgers_card_count_nonnegative_chk";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_ledgers" DROP CONSTRAINT "publish_ledgers_changed_card_count_nonnegative_chk";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_ledgers" ADD COLUMN "total_row_count" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_ledgers" ADD COLUMN "changed_row_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_ledgers" DROP COLUMN "card_count";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_ledgers" DROP COLUMN "changed_card_count";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_ledgers" ADD CONSTRAINT "publish_ledgers_total_row_count_nonnegative_chk" CHECK ("total_row_count" >= 0);--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_ledgers" ADD CONSTRAINT "publish_ledgers_changed_row_count_nonnegative_chk" CHECK ("changed_row_count" >= 0);