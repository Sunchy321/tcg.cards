DROP VIEW "hearthstone"."announcement_view";--> statement-breakpoint
DROP VIEW "magic"."announcement_view";--> statement-breakpoint
DROP TABLE "hearthstone"."card_changes";--> statement-breakpoint
DROP TABLE "hearthstone"."format_changes";--> statement-breakpoint
DROP TABLE "hearthstone"."set_changes";--> statement-breakpoint
DROP TABLE "magic"."announcement_rule_items";--> statement-breakpoint
DROP TABLE "magic"."card_changes";--> statement-breakpoint
DROP TABLE "magic"."format_changes";--> statement-breakpoint
DROP TABLE "magic"."set_changes";--> statement-breakpoint
ALTER TABLE "hearthstone"."announcements" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone"."announcements" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone"."announcement_items" ADD COLUMN "group" text;--> statement-breakpoint
ALTER TABLE "hearthstone"."announcement_items" ADD COLUMN "version" integer;--> statement-breakpoint
ALTER TABLE "hearthstone"."announcement_items" ADD COLUMN "last_version" integer;--> statement-breakpoint
ALTER TABLE "hearthstone"."announcement_items" ADD COLUMN "delta" jsonb;--> statement-breakpoint
ALTER TABLE "hearthstone"."announcement_items" ADD COLUMN "glow" jsonb;--> statement-breakpoint
ALTER TABLE "hearthstone"."announcement_items" ADD COLUMN "resolved_formats" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone"."announcement_items" ADD COLUMN "resolved_cards" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone"."announcement_items" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone"."announcement_items" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone"."patches" ADD COLUMN "release_date" text;--> statement-breakpoint
ALTER TABLE "hearthstone"."patches" ADD COLUMN "expansion" text;--> statement-breakpoint
ALTER TABLE "hearthstone"."sets" ADD COLUMN "year" text;--> statement-breakpoint
ALTER TABLE "magic"."announcements" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "magic"."announcements" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "magic"."announcement_items" ADD COLUMN "group" text;--> statement-breakpoint
ALTER TABLE "magic"."announcement_items" ADD COLUMN "delta" jsonb;--> statement-breakpoint
ALTER TABLE "magic"."announcement_items" ADD COLUMN "glow" jsonb;--> statement-breakpoint
ALTER TABLE "magic"."announcement_items" ADD COLUMN "resolved_formats" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "magic"."announcement_items" ADD COLUMN "resolved_cards" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "magic"."announcement_items" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "magic"."announcement_items" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone"."announcement_items" DROP COLUMN "index";--> statement-breakpoint
ALTER TABLE "hearthstone"."announcement_items" DROP COLUMN "adjustment";--> statement-breakpoint
ALTER TABLE "hearthstone"."patches" DROP COLUMN "is_updated";--> statement-breakpoint
ALTER TABLE "magic"."announcement_items" DROP COLUMN "adjustment";--> statement-breakpoint
ALTER TABLE "hearthstone"."announcements" ALTER COLUMN "link" SET DATA TYPE jsonb USING "link"::jsonb;--> statement-breakpoint
ALTER TABLE "hearthstone"."announcements" ALTER COLUMN "link" SET DEFAULT '[]';--> statement-breakpoint
ALTER TABLE "hearthstone"."announcement_items" ALTER COLUMN "type" SET DATA TYPE text USING "type"::text;--> statement-breakpoint
ALTER TABLE "hearthstone"."announcement_items" ALTER COLUMN "status" SET DATA TYPE text USING "status"::text;--> statement-breakpoint
ALTER TABLE "hearthstone"."announcement_items" ALTER COLUMN "related_cards" SET DEFAULT '{}'::text[];--> statement-breakpoint
ALTER TABLE "hearthstone"."announcement_items" ALTER COLUMN "related_cards" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "magic"."announcements" ALTER COLUMN "link" SET DATA TYPE jsonb USING "link"::jsonb;--> statement-breakpoint
ALTER TABLE "magic"."announcements" ALTER COLUMN "link" SET DEFAULT '[]';--> statement-breakpoint
ALTER TABLE "magic"."announcement_items" ALTER COLUMN "type" SET DATA TYPE text USING "type"::text;--> statement-breakpoint
ALTER TABLE "magic"."announcement_items" ALTER COLUMN "related_cards" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_announcement_items_resolved_formats" ON "hearthstone"."announcement_items" USING gin ("resolved_formats");--> statement-breakpoint
CREATE INDEX "idx_announcement_items_resolved_cards" ON "hearthstone"."announcement_items" USING gin ("resolved_cards");--> statement-breakpoint
CREATE INDEX "idx_announcement_items_announcement_id" ON "hearthstone"."announcement_items" ("announcement_id");--> statement-breakpoint
CREATE INDEX "idx_announcement_items_resolved_formats" ON "magic"."announcement_items" USING gin ("resolved_formats");--> statement-breakpoint
CREATE INDEX "idx_announcement_items_resolved_cards" ON "magic"."announcement_items" USING gin ("resolved_cards");--> statement-breakpoint
CREATE INDEX "idx_announcement_items_announcement_id" ON "magic"."announcement_items" ("announcement_id");--> statement-breakpoint
DROP TYPE "hearthstone"."game_change_type";--> statement-breakpoint
DROP TYPE "hearthstone"."legality";--> statement-breakpoint
DROP TYPE "hearthstone"."status";--> statement-breakpoint
DROP TYPE "magic"."game_change_type";