CREATE TABLE "magic_data"."field_commits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"sequence" bigserial,
	"entity_type" text NOT NULL,
	"entity_key" jsonb NOT NULL,
	"field_path" text NOT NULL,
	"value" jsonb,
	"operation" text NOT NULL,
	"commit_kind" text NOT NULL,
	"client_mutation_id" text NOT NULL,
	"editor_runtime" text NOT NULL,
	"editor_identity" text NOT NULL,
	"editor_source" text NOT NULL,
	"expected_row_revision" text NOT NULL,
	"expected_winner_revision" text,
	"base_revision" text NOT NULL,
	"review_status" text NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"review_reason" text,
	"projection_status" text NOT NULL,
	"sync_status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"projected_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "magic_data"."field_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"processing_side" text NOT NULL,
	"processing_stage" text NOT NULL,
	"conflict_kind" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_key" jsonb NOT NULL,
	"field_path" text NOT NULL,
	"source_summary" jsonb NOT NULL,
	"candidate_base_value" jsonb,
	"local_value" jsonb,
	"incoming_value" jsonb,
	"effective_value" jsonb,
	"winner_value" jsonb,
	"base_revision" text NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"resolution" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "magic_data"."field_sync_cursors" (
	"consumer" text,
	"stream" text,
	"last_pulled_sequence" bigint DEFAULT 0 NOT NULL,
	"last_pushed_sequence" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "field_sync_cursors_pkey" PRIMARY KEY("consumer","stream")
);
--> statement-breakpoint
CREATE TABLE "magic_data"."field_winners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"entity_type" text NOT NULL,
	"entity_key" jsonb NOT NULL,
	"field_path" text NOT NULL,
	"winner_value" jsonb,
	"winner_source" text,
	"status" text DEFAULT 'active' NOT NULL,
	"source_runtime" text NOT NULL,
	"updated_by" text,
	"base_revision" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"cleared_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "magic_data"."base_change_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"generation" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_key" jsonb NOT NULL,
	"field_path" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"handled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."raw_entity_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_key" jsonb NOT NULL,
	"snapshot_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"projection_state" text DEFAULT 'not_projected' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."source_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source_id" text NOT NULL,
	"version_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"imported_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."field_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"entity_type" text NOT NULL,
	"field_path" text NOT NULL,
	"track" text DEFAULT 'collaborative' NOT NULL,
	"allow_manual_edit" boolean DEFAULT true NOT NULL,
	"manual_override_mode" text DEFAULT 'manual_sticky' NOT NULL,
	"allowed_sources" text[] DEFAULT '{}'::text[] NOT NULL,
	"auto_accept_sources" text[] DEFAULT '{}'::text[] NOT NULL,
	"decision_mode" text NOT NULL,
	"risk_level" text DEFAULT 'medium' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."rule_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"version" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"published_at" timestamp,
	"snapshot_hash" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."source_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source_id" text NOT NULL,
	"name" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"official" boolean DEFAULT false NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"trust_level" text NOT NULL,
	"status" text DEFAULT 'enabled' NOT NULL,
	"default_strategy" text NOT NULL,
	"default_decision_mode" text NOT NULL,
	"major_field_groups" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_app"."import_review_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"commit_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor" text NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "magic_data"."import_apply_logs" DROP CONSTRAINT "import_apply_logs_field_change_id_import_field_changes_id_fkey";--> statement-breakpoint
