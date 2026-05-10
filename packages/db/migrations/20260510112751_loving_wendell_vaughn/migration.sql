CREATE TYPE "hearthstone_data"."hsdata_projection_status" AS ENUM('not_started', 'processing', 'completed', 'failed');--> statement-breakpoint
ALTER TABLE "hearthstone_data"."source_versions" ADD COLUMN "projection_status" "hearthstone_data"."hsdata_projection_status" DEFAULT 'not_started'::"hearthstone_data"."hsdata_projection_status" NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."source_versions" ADD COLUMN "projection_error" text;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."source_versions" ADD COLUMN "projected_at" timestamp;--> statement-breakpoint
UPDATE "hearthstone_data"."source_versions" AS "source_versions"
SET "projection_status" = 'completed'::"hearthstone_data"."hsdata_projection_status"
WHERE "source_versions"."status" = 'completed'
  AND "source_versions"."build" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "hearthstone"."entities" AS "entities"
    WHERE "source_versions"."build" = ANY("entities"."version")
  );--> statement-breakpoint
CREATE INDEX "source_versions_projection_status_idx" ON "hearthstone_data"."source_versions" ("projection_status");
