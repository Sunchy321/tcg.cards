ALTER TABLE "hearthstone_data"."source_versions" RENAME TO "patch_states";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."patch_states" RENAME COLUMN "build" TO "build_number";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."patch_states" RENAME COLUMN "source_commit" TO "commit";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."patch_states" RENAME COLUMN "source_uri" TO "uri";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."patch_states" RENAME COLUMN "status" TO "import_status";--> statement-breakpoint
ALTER INDEX "hearthstone_data"."source_versions_status_idx" RENAME TO "patch_states_import_status_idx";--> statement-breakpoint
ALTER INDEX "hearthstone_data"."source_versions_projection_status_idx" RENAME TO "patch_states_projection_status_idx";--> statement-breakpoint
DROP INDEX "hearthstone_data"."source_versions_build_idx";--> statement-breakpoint
DROP INDEX "hearthstone_data"."source_versions_source_hash_idx";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."patch_states" ADD COLUMN "import_error" text;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."patch_states" RENAME CONSTRAINT "source_versions_pkey" TO "patch_states_pkey";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."patch_states" DROP COLUMN "source_tag";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."patch_states" DROP COLUMN "source_hash";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."patch_states" DROP COLUMN "import_engine_version";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."patch_states" ADD PRIMARY KEY ("build_number");--> statement-breakpoint
ALTER TABLE "hearthstone_data"."patch_states" ADD CONSTRAINT "patch_states_build_number_patches_build_number_fkey" FOREIGN KEY ("build_number") REFERENCES "hearthstone"."patches"("build_number");--> statement-breakpoint
CREATE VIEW "hearthstone_data"."patch_view" AS (select "hearthstone_data"."patch_states"."build_number", "hearthstone"."patches"."name", "hearthstone"."patches"."short_name", "hearthstone"."patches"."hash", "hearthstone"."patches"."is_latest", "hearthstone"."patches"."release_date", "hearthstone"."patches"."expansion", "hearthstone_data"."patch_states"."commit", "hearthstone_data"."patch_states"."uri", "hearthstone_data"."patch_states"."import_status", "hearthstone_data"."patch_states"."import_error", "hearthstone_data"."patch_states"."imported_at", "hearthstone_data"."patch_states"."projection_status", "hearthstone_data"."patch_states"."projection_error", "hearthstone_data"."patch_states"."projected_at", "hearthstone_data"."patch_states"."created_at", "hearthstone_data"."patch_states"."updated_at" from "hearthstone_data"."patch_states" inner join "hearthstone"."patches" on "hearthstone_data"."patch_states"."build_number" = "hearthstone"."patches"."build_number");