ALTER TABLE "magic_data"."import_apply_logs" DROP CONSTRAINT "import_apply_logs_change_set_id_import_change_sets_id_fkey";--> statement-breakpoint
ALTER TABLE "magic_data"."import_change_sets" DROP CONSTRAINT "import_change_sets_import_run_id_import_runs_id_fkey";--> statement-breakpoint
ALTER TABLE "magic_data"."import_change_sets" DROP CONSTRAINT "import_change_sets_source_id_import_sources_source_id_fkey";--> statement-breakpoint
ALTER TABLE "magic_data"."import_change_sets" DROP CONSTRAINT "import_change_sets_rule_set_id_import_rule_sets_id_fkey";--> statement-breakpoint
ALTER TABLE "magic_data"."import_field_changes" DROP CONSTRAINT "import_field_changes_change_set_id_import_change_sets_id_fkey";--> statement-breakpoint
ALTER TABLE "magic_data"."import_field_rules" DROP CONSTRAINT "import_field_rules_rule_set_id_import_rule_sets_id_fkey";--> statement-breakpoint
ALTER TABLE "magic_data"."import_field_rules" DROP CONSTRAINT "import_field_rules_source_id_import_sources_source_id_fkey";--> statement-breakpoint
ALTER TABLE "magic_data"."import_policy_snapshots" DROP CONSTRAINT "import_policy_snapshots_rule_set_id_import_rule_sets_id_fkey";--> statement-breakpoint
ALTER TABLE "magic_data"."import_raw_records" DROP CONSTRAINT "import_raw_records_import_run_id_import_runs_id_fkey";--> statement-breakpoint
ALTER TABLE "magic_data"."import_raw_records" DROP CONSTRAINT "import_raw_records_source_id_import_sources_source_id_fkey";--> statement-breakpoint
ALTER TABLE "magic_data"."import_runs" DROP CONSTRAINT "import_runs_source_id_import_sources_source_id_fkey";--> statement-breakpoint
ALTER TABLE "magic_data"."import_runs" DROP CONSTRAINT "import_runs_rule_set_id_import_rule_sets_id_fkey";--> statement-breakpoint
DROP TABLE "magic_data"."import_apply_logs";--> statement-breakpoint
DROP TABLE "magic_data"."import_change_sets";--> statement-breakpoint
DROP TABLE "magic_data"."import_field_changes";--> statement-breakpoint
DROP TABLE "magic_data"."import_field_rules";--> statement-breakpoint
DROP TABLE "magic_data"."import_policy_snapshots";--> statement-breakpoint
DROP TABLE "magic_data"."import_raw_records";--> statement-breakpoint
DROP TABLE "magic_data"."import_rule_sets";--> statement-breakpoint
DROP TABLE "magic_data"."import_runs";--> statement-breakpoint
DROP TABLE "magic_data"."import_sources";--> statement-breakpoint
ALTER TABLE "magic_data"."gatherer" ADD COLUMN "url" text;--> statement-breakpoint
CREATE UNIQUE INDEX "field_commits_client_mutation_id_uq" ON "magic_data"."field_commits" ("client_mutation_id");--> statement-breakpoint
CREATE INDEX "field_commits_sequence_idx" ON "magic_data"."field_commits" ("sequence");--> statement-breakpoint
CREATE INDEX "field_commits_entity_field_sequence_idx" ON "magic_data"."field_commits" ("entity_type","entity_key","field_path","sequence");--> statement-breakpoint
CREATE INDEX "field_commits_review_projection_created_at_idx" ON "magic_data"."field_commits" ("review_status","projection_status","created_at");--> statement-breakpoint
CREATE INDEX "field_conflicts_side_stage_status_created_at_idx" ON "magic_data"."field_conflicts" ("processing_side","processing_stage","status","created_at");--> statement-breakpoint
CREATE INDEX "field_conflicts_entity_field_status_idx" ON "magic_data"."field_conflicts" ("entity_type","entity_key","field_path","status");--> statement-breakpoint
CREATE UNIQUE INDEX "field_winners_active_entity_field_uq" ON "magic_data"."field_winners" ("entity_type","entity_key","field_path") WHERE "status" = 'active';--> statement-breakpoint
CREATE INDEX "field_winners_entity_field_idx" ON "magic_data"."field_winners" ("entity_type","entity_key","field_path");--> statement-breakpoint
CREATE INDEX "field_winners_entity_status_idx" ON "magic_data"."field_winners" ("entity_type","entity_key","status");--> statement-breakpoint
CREATE INDEX "field_winners_field_status_idx" ON "magic_data"."field_winners" ("entity_type","field_path","status");--> statement-breakpoint
CREATE INDEX "field_winners_updated_at_idx" ON "magic_data"."field_winners" ("updated_at");--> statement-breakpoint
CREATE INDEX "base_change_review_entity_field_status_idx" ON "magic_data"."base_change_review" ("entity_type","entity_key","field_path","status");--> statement-breakpoint
CREATE INDEX "base_change_review_generation_idx" ON "magic_data"."base_change_review" ("generation");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_entity_snapshots_source_entity_hash_uq" ON "magic_data"."raw_entity_snapshots" ("source_id","entity_type","entity_key","snapshot_hash");--> statement-breakpoint
CREATE INDEX "raw_entity_snapshots_source_entity_idx" ON "magic_data"."raw_entity_snapshots" ("source_id","entity_type");--> statement-breakpoint
CREATE INDEX "raw_entity_snapshots_projection_state_idx" ON "magic_data"."raw_entity_snapshots" ("projection_state");--> statement-breakpoint
CREATE UNIQUE INDEX "source_versions_source_version_uq" ON "magic_data"."source_versions" ("source_id","version_key");--> statement-breakpoint
CREATE INDEX "source_versions_source_id_imported_at_idx" ON "magic_data"."source_versions" ("source_id","imported_at");--> statement-breakpoint
CREATE UNIQUE INDEX "field_policies_entity_field_uq" ON "magic_data"."field_policies" ("entity_type","field_path");--> statement-breakpoint
CREATE INDEX "field_policies_track_idx" ON "magic_data"."field_policies" ("track");--> statement-breakpoint
CREATE INDEX "field_policies_decision_mode_idx" ON "magic_data"."field_policies" ("decision_mode");--> statement-breakpoint
CREATE UNIQUE INDEX "rule_sets_version_uq" ON "magic_data"."rule_sets" ("version");--> statement-breakpoint
CREATE INDEX "rule_sets_status_published_at_idx" ON "magic_data"."rule_sets" ("status","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "source_catalog_source_id_uq" ON "magic_data"."source_catalog" ("source_id");--> statement-breakpoint
CREATE INDEX "source_catalog_status_idx" ON "magic_data"."source_catalog" ("status");--> statement-breakpoint
CREATE INDEX "source_catalog_trust_level_status_idx" ON "magic_data"."source_catalog" ("trust_level","status");--> statement-breakpoint
CREATE INDEX "import_review_actions_commit_id_idx" ON "magic_app"."import_review_actions" ("commit_id");--> statement-breakpoint
CREATE INDEX "import_review_actions_actor_created_at_idx" ON "magic_app"."import_review_actions" ("actor","created_at");--> statement-breakpoint
ALTER TABLE "magic_app"."import_review_actions" ADD CONSTRAINT "import_review_actions_commit_id_field_commits_id_fkey" FOREIGN KEY ("commit_id") REFERENCES "magic_data"."field_commits"("id");--> statement-breakpoint
DROP TYPE "magic_data"."import_apply_action";--> statement-breakpoint
DROP TYPE "magic_data"."import_coverage_state";--> statement-breakpoint
DROP TYPE "magic_data"."import_decision_mode";--> statement-breakpoint
DROP TYPE "magic_data"."import_change_decision_source";--> statement-breakpoint
DROP TYPE "magic_data"."import_change_decision_status";--> statement-breakpoint
DROP TYPE "magic_data"."import_entity_type";--> statement-breakpoint
DROP TYPE "magic_data"."import_fallback_action";--> statement-breakpoint
DROP TYPE "magic_data"."import_field_group";--> statement-breakpoint
DROP TYPE "magic_data"."import_field_state";--> statement-breakpoint
DROP TYPE "magic_data"."import_risk_level";--> statement-breakpoint
DROP TYPE "magic_data"."import_rule_set_status";--> statement-breakpoint
DROP TYPE "magic_data"."import_run_status";--> statement-breakpoint
DROP TYPE "magic_data"."import_source_status";--> statement-breakpoint
DROP TYPE "magic_data"."import_strategy";--> statement-breakpoint
DROP TYPE "magic_data"."import_trigger_type";--> statement-breakpoint
DROP TYPE "magic_data"."import_trust_level";--> statement-breakpoint
DROP TYPE "magic_data"."import_value_storage_mode";