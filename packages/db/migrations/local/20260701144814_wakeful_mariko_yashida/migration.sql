CREATE TYPE "hearthstone_data"."hsdata_snapshot_projection_state" AS ENUM('not_projected', 'version_only', 'projected');--> statement-breakpoint
DROP INDEX "raw_entity_snapshots_projected_idx";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."raw_entity_snapshots" ADD COLUMN "projection_state" "hearthstone_data"."hsdata_snapshot_projection_state" DEFAULT 'not_projected'::"hearthstone_data"."hsdata_snapshot_projection_state" NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."raw_entity_snapshots" DROP COLUMN "projected";--> statement-breakpoint
CREATE INDEX "raw_entity_snapshots_projection_state_idx" ON "hearthstone_data"."raw_entity_snapshots" ("projection_state") WHERE "projection_state" != 'projected';