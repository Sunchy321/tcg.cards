DROP VIEW "hearthstone"."set_view";--> statement-breakpoint
ALTER TABLE "hearthstone"."sets" ADD COLUMN "raw_name" text;--> statement-breakpoint
CREATE VIEW "hearthstone"."set_view" AS (select "set_id", "dbf_id", "slug", "raw_name", "type", "release_date", "card_count", "group" from "hearthstone"."sets");