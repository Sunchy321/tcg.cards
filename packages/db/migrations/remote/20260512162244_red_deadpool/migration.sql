DROP VIEW "hearthstone_data"."tag_value_view";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."hsdata_import_job_chunks" DROP CONSTRAINT "hsdata_import_job_chunks_job_id_hsdata_import_jobs_id_fkey";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."hsdata_import_job_snapshots" DROP CONSTRAINT "hsdata_import_job_snapshots_job_id_hsdata_import_jobs_id_fkey";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."raw_entity_snapshot_tags" DROP CONSTRAINT "raw_entity_snapshot_tags_hEzNrbrC1iAX_fkey";--> statement-breakpoint
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
DROP TABLE "hearthstone_data"."hsdata_import_jobs";--> statement-breakpoint
DROP TABLE "hearthstone_data"."hsdata_import_job_chunks";--> statement-breakpoint
DROP TABLE "hearthstone_data"."hsdata_import_job_snapshots";--> statement-breakpoint
DROP TABLE "hearthstone_data"."raw_entity_snapshots";--> statement-breakpoint
DROP TABLE "hearthstone_data"."raw_entity_snapshot_tags";--> statement-breakpoint
DROP TABLE "hearthstone_data"."source_versions";--> statement-breakpoint
DROP TABLE "magic_data"."document_version_imports";--> statement-breakpoint
DROP TABLE "magic_data"."gatherer";--> statement-breakpoint
DROP TABLE "magic_data"."import_apply_logs";--> statement-breakpoint
DROP TABLE "magic_data"."import_change_sets";--> statement-breakpoint
DROP TABLE "magic_data"."import_field_changes";--> statement-breakpoint
DROP TABLE "magic_data"."import_field_rules";--> statement-breakpoint
DROP TABLE "magic_data"."import_policy_snapshots";--> statement-breakpoint
DROP TABLE "magic_data"."import_raw_records";--> statement-breakpoint
DROP TABLE "magic_data"."import_rule_sets";--> statement-breakpoint
DROP TABLE "magic_data"."import_runs";--> statement-breakpoint
DROP TABLE "magic_data"."import_sources";--> statement-breakpoint
DROP TABLE "magic_data"."scryfall";--> statement-breakpoint
DROP TABLE "magic_data"."mtgch";--> statement-breakpoint
DROP TYPE "hearthstone_data"."hsdata_import_chunk_status";--> statement-breakpoint
DROP TYPE "hearthstone_data"."hsdata_import_cleanup_status";--> statement-breakpoint
DROP TYPE "hearthstone_data"."hsdata_import_job_status";--> statement-breakpoint
DROP TYPE "hearthstone_data"."hsdata_projection_status";--> statement-breakpoint
DROP TYPE "magic"."document_version_import_status";--> statement-breakpoint
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