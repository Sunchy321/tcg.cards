CREATE TYPE "magic_data"."import_apply_action" AS ENUM('apply', 'rollback');--> statement-breakpoint
CREATE TYPE "magic_data"."import_coverage_state" AS ENUM('supported', 'conditional', 'unsupported');--> statement-breakpoint
CREATE TYPE "magic_data"."import_decision_mode" AS ENUM('auto_apply', 'batch_review', 'manual_review');--> statement-breakpoint
CREATE TYPE "magic_data"."import_change_decision_source" AS ENUM('system', 'review', 'apply', 'rollback');--> statement-breakpoint
CREATE TYPE "magic_data"."import_change_decision_status" AS ENUM('pending', 'ignored', 'approved', 'rejected', 'applied', 'rolled_back');--> statement-breakpoint
CREATE TYPE "magic_data"."import_entity_type" AS ENUM('card', 'cardLocalization', 'cardPart', 'cardPartLocalization', 'print', 'printPart');--> statement-breakpoint
CREATE TYPE "magic_data"."import_fallback_action" AS ENUM('ignore', 'manual_review');--> statement-breakpoint
CREATE TYPE "magic_data"."import_field_group" AS ENUM('structure', 'oracle', 'gameplay', 'localization', 'print_display', 'print_metadata', 'classification', 'legality', 'image', 'external_id', 'art');--> statement-breakpoint
CREATE TYPE "magic_data"."import_field_state" AS ENUM('provided', 'explicit_null', 'not_provided', 'not_applicable', 'parse_failed');--> statement-breakpoint
CREATE TYPE "magic_app"."import_review_action" AS ENUM('approve', 'reject', 'ignore', 'override');--> statement-breakpoint
CREATE TYPE "magic_app"."import_review_scope_type" AS ENUM('change_set', 'field_change', 'batch');--> statement-breakpoint
CREATE TYPE "magic_data"."import_risk_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "magic_data"."import_rule_set_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "magic_data"."import_run_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "magic_data"."import_source_status" AS ENUM('enabled', 'candidate', 'reconcile_only');--> statement-breakpoint
CREATE TYPE "magic_data"."import_strategy" AS ENUM('overwrite', 'ignore', 'overwrite_when_matched', 'approval_required');--> statement-breakpoint
CREATE TYPE "magic_data"."import_trigger_type" AS ENUM('manual', 'scheduled', 'webhook', 'backfill');--> statement-breakpoint
CREATE TYPE "magic_data"."import_trust_level" AS ENUM('high', 'medium');--> statement-breakpoint
CREATE TYPE "magic_data"."import_value_storage_mode" AS ENUM('inline', 'compressed_inline', 'object_storage_ref');--> statement-breakpoint
CREATE TABLE "magic_data"."import_apply_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"field_change_id" uuid NOT NULL,
	"change_set_id" uuid NOT NULL,
	"action" "magic_data"."import_apply_action" DEFAULT 'apply'::"magic_data"."import_apply_action" NOT NULL,
	"target_schema" text NOT NULL,
	"target_table" text NOT NULL,
	"target_key" jsonb NOT NULL,
	"field_path" text NOT NULL,
	"before_value" jsonb,
	"after_value" jsonb,
	"before_value_storage_mode" "magic_data"."import_value_storage_mode" DEFAULT 'inline'::"magic_data"."import_value_storage_mode" NOT NULL,
	"after_value_storage_mode" "magic_data"."import_value_storage_mode" DEFAULT 'inline'::"magic_data"."import_value_storage_mode" NOT NULL,
	"before_value_hash" text DEFAULT '' NOT NULL,
	"after_value_hash" text DEFAULT '' NOT NULL,
	"before_value_ref" text,
	"after_value_ref" text,
	"applied_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."import_change_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"import_run_id" uuid NOT NULL,
	"source_id" text NOT NULL,
	"rule_set_id" uuid NOT NULL,
	"target_entity_type" "magic_data"."import_entity_type" NOT NULL,
	"target_key" jsonb NOT NULL,
	"match_key" jsonb DEFAULT '{}' NOT NULL,
	"decision_mode" "magic_data"."import_decision_mode" NOT NULL,
	"decision_status" "magic_data"."import_change_decision_status" DEFAULT 'pending'::"magic_data"."import_change_decision_status" NOT NULL,
	"decision_source" "magic_data"."import_change_decision_source" DEFAULT 'system'::"magic_data"."import_change_decision_source" NOT NULL,
	"reason_code" text DEFAULT '' NOT NULL,
	"locked_path_count" integer DEFAULT 0 NOT NULL,
	"field_change_count" integer DEFAULT 0 NOT NULL,
	"applied_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."import_field_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"change_set_id" uuid NOT NULL,
	"field_path" text NOT NULL,
	"field_state" "magic_data"."import_field_state" NOT NULL,
	"strategy" "magic_data"."import_strategy" NOT NULL,
	"decision_mode" "magic_data"."import_decision_mode" NOT NULL,
	"decision_status" "magic_data"."import_change_decision_status" DEFAULT 'pending'::"magic_data"."import_change_decision_status" NOT NULL,
	"decision_source" "magic_data"."import_change_decision_source" DEFAULT 'system'::"magic_data"."import_change_decision_source" NOT NULL,
	"risk_level" "magic_data"."import_risk_level" NOT NULL,
	"reason_code" text DEFAULT '' NOT NULL,
	"matcher_summary" text,
	"batch_key" text DEFAULT '' NOT NULL,
	"before_value" jsonb,
	"after_value" jsonb,
	"before_value_storage_mode" "magic_data"."import_value_storage_mode" DEFAULT 'inline'::"magic_data"."import_value_storage_mode" NOT NULL,
	"after_value_storage_mode" "magic_data"."import_value_storage_mode" DEFAULT 'inline'::"magic_data"."import_value_storage_mode" NOT NULL,
	"before_value_hash" text DEFAULT '' NOT NULL,
	"after_value_hash" text DEFAULT '' NOT NULL,
	"before_value_ref" text,
	"after_value_ref" text,
	"applied_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."import_field_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"rule_set_id" uuid NOT NULL,
	"source_id" text NOT NULL,
	"entity_type" "magic_data"."import_entity_type" NOT NULL,
	"field_path" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"field_group" "magic_data"."import_field_group" NOT NULL,
	"coverage" "magic_data"."import_coverage_state" NOT NULL,
	"coverage_note" text DEFAULT '' NOT NULL,
	"coverage_condition" text,
	"strategy" "magic_data"."import_strategy" NOT NULL,
	"decision_mode" "magic_data"."import_decision_mode" NOT NULL,
	"risk_level" "magic_data"."import_risk_level" NOT NULL,
	"matcher_summary" text,
	"fallback_action" "magic_data"."import_fallback_action",
	"batch_group_by" text[] DEFAULT '{}'::text[] NOT NULL,
	"reason_code" text DEFAULT '' NOT NULL,
	"allow_explicit_null" boolean DEFAULT false NOT NULL,
	"locked_path_aware" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."import_policy_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"rule_set_id" uuid NOT NULL,
	"version" text NOT NULL,
	"published_at" timestamp NOT NULL,
	"content_hash" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."import_raw_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"import_run_id" uuid NOT NULL,
	"source_id" text NOT NULL,
	"source_record_key" text NOT NULL,
	"target_entity_type" "magic_data"."import_entity_type",
	"target_key" jsonb,
	"match_key" jsonb,
	"payload" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"normalized" jsonb DEFAULT '{}' NOT NULL,
	"diagnostics" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_app"."import_review_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"change_set_id" uuid,
	"field_change_id" uuid,
	"scope_type" "magic_app"."import_review_scope_type" NOT NULL,
	"scope_key" text NOT NULL,
	"action" "magic_app"."import_review_action" NOT NULL,
	"reviewer_id" text NOT NULL,
	"reason" text,
	"override_value" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."import_rule_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"version" text NOT NULL,
	"status" "magic_data"."import_rule_set_status" DEFAULT 'draft'::"magic_data"."import_rule_set_status" NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"published_at" timestamp,
	"published_by" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"snapshot_hash" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source_id" text NOT NULL,
	"trigger_type" "magic_data"."import_trigger_type" DEFAULT 'manual'::"magic_data"."import_trigger_type" NOT NULL,
	"status" "magic_data"."import_run_status" DEFAULT 'pending'::"magic_data"."import_run_status" NOT NULL,
	"rule_set_id" uuid NOT NULL,
	"snapshot_version" text DEFAULT '' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"diagnostics" jsonb DEFAULT '{}' NOT NULL,
	"field_state_stats" jsonb DEFAULT '{}' NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."import_sources" (
	"source_id" text PRIMARY KEY,
	"name" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"official" boolean DEFAULT false NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"trust_level" "magic_data"."import_trust_level" NOT NULL,
	"status" "magic_data"."import_source_status" DEFAULT 'enabled'::"magic_data"."import_source_status" NOT NULL,
	"default_strategy" "magic_data"."import_strategy" NOT NULL,
	"default_decision_mode" "magic_data"."import_decision_mode" NOT NULL,
	"major_field_groups" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text[] DEFAULT '{}'::text[] NOT NULL,
	"config" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "import_apply_logs_field_change_id_action_idx" ON "magic_data"."import_apply_logs" ("field_change_id","action");--> statement-breakpoint
CREATE INDEX "import_apply_logs_change_set_id_applied_at_idx" ON "magic_data"."import_apply_logs" ("change_set_id","applied_at");--> statement-breakpoint
CREATE INDEX "import_change_sets_import_run_id_target_entity_type_idx" ON "magic_data"."import_change_sets" ("import_run_id","target_entity_type");--> statement-breakpoint
CREATE INDEX "import_change_sets_decision_status_decision_mode_idx" ON "magic_data"."import_change_sets" ("decision_status","decision_mode");--> statement-breakpoint
CREATE INDEX "import_change_sets_source_id_rule_set_id_idx" ON "magic_data"."import_change_sets" ("source_id","rule_set_id");--> statement-breakpoint
CREATE UNIQUE INDEX "import_field_changes_change_set_id_field_path_uq" ON "magic_data"."import_field_changes" ("change_set_id","field_path");--> statement-breakpoint
CREATE INDEX "import_field_changes_decision_status_decision_mode_idx" ON "magic_data"."import_field_changes" ("decision_status","decision_mode");--> statement-breakpoint
CREATE INDEX "import_field_changes_batch_key_idx" ON "magic_data"."import_field_changes" ("batch_key");--> statement-breakpoint
CREATE INDEX "import_field_changes_applied_at_idx" ON "magic_data"."import_field_changes" ("applied_at");--> statement-breakpoint
CREATE UNIQUE INDEX "import_field_rules_rule_set_id_source_id_field_path_reason_code_uq" ON "magic_data"."import_field_rules" ("rule_set_id","source_id","field_path","reason_code");--> statement-breakpoint
CREATE INDEX "import_field_rules_source_id_entity_type_idx" ON "magic_data"."import_field_rules" ("source_id","entity_type");--> statement-breakpoint
CREATE INDEX "import_field_rules_rule_set_id_decision_mode_idx" ON "magic_data"."import_field_rules" ("rule_set_id","decision_mode");--> statement-breakpoint
CREATE INDEX "import_field_rules_field_group_risk_level_idx" ON "magic_data"."import_field_rules" ("field_group","risk_level");--> statement-breakpoint
CREATE UNIQUE INDEX "import_policy_snapshots_version_uq" ON "magic_data"."import_policy_snapshots" ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "import_policy_snapshots_content_hash_uq" ON "magic_data"."import_policy_snapshots" ("content_hash");--> statement-breakpoint
CREATE INDEX "import_policy_snapshots_rule_set_id_published_at_idx" ON "magic_data"."import_policy_snapshots" ("rule_set_id","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "import_raw_records_import_run_id_source_record_key_uq" ON "magic_data"."import_raw_records" ("import_run_id","source_record_key");--> statement-breakpoint
CREATE INDEX "import_raw_records_import_run_id_idx" ON "magic_data"."import_raw_records" ("import_run_id");--> statement-breakpoint
CREATE INDEX "import_raw_records_source_id_target_entity_type_idx" ON "magic_data"."import_raw_records" ("source_id","target_entity_type");--> statement-breakpoint
CREATE INDEX "import_raw_records_payload_hash_idx" ON "magic_data"."import_raw_records" ("payload_hash");--> statement-breakpoint
CREATE INDEX "import_review_actions_change_set_id_created_at_idx" ON "magic_app"."import_review_actions" ("change_set_id","created_at");--> statement-breakpoint
CREATE INDEX "import_review_actions_field_change_id_created_at_idx" ON "magic_app"."import_review_actions" ("field_change_id","created_at");--> statement-breakpoint
CREATE INDEX "import_review_actions_scope_type_scope_key_idx" ON "magic_app"."import_review_actions" ("scope_type","scope_key");--> statement-breakpoint
CREATE INDEX "import_review_actions_reviewer_id_created_at_idx" ON "magic_app"."import_review_actions" ("reviewer_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "import_rule_sets_version_uq" ON "magic_data"."import_rule_sets" ("version");--> statement-breakpoint
CREATE INDEX "import_rule_sets_status_published_at_idx" ON "magic_data"."import_rule_sets" ("status","published_at");--> statement-breakpoint
CREATE INDEX "import_runs_source_id_status_started_at_idx" ON "magic_data"."import_runs" ("source_id","status","started_at");--> statement-breakpoint
CREATE INDEX "import_runs_rule_set_id_status_idx" ON "magic_data"."import_runs" ("rule_set_id","status");--> statement-breakpoint
CREATE INDEX "import_sources_status_idx" ON "magic_data"."import_sources" ("status");--> statement-breakpoint
CREATE INDEX "import_sources_trust_level_status_idx" ON "magic_data"."import_sources" ("trust_level","status");--> statement-breakpoint
ALTER TABLE "magic_data"."import_apply_logs" ADD CONSTRAINT "import_apply_logs_field_change_id_import_field_changes_id_fkey" FOREIGN KEY ("field_change_id") REFERENCES "magic_data"."import_field_changes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "magic_data"."import_apply_logs" ADD CONSTRAINT "import_apply_logs_change_set_id_import_change_sets_id_fkey" FOREIGN KEY ("change_set_id") REFERENCES "magic_data"."import_change_sets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "magic_data"."import_change_sets" ADD CONSTRAINT "import_change_sets_import_run_id_import_runs_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "magic_data"."import_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "magic_data"."import_change_sets" ADD CONSTRAINT "import_change_sets_source_id_import_sources_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "magic_data"."import_sources"("source_id");--> statement-breakpoint
ALTER TABLE "magic_data"."import_change_sets" ADD CONSTRAINT "import_change_sets_rule_set_id_import_rule_sets_id_fkey" FOREIGN KEY ("rule_set_id") REFERENCES "magic_data"."import_rule_sets"("id");--> statement-breakpoint
ALTER TABLE "magic_data"."import_field_changes" ADD CONSTRAINT "import_field_changes_change_set_id_import_change_sets_id_fkey" FOREIGN KEY ("change_set_id") REFERENCES "magic_data"."import_change_sets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "magic_data"."import_field_rules" ADD CONSTRAINT "import_field_rules_rule_set_id_import_rule_sets_id_fkey" FOREIGN KEY ("rule_set_id") REFERENCES "magic_data"."import_rule_sets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "magic_data"."import_field_rules" ADD CONSTRAINT "import_field_rules_source_id_import_sources_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "magic_data"."import_sources"("source_id");--> statement-breakpoint
ALTER TABLE "magic_data"."import_policy_snapshots" ADD CONSTRAINT "import_policy_snapshots_rule_set_id_import_rule_sets_id_fkey" FOREIGN KEY ("rule_set_id") REFERENCES "magic_data"."import_rule_sets"("id");--> statement-breakpoint
ALTER TABLE "magic_data"."import_raw_records" ADD CONSTRAINT "import_raw_records_import_run_id_import_runs_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "magic_data"."import_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "magic_data"."import_raw_records" ADD CONSTRAINT "import_raw_records_source_id_import_sources_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "magic_data"."import_sources"("source_id");--> statement-breakpoint
ALTER TABLE "magic_app"."import_review_actions" ADD CONSTRAINT "import_review_actions_change_set_id_import_change_sets_id_fkey" FOREIGN KEY ("change_set_id") REFERENCES "magic_data"."import_change_sets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "magic_app"."import_review_actions" ADD CONSTRAINT "import_review_actions_I3uNqRrKUG0b_fkey" FOREIGN KEY ("field_change_id") REFERENCES "magic_data"."import_field_changes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "magic_app"."import_review_actions" ADD CONSTRAINT "import_review_actions_reviewer_id_users_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "magic_data"."import_runs" ADD CONSTRAINT "import_runs_source_id_import_sources_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "magic_data"."import_sources"("source_id");--> statement-breakpoint
ALTER TABLE "magic_data"."import_runs" ADD CONSTRAINT "import_runs_rule_set_id_import_rule_sets_id_fkey" FOREIGN KEY ("rule_set_id") REFERENCES "magic_data"."import_rule_sets"("id");