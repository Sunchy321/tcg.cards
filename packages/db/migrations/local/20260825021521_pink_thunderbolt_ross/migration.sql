DROP VIEW "hearthstone"."set_view";--> statement-breakpoint
DROP TABLE "hearthstone"."set_localizations";--> statement-breakpoint
ALTER TABLE "hearthstone"."sets" ADD COLUMN "localization" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone"."sets" DROP COLUMN "slug";