DROP INDEX "raw_entity_snapshots_latest_idx";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."raw_entity_snapshots" ADD COLUMN "projected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."raw_entity_snapshots" DROP COLUMN "is_latest";--> statement-breakpoint
CREATE INDEX "raw_entity_snapshots_projected_idx" ON "hearthstone_data"."raw_entity_snapshots" ("projected") WHERE "projected" = false;