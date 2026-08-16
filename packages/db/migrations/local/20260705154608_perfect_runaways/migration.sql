CREATE SCHEMA "hearthstone_app";
--> statement-breakpoint
CREATE SCHEMA "hearthstone_data";
--> statement-breakpoint
CREATE SCHEMA "hearthstone";
--> statement-breakpoint
CREATE SCHEMA "magic_app";
--> statement-breakpoint
CREATE SCHEMA "magic_data";
--> statement-breakpoint
CREATE SCHEMA "magic";
--> statement-breakpoint
CREATE TYPE "publish_batch_row_action" AS ENUM('insert', 'update', 'delete', 'unchanged');--> statement-breakpoint
CREATE TYPE "publish_batch_row_status" AS ENUM('pending', 'applied', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "publish_batch_status" AS ENUM('planning', 'applying', 'paused', 'stopped', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "publish_operation_kind" AS ENUM('publish', 'repair', 'rollback', 'reanchor');--> statement-breakpoint
CREATE TYPE "publish_row_change_operation" AS ENUM('insert', 'update', 'delete');--> statement-breakpoint
CREATE TYPE "task_control_request_kind" AS ENUM('pause', 'resume', 'cancel');--> statement-breakpoint
CREATE TYPE "task_progress_mode" AS ENUM('bounded', 'unbound', 'simple');--> statement-breakpoint
CREATE TYPE "task_resume_mode" AS ENUM('none', 'durable', 'session_bound');--> statement-breakpoint
CREATE TYPE "task_run_status" AS ENUM('pending', 'running', 'pausing', 'paused', 'resuming', 'canceling', 'canceled', 'failed', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "task_stage_status" AS ENUM('pending', 'running', 'paused', 'canceled', 'failed', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "task_terminal_reason" AS ENUM('execution_failed', 'resume_incompatible', 'resume_context_lost', 'schedule_exhausted', 'manual_cancel', 'system_cancel', 'abandoned_stale_run');--> statement-breakpoint
CREATE TYPE "hearthstone"."game_change_type" AS ENUM('card_change', 'set_change', 'rule_change', 'format_death', 'card_adjustment');--> statement-breakpoint
CREATE TYPE "hearthstone"."legality" AS ENUM('banned_in_card_pool', 'banned_in_deck', 'banned', 'derived', 'legal', 'minor', 'unavailable', 'score');--> statement-breakpoint
CREATE TYPE "hearthstone"."status" AS ENUM('banned_in_card_pool', 'banned_in_deck', 'banned', 'derived', 'legal', 'minor', 'unavailable', 'score', 'buff', 'nerf', 'adjust');--> statement-breakpoint
CREATE TYPE "hearthstone"."change_type" AS ENUM('unknown', 'major', 'minor', 'non-functional', 'wording', 'bugged');--> statement-breakpoint
CREATE TYPE "hearthstone"."locale" AS ENUM('en', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'mx', 'pl', 'pt', 'ru', 'th', 'zhs', 'zht');--> statement-breakpoint
CREATE TYPE "hearthstone_data"."hsdata_projection_status" AS ENUM('not_started', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "hearthstone_data"."hsdata_snapshot_projection_state" AS ENUM('not_projected', 'version_only', 'projected');--> statement-breakpoint
CREATE TYPE "hearthstone_data"."hsdata_import_cleanup_status" AS ENUM('not_started', 'pending', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "hearthstone_data"."hsdata_import_job_status" AS ENUM('uploading', 'ready_to_finalize', 'finalizing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "magic"."category" AS ENUM('advertisement', 'art', 'auxiliary', 'decklist', 'default', 'minigame', 'player', 'token');--> statement-breakpoint
CREATE TYPE "magic"."locale" AS ENUM('en', 'zhs', 'zht', 'de', 'fr', 'it', 'ja', 'ko', 'pt', 'ru', 'es', 'ph', 'he', 'ar', 'sa', 'grc', 'la', 'qya');--> statement-breakpoint
CREATE TYPE "magic"."document_definition_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "magic"."document_node_change_relation_side" AS ENUM('from', 'to');--> statement-breakpoint
CREATE TYPE "magic"."document_node_change_type" AS ENUM('added', 'removed', 'modified', 'moved', 'renamed', 'renamed_modified', 'split', 'merged');--> statement-breakpoint
CREATE TYPE "magic"."document_node_content_status" AS ENUM('source', 'draft', 'reviewed', 'published', 'stale');--> statement-breakpoint
CREATE TYPE "magic"."document_node_kind" AS ENUM('heading', 'implicit_heading', 'content', 'example');--> statement-breakpoint
CREATE TYPE "magic"."document_version_lifecycle_status" AS ENUM('active', 'superseded');--> statement-breakpoint
CREATE TYPE "magic"."game_change_type" AS ENUM('card_change', 'set_change', 'rule_change', 'format_death', 'card_adjustment');--> statement-breakpoint
CREATE TYPE "magic"."border_color" AS ENUM('black', 'borderless', 'gold', 'silver', 'white', 'yellow');--> statement-breakpoint
CREATE TYPE "magic"."finish" AS ENUM('nonfoil', 'foil', 'etched', 'glossy');--> statement-breakpoint
CREATE TYPE "magic"."frame" AS ENUM('1993', '1997', '2003', '2015', 'future');--> statement-breakpoint
CREATE TYPE "magic"."full_image_type" AS ENUM('webp', 'jpg', 'png');--> statement-breakpoint
CREATE TYPE "magic"."game" AS ENUM('arena', 'astral', 'mtgo', 'paper', 'sega');--> statement-breakpoint
CREATE TYPE "magic"."image_status" AS ENUM('highres_scan', 'lowres', 'missing', 'placeholder');--> statement-breakpoint
CREATE TYPE "magic"."layout" AS ENUM('adventure', 'aftermath', 'augment', 'battle', 'case', 'class', 'double_faced', 'emblem', 'flip', 'flip_token_bottom', 'flip_token_top', 'host', 'leveler', 'meld', 'modal_dfc', 'multipart', 'mutate', 'normal', 'planar', 'prototype', 'reversible_card', 'saga', 'scheme', 'split', 'split_arena', 'token', 'transform', 'transform_token', 'vanguard');--> statement-breakpoint
CREATE TYPE "magic"."rarity" AS ENUM('bonus', 'common', 'mythic', 'rare', 'special', 'uncommon');--> statement-breakpoint
CREATE TYPE "magic"."scryfall_face" AS ENUM('back', 'bottom', 'front', 'top');--> statement-breakpoint
CREATE TYPE "magic"."security_stamp" AS ENUM('acorn', 'arena', 'circle', 'heart', 'oval', 'triangle');--> statement-breakpoint
CREATE TYPE "magic_data"."import_apply_action" AS ENUM('apply', 'rollback');--> statement-breakpoint
CREATE TYPE "magic_data"."import_coverage_state" AS ENUM('supported', 'conditional', 'unsupported');--> statement-breakpoint
CREATE TYPE "magic_data"."import_decision_mode" AS ENUM('auto_apply', 'batch_review', 'manual_review');--> statement-breakpoint
CREATE TYPE "magic_data"."import_change_decision_source" AS ENUM('system', 'review', 'apply', 'rollback');--> statement-breakpoint
CREATE TYPE "magic_data"."import_change_decision_status" AS ENUM('pending', 'ignored', 'approved', 'rejected', 'applied', 'rolled_back');--> statement-breakpoint
CREATE TYPE "magic_data"."import_entity_type" AS ENUM('card', 'cardLocalization', 'cardPart', 'cardPartLocalization', 'print', 'printPart');--> statement-breakpoint
CREATE TYPE "magic_data"."import_fallback_action" AS ENUM('ignore', 'manual_review');--> statement-breakpoint
CREATE TYPE "magic_data"."import_field_group" AS ENUM('structure', 'oracle', 'gameplay', 'localization', 'print_display', 'print_metadata', 'classification', 'legality', 'image', 'external_id', 'art');--> statement-breakpoint
CREATE TYPE "magic_data"."import_field_state" AS ENUM('provided', 'explicit_null', 'not_provided', 'not_applicable', 'parse_failed');--> statement-breakpoint
CREATE TYPE "magic_data"."import_risk_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "magic_data"."import_rule_set_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "magic_data"."import_run_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "magic_data"."import_source_status" AS ENUM('enabled', 'candidate', 'reconcile_only');--> statement-breakpoint
CREATE TYPE "magic_data"."import_strategy" AS ENUM('overwrite', 'ignore', 'overwrite_when_matched', 'approval_required');--> statement-breakpoint
CREATE TYPE "magic_data"."import_trigger_type" AS ENUM('manual', 'scheduled', 'webhook', 'backfill');--> statement-breakpoint
CREATE TYPE "magic_data"."import_trust_level" AS ENUM('high', 'medium');--> statement-breakpoint
CREATE TYPE "magic_data"."import_value_storage_mode" AS ENUM('inline', 'compressed_inline', 'object_storage_ref');--> statement-breakpoint
CREATE TYPE "magic_data"."document_version_import_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "task_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"task_type" text NOT NULL,
	"definition_version" text NOT NULL,
	"task_scope_type" text NOT NULL,
	"task_scope_key" text NOT NULL,
	"task_scope_snapshot" jsonb,
	"status" "task_run_status" DEFAULT 'pending'::"task_run_status" NOT NULL,
	"params" jsonb DEFAULT '{}' NOT NULL,
	"supports_resume" boolean DEFAULT false NOT NULL,
	"current_stage_key" text,
	"current_stage_index" integer,
	"current_resume_mode" "task_resume_mode",
	"paused_resume_mode" "task_resume_mode",
	"selection_anchor" jsonb,
	"resume_token" jsonb,
	"runtime_boot_id" text,
	"resume_context_key" text,
	"run_revision" integer DEFAULT 0 NOT NULL,
	"control_request_kind" "task_control_request_kind",
	"heartbeat_at" timestamp,
	"started_at" timestamp,
	"finished_at" timestamp,
	"error_code" text,
	"error_message" text,
	"terminal_reason" "task_terminal_reason",
	"retry_of_task_run_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "task_runs_retry_of_not_self_chk" CHECK ("retry_of_task_run_id" is null or "retry_of_task_run_id" <> "id"),
	CONSTRAINT "task_runs_current_stage_index_nonnegative_chk" CHECK ("current_stage_index" is null or "current_stage_index" >= 0),
	CONSTRAINT "task_runs_run_revision_nonnegative_chk" CHECK ("run_revision" >= 0),
	CONSTRAINT "task_runs_terminal_reason_required_chk" CHECK ("status" not in ('canceled', 'failed', 'abandoned') or "terminal_reason" is not null),
	CONSTRAINT "task_runs_finished_at_terminal_only_chk" CHECK ("finished_at" is null or "status" in ('canceled', 'failed', 'completed', 'abandoned')),
	CONSTRAINT "task_runs_terminal_stage_fields_empty_chk" CHECK ("status" not in ('canceled', 'failed', 'completed', 'abandoned')
      or ("current_stage_key" is null and "current_stage_index" is null and "current_resume_mode" is null)),
	CONSTRAINT "task_runs_session_bound_resume_fields_chk" CHECK ("paused_resume_mode" = 'session_bound'
      or ("runtime_boot_id" is null and "resume_context_key" is null)),
	CONSTRAINT "task_runs_session_bound_resume_fields_required_chk" CHECK ("paused_resume_mode" <> 'session_bound'
      or ("runtime_boot_id" is not null and "resume_context_key" is not null)),
	CONSTRAINT "task_runs_paused_resume_fields_scope_chk" CHECK ("status" in ('paused', 'resuming')
      or ("paused_resume_mode" is null and "runtime_boot_id" is null and "resume_context_key" is null))
);
--> statement-breakpoint
CREATE TABLE "task_stages" (
	"task_run_id" uuid NOT NULL,
	"stage_key" text NOT NULL,
	"stage_index" integer NOT NULL,
	"status" "task_stage_status" DEFAULT 'pending'::"task_stage_status" NOT NULL,
	"label" text NOT NULL,
	"progress_mode" "task_progress_mode" NOT NULL,
	"resume_mode" "task_resume_mode" DEFAULT 'none'::"task_resume_mode" NOT NULL,
	"total" integer,
	"done" integer,
	"resume_token" jsonb,
	"selection_anchor" jsonb,
	"segments" jsonb,
	"started_at" timestamp,
	"finished_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "task_stages_stage_index_nonnegative_chk" CHECK ("stage_index" >= 0),
	CONSTRAINT "task_stages_total_nonnegative_chk" CHECK ("total" is null or "total" >= 0),
	CONSTRAINT "task_stages_done_nonnegative_chk" CHECK ("done" is null or "done" >= 0),
	CONSTRAINT "task_stages_bounded_requires_total_done_chk" CHECK ("progress_mode" <> 'bounded' or "status" = 'pending' or ("total" is not null and "done" is not null)),
	CONSTRAINT "task_stages_unbound_requires_done_chk" CHECK ("progress_mode" <> 'unbound' or "done" is not null),
	CONSTRAINT "task_stages_simple_omits_counts_chk" CHECK ("progress_mode" <> 'simple' or ("total" is null and "done" is null)),
	CONSTRAINT "task_stages_bounded_done_not_over_total_chk" CHECK ("progress_mode" <> 'bounded' or "done" <= "total")
);
--> statement-breakpoint
CREATE TABLE "hearthstone"."announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source" text NOT NULL,
	"date" text NOT NULL,
	"effective_date" text,
	"name" text NOT NULL,
	"link" text[] DEFAULT '{}'::text[] NOT NULL,
	"version" integer NOT NULL,
	"last_version" integer
);
--> statement-breakpoint
CREATE TABLE "hearthstone"."announcement_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"announcement_id" uuid NOT NULL,
	"index" integer DEFAULT 0 NOT NULL,
	"type" "hearthstone"."game_change_type" NOT NULL,
	"effective_date" text,
	"format" text,
	"card_id" text,
	"set_id" text,
	"rule_id" text,
	"status" "hearthstone"."status",
	"score" integer,
	"adjustment" jsonb,
	"related_cards" text[]
);
--> statement-breakpoint
CREATE TABLE "hearthstone"."cards" (
	"card_id" text PRIMARY KEY,
	"legalities" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."card_image_assets" (
	"render_hash" text,
	"category" text DEFAULT 'base',
	"lang" text NOT NULL,
	"zone" text,
	"template" text,
	"premium" text,
	"r2_bucket" text NOT NULL,
	"r2_key" text NOT NULL,
	"content_type" text DEFAULT 'image/webp' NOT NULL,
	"byte_size" integer,
	"width" integer,
	"height" integer,
	"sha256" text,
	"source_export_id" text,
	"source_import_id" text,
	"status" text DEFAULT 'ready' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"verified_at" timestamp,
	CONSTRAINT "card_image_assets_pkey" PRIMARY KEY("render_hash","category","zone","template","premium")
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."card_image_exports" (
	"export_id" text PRIMARY KEY,
	"image_spec_version" text NOT NULL,
	"filters" jsonb DEFAULT '{}' NOT NULL,
	"request_count" integer NOT NULL,
	"max_request_count" integer NOT NULL,
	"file_format" text DEFAULT 'json' NOT NULL,
	"file_name" text NOT NULL,
	"file_sha256" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."card_image_imports" (
	"import_id" text PRIMARY KEY,
	"export_id" text NOT NULL,
	"image_spec_version" text NOT NULL,
	"archive_file_name" text NOT NULL,
	"archive_sha256" text,
	"expected_count" integer NOT NULL,
	"imported_count" integer NOT NULL,
	"uploaded_count" integer NOT NULL,
	"reused_count" integer NOT NULL,
	"missing_count" integer NOT NULL,
	"rejected_count" integer NOT NULL,
	"status" text NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hearthstone"."card_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"relation" text NOT NULL,
	"version" integer[] NOT NULL,
	"source_id" text NOT NULL,
	"target_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hearthstone"."entity_relations" (
	"source_id" text,
	"source_revision_hash" text,
	"relation" text,
	"target_id" text,
	"version" integer[] NOT NULL,
	"is_latest" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "entity_relations_pkey" PRIMARY KEY("source_id","source_revision_hash","relation","target_id"),
	CONSTRAINT "entity_relations_version_nonempty_chk" CHECK (cardinality("version") > 0)
);
--> statement-breakpoint
CREATE TABLE "hearthstone"."entities" (
	"card_id" text,
	"version" integer[] NOT NULL,
	"revision_hash" text,
	"dbf_id" integer NOT NULL,
	"legacy_payload" jsonb DEFAULT '{}' NOT NULL,
	"set" text NOT NULL,
	"class" text[] NOT NULL,
	"type" text NOT NULL,
	"cost" integer NOT NULL,
	"attack" integer,
	"health" integer,
	"durability" integer,
	"armor" integer,
	"rune" text[],
	"race" text[],
	"spell_school" text,
	"quest_type" text,
	"quest_progress" integer,
	"quest_part" integer,
	"hero_power" text,
	"tech_level" integer,
	"in_bobs_tavern" boolean DEFAULT false NOT NULL,
	"triple_card" text,
	"race_bucket" text,
	"armor_bucket" integer,
	"buddy" text,
	"banned_race" text,
	"mercenary_role" text,
	"mercenary_faction" text,
	"colddown" integer,
	"collectible" boolean NOT NULL,
	"elite" boolean NOT NULL,
	"rarity" text,
	"artist" text NOT NULL,
	"override_watermark" text,
	"faction" text,
	"mechanics" jsonb DEFAULT '{}' NOT NULL,
	"referenced_tags" jsonb DEFAULT '{}' NOT NULL,
	"text_builder_type" text DEFAULT 'default' NOT NULL,
	"change_type" "hearthstone"."change_type" DEFAULT 'unknown'::"hearthstone"."change_type" NOT NULL,
	"is_latest" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "entities_pkey" PRIMARY KEY("card_id","revision_hash"),
	CONSTRAINT "entities_version_nonempty_chk" CHECK (cardinality("version") > 0)
);
--> statement-breakpoint
CREATE TABLE "hearthstone"."entity_localizations" (
	"card_id" text,
	"version" integer[] NOT NULL,
	"lang" "hearthstone"."locale",
	"revision_hash" text,
	"localization_hash" text,
	"render_hash" text,
	"render_model" jsonb,
	"is_latest" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"text" text NOT NULL,
	"rich_text" text NOT NULL,
	"display_text" text NOT NULL,
	"target_text" text,
	"text_in_play" text,
	"how_to_earn" text,
	"how_to_earn_golden" text,
	"flavor_text" text,
	"loc_change_type" "hearthstone"."change_type" DEFAULT 'unknown'::"hearthstone"."change_type" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "entity_localizations_pkey" PRIMARY KEY("card_id","lang","revision_hash","localization_hash"),
	CONSTRAINT "entity_localizations_version_nonempty_chk" CHECK (cardinality("version") > 0)
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."field_commits" (
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
CREATE TABLE "hearthstone_data"."field_conflicts" (
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
CREATE TABLE "hearthstone_data"."field_winners" (
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
CREATE TABLE "hearthstone"."formats" (
	"format_id" text PRIMARY KEY,
	"localization" jsonb NOT NULL,
	"sets" text[],
	"banlist" jsonb DEFAULT '[]' NOT NULL,
	"birthday" text,
	"deathdate" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hearthstone"."card_changes" (
	"source" text NOT NULL,
	"date" text NOT NULL,
	"effective_date" text,
	"name" text NOT NULL,
	"version" integer,
	"last_version" integer,
	"link" text[] DEFAULT '{}'::text[] NOT NULL,
	"type" "hearthstone"."game_change_type" NOT NULL,
	"format" text,
	"card_id" text NOT NULL,
	"set_id" text,
	"group" text,
	"status" "hearthstone"."status" NOT NULL,
	"score" integer,
	"adjustment" jsonb
);
--> statement-breakpoint
CREATE TABLE "hearthstone"."format_changes" (
	"source" text NOT NULL,
	"date" text NOT NULL,
	"effective_date" text,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"last_version" integer,
	"link" text[] DEFAULT '{}'::text[] NOT NULL,
	"type" "hearthstone"."game_change_type" NOT NULL,
	"format" text,
	"card_id" text,
	"set_id" text,
	"rule_id" text,
	"group" text,
	"status" "hearthstone"."status",
	"score" integer,
	"adjustment" jsonb,
	"related_cards" text[]
);
--> statement-breakpoint
CREATE TABLE "hearthstone"."set_changes" (
	"source" text NOT NULL,
	"date" text NOT NULL,
	"effective_date" text,
	"name" text NOT NULL,
	"version" integer,
	"last_version" integer,
	"link" text[] DEFAULT '{}'::text[] NOT NULL,
	"type" "hearthstone"."game_change_type" NOT NULL,
	"format" text,
	"set_id" text NOT NULL,
	"status" "hearthstone"."status" NOT NULL,
	"score" integer
);
--> statement-breakpoint
CREATE TABLE "hearthstone"."patches" (
	"build_number" integer PRIMARY KEY,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"hash" text NOT NULL,
	"is_latest" boolean DEFAULT false NOT NULL,
	"is_updated" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hearthstone"."sets" (
	"set_id" text PRIMARY KEY,
	"dbf_id" integer,
	"slug" text,
	"raw_name" text,
	"type" text NOT NULL,
	"release_date" text NOT NULL,
	"card_count_full" integer,
	"card_count" integer,
	"group" text
);
--> statement-breakpoint
CREATE TABLE "hearthstone"."set_localizations" (
	"set_id" text,
	"lang" text,
	"name" text NOT NULL,
	CONSTRAINT "set_localizations_pkey" PRIMARY KEY("set_id","lang")
);
--> statement-breakpoint
CREATE TABLE "hearthstone"."tags" (
	"enum_id" integer PRIMARY KEY,
	"slug" text NOT NULL,
	"slug_aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"name" text,
	"raw_name" text,
	"raw_type" text,
	"raw_names" text[] DEFAULT '{}'::text[] NOT NULL,
	"normalize_kind" text DEFAULT 'identity' NOT NULL,
	"normalize_config" jsonb DEFAULT '{}' NOT NULL,
	"project_target_type" text,
	"project_target_path" text,
	"project_kind" text,
	"project_config" jsonb DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'discovered' NOT NULL,
	"description" text,
	"first_seen_source_tag" integer,
	"last_seen_source_tag" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."raw_entity_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"card_id" text NOT NULL,
	"dbf_id" integer NOT NULL,
	"source_tags" integer[] NOT NULL,
	"entity_xml_version" integer NOT NULL,
	"snapshot_hash" text NOT NULL,
	"extra_payload" jsonb DEFAULT '{}' NOT NULL,
	"projection_state" "hearthstone_data"."hsdata_snapshot_projection_state" DEFAULT 'not_projected'::"hearthstone_data"."hsdata_snapshot_projection_state" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "raw_entity_snapshots_source_tags_nonempty_chk" CHECK (cardinality("source_tags") > 0)
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."raw_entity_snapshot_tags" (
	"snapshot_id" uuid,
	"enum_id" integer,
	"tag_order" integer DEFAULT 0,
	"raw_name" text DEFAULT '' NOT NULL,
	"raw_type" text DEFAULT '' NOT NULL,
	"raw_payload" jsonb DEFAULT '{}' NOT NULL,
	"value_kind" text DEFAULT 'json' NOT NULL,
	"bool_value" boolean,
	"int_value" integer,
	"string_value" text,
	"enum_value" text,
	"loc_string_value" jsonb,
	"card_value" text,
	"json_value" jsonb,
	"parse_status" text DEFAULT 'parsed' NOT NULL,
	CONSTRAINT "raw_entity_snapshot_tags_pkey" PRIMARY KEY("snapshot_id","enum_id","tag_order")
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."source_versions" (
	"source_tag" integer PRIMARY KEY,
	"source_commit" text DEFAULT '' NOT NULL,
	"build" integer,
	"source_hash" text DEFAULT '' NOT NULL,
	"source_uri" text DEFAULT '' NOT NULL,
	"import_engine_version" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"projection_status" "hearthstone_data"."hsdata_projection_status" DEFAULT 'not_started'::"hearthstone_data"."hsdata_projection_status" NOT NULL,
	"projection_error" text,
	"imported_at" timestamp,
	"projected_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."field_sync_cursors" (
	"consumer" text,
	"stream" text,
	"last_pulled_sequence" bigint DEFAULT 0 NOT NULL,
	"last_pushed_sequence" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "field_sync_cursors_pkey" PRIMARY KEY("consumer","stream")
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."push_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"stream" text NOT NULL,
	"consumer" text NOT NULL,
	"status" text NOT NULL,
	"pushed_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"blocked_reason" text,
	"blocked_message" text,
	"blocked_sequence" bigint,
	"started_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."hsdata_import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source_tag" integer NOT NULL,
	"source_commit" text DEFAULT '' NOT NULL,
	"source_uri" text DEFAULT '' NOT NULL,
	"build" integer NOT NULL,
	"source_hash" text NOT NULL,
	"manifest_hash" text NOT NULL,
	"chunking_version" text NOT NULL,
	"payload_format_version" text NOT NULL,
	"payload_encoding" text NOT NULL,
	"import_engine_version" text NOT NULL,
	"max_bytes_per_chunk" integer NOT NULL,
	"max_entities_per_chunk" integer NOT NULL,
	"dry_run" boolean DEFAULT false NOT NULL,
	"force" boolean DEFAULT false NOT NULL,
	"total_chunk_count" integer NOT NULL,
	"total_entity_count" integer NOT NULL,
	"status" "hearthstone_data"."hsdata_import_job_status" DEFAULT 'uploading'::"hearthstone_data"."hsdata_import_job_status" NOT NULL,
	"error" text,
	"report" jsonb,
	"staging_cleanup_status" "hearthstone_data"."hsdata_import_cleanup_status" DEFAULT 'not_started'::"hearthstone_data"."hsdata_import_cleanup_status" NOT NULL,
	"staging_cleanup_error" text,
	"cleaned_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"finalized_at" timestamp,
	CONSTRAINT "hsdata_import_jobs_total_chunk_count_positive_chk" CHECK ("total_chunk_count" > 0),
	CONSTRAINT "hsdata_import_jobs_total_entity_count_positive_chk" CHECK ("total_entity_count" > 0),
	CONSTRAINT "hsdata_import_jobs_max_bytes_per_chunk_positive_chk" CHECK ("max_bytes_per_chunk" > 0),
	CONSTRAINT "hsdata_import_jobs_max_entities_per_chunk_positive_chk" CHECK ("max_entities_per_chunk" > 0)
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."hsdata_import_job_workspace_snapshots" (
	"job_id" uuid,
	"chunk_index" integer NOT NULL,
	"card_id" text,
	"snapshot_id" uuid NOT NULL,
	"snapshot_hash" text NOT NULL,
	"is_new_snapshot" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hsdata_import_job_workspace_snapshots_pkey" PRIMARY KEY("job_id","card_id"),
	CONSTRAINT "hsdata_import_job_ws_snapshots_chunk_index_nonnegative_chk" CHECK ("chunk_index" >= 0)
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."publish_baselines" (
	"publish_target" text,
	"environment" text,
	"publish_type" text DEFAULT 'card_data',
	"target_fingerprint" text NOT NULL,
	"batch_id" uuid NOT NULL,
	"build_min" integer NOT NULL,
	"build_max" integer NOT NULL,
	"generation_fingerprint" text DEFAULT 'card-data-projector/v1' NOT NULL,
	"generation_order" integer DEFAULT 1 NOT NULL,
	"manifest_hash" text NOT NULL,
	"total_row_count" integer NOT NULL,
	"published_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "publish_baselines_pkey" PRIMARY KEY("publish_target","environment","publish_type"),
	CONSTRAINT "publish_baselines_build_range_chk" CHECK ("build_min" <= "build_max"),
	CONSTRAINT "publish_baselines_build_min_positive_chk" CHECK ("build_min" > 0),
	CONSTRAINT "publish_baselines_generation_order_positive_chk" CHECK ("generation_order" > 0),
	CONSTRAINT "publish_baselines_total_row_count_nonnegative_chk" CHECK ("total_row_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."publish_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"publish_target" text NOT NULL,
	"environment" text NOT NULL,
	"target_fingerprint" text NOT NULL,
	"publish_type" text DEFAULT 'card_data' NOT NULL,
	"operation_kind" "publish_operation_kind" DEFAULT 'publish'::"publish_operation_kind" NOT NULL,
	"build_min" integer NOT NULL,
	"build_max" integer NOT NULL,
	"generation_fingerprint" text DEFAULT 'card-data-projector/v1' NOT NULL,
	"generation_order" integer DEFAULT 1 NOT NULL,
	"manifest_hash" text NOT NULL,
	"previous_manifest_hash" text,
	"total_row_count" integer DEFAULT 0 NOT NULL,
	"changed_row_count" integer DEFAULT 0 NOT NULL,
	"inserted_row_count" integer DEFAULT 0 NOT NULL,
	"updated_row_count" integer DEFAULT 0 NOT NULL,
	"deleted_row_count" integer DEFAULT 0 NOT NULL,
	"unchanged_row_count" integer DEFAULT 0 NOT NULL,
	"card_row_count" integer DEFAULT 0 NOT NULL,
	"entity_row_count" integer DEFAULT 0 NOT NULL,
	"localization_row_count" integer DEFAULT 0 NOT NULL,
	"relation_row_count" integer DEFAULT 0 NOT NULL,
	"status" "publish_batch_status" DEFAULT 'planning'::"publish_batch_status" NOT NULL,
	"error" text,
	"summary" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	CONSTRAINT "publish_batches_build_range_chk" CHECK ("build_min" <= "build_max"),
	CONSTRAINT "publish_batches_build_min_positive_chk" CHECK ("build_min" > 0),
	CONSTRAINT "publish_batches_generation_order_positive_chk" CHECK ("generation_order" > 0),
	CONSTRAINT "publish_batches_total_row_count_nonnegative_chk" CHECK ("total_row_count" >= 0),
	CONSTRAINT "publish_batches_changed_row_count_nonnegative_chk" CHECK ("changed_row_count" >= 0),
	CONSTRAINT "publish_batches_inserted_row_count_nonnegative_chk" CHECK ("inserted_row_count" >= 0),
	CONSTRAINT "publish_batches_updated_row_count_nonnegative_chk" CHECK ("updated_row_count" >= 0),
	CONSTRAINT "publish_batches_deleted_row_count_nonnegative_chk" CHECK ("deleted_row_count" >= 0),
	CONSTRAINT "publish_batches_unchanged_row_count_nonnegative_chk" CHECK ("unchanged_row_count" >= 0),
	CONSTRAINT "publish_batches_card_row_count_nonnegative_chk" CHECK ("card_row_count" >= 0),
	CONSTRAINT "publish_batches_entity_row_count_nonnegative_chk" CHECK ("entity_row_count" >= 0),
	CONSTRAINT "publish_batches_localization_row_count_nonnegative_chk" CHECK ("localization_row_count" >= 0),
	CONSTRAINT "publish_batches_relation_row_count_nonnegative_chk" CHECK ("relation_row_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."publish_batch_rows" (
	"batch_id" uuid,
	"table_name" text,
	"row_key" text,
	"row_hash" text NOT NULL,
	"previous_row_hash" text,
	"action" "publish_batch_row_action" NOT NULL,
	"status" "publish_batch_row_status" DEFAULT 'pending'::"publish_batch_row_status" NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"applied_at" timestamp,
	CONSTRAINT "publish_batch_rows_pkey" PRIMARY KEY("batch_id","table_name","row_key")
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."publish_row_baselines" (
	"publish_target" text,
	"environment" text,
	"publish_type" text DEFAULT 'card_data',
	"table_name" text,
	"row_key" text,
	"row_hash" text NOT NULL,
	"source_batch_id" uuid,
	"published_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "publish_row_baselines_pkey" PRIMARY KEY("publish_target","environment","publish_type","table_name","row_key")
);
--> statement-breakpoint
CREATE TABLE "magic"."announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source" text NOT NULL,
	"date" text NOT NULL,
	"name" text NOT NULL,
	"effective_date" text,
	"effective_date_tabletop" text,
	"effective_date_online" text,
	"effective_date_arena" text,
	"next_date" text,
	"link" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."announcement_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"announcement_id" uuid NOT NULL,
	"type" "magic"."game_change_type" NOT NULL,
	"effective_date" text,
	"format" text,
	"card_id" text,
	"set_id" text,
	"rule_id" text,
	"status" text,
	"score" integer,
	"adjustment" jsonb,
	"related_cards" text[] DEFAULT '{}'::text[]
);
--> statement-breakpoint
CREATE TABLE "magic"."announcement_rule_items" (
	"id" text PRIMARY KEY,
	"lang" text NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."decks" (
	"deck_id" text PRIMARY KEY,
	"name" text NOT NULL,
	"description" text,
	"format" text NOT NULL,
	"cards" jsonb NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."cards" (
	"card_id" text PRIMARY KEY,
	"part_count" smallint NOT NULL,
	"name" text NOT NULL,
	"typeline" text NOT NULL,
	"text" text NOT NULL,
	"mana_value" double precision NOT NULL,
	"color_identity" bit(16) NOT NULL,
	"keywords" text[] NOT NULL,
	"counters" text[] NOT NULL,
	"producible_mana" bit(7),
	"content_warning" boolean,
	"category" "magic"."category" NOT NULL,
	"tags" text[] NOT NULL,
	"legalities" jsonb NOT NULL,
	"scryfall_oracle_id" uuid[] NOT NULL,
	"card_locked_paths" text[] DEFAULT '{}'::text[] NOT NULL,
	"card_updations" jsonb DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."card_localizations" (
	"card_id" text,
	"locale" "magic"."locale",
	"loc_name" text NOT NULL,
	"loc_typeline" text NOT NULL,
	"loc_text" text NOT NULL,
	"last_date" text NOT NULL,
	"card_localization_locked_paths" text[] DEFAULT '{}'::text[] NOT NULL,
	"card_localization_updations" jsonb DEFAULT '[]' NOT NULL,
	CONSTRAINT "card_localizations_pkey" PRIMARY KEY("card_id","locale")
);
--> statement-breakpoint
CREATE TABLE "magic"."card_parts" (
	"card_id" text,
	"part_index" smallint,
	"part_name" text NOT NULL,
	"part_typeline" text NOT NULL,
	"part_text" text NOT NULL,
	"cost" text[],
	"part_mana_value" double precision,
	"color" bit(16),
	"color_indicator" bit(5),
	"type_super" text[],
	"type_main" text[] NOT NULL,
	"type_sub" text[],
	"power" text,
	"toughness" text,
	"loyalty" text,
	"defense" text,
	"hand_modifier" text,
	"life_modifier" text,
	"card_part_locked_paths" text[] DEFAULT '{}'::text[] NOT NULL,
	"card_part_updations" jsonb DEFAULT '[]' NOT NULL,
	CONSTRAINT "card_parts_pkey" PRIMARY KEY("card_id","part_index")
);
--> statement-breakpoint
CREATE TABLE "magic"."card_part_localizations" (
	"card_id" text,
	"locale" "magic"."locale",
	"part_index" smallint,
	"part_loc_name" text NOT NULL,
	"part_loc_typeline" text NOT NULL,
	"part_loc_text" text NOT NULL,
	"card_part_localization_locked_paths" text[] DEFAULT '{}'::text[] NOT NULL,
	"card_part_localization_updations" jsonb DEFAULT '[]' NOT NULL,
	CONSTRAINT "card_part_localizations_pkey" PRIMARY KEY("card_id","locale","part_index")
);
--> statement-breakpoint
CREATE TABLE "magic"."card_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"relation" text NOT NULL,
	"source_id" text NOT NULL,
	"target_id" text NOT NULL,
	"target_set" text,
	"target_number" text,
	"target_lang" text
);
--> statement-breakpoint
CREATE TABLE "magic"."cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"keys" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."cycle_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"cycle_id" uuid NOT NULL,
	"color" text NOT NULL,
	"card_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."document_definitions" (
	"id" text PRIMARY KEY,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"game" text DEFAULT 'magic' NOT NULL,
	"source_locale" "magic"."locale" NOT NULL,
	"parser_strategy" text NOT NULL,
	"node_id_pattern" text,
	"status" "magic"."document_definition_status" DEFAULT 'active'::"magic"."document_definition_status" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."document_nodes" (
	"id" text PRIMARY KEY,
	"version_id" text NOT NULL,
	"document_id" text NOT NULL,
	"node_id" text NOT NULL,
	"node_kind" "magic"."document_node_kind" NOT NULL,
	"path" text NOT NULL,
	"level" integer NOT NULL,
	"parent_node_id" text,
	"sibling_order" integer NOT NULL,
	"source_content_hash" text,
	"source_fingerprint_hash" text,
	"source_content_ref_id" uuid,
	"entity_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."document_node_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"document_id" text NOT NULL,
	"from_version_id" text NOT NULL,
	"to_version_id" text NOT NULL,
	"entity_id" text,
	"from_node_ref_id" text,
	"to_node_ref_id" text,
	"type" "magic"."document_node_change_type" NOT NULL,
	"confidence_score" double precision NOT NULL,
	"details" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."document_node_change_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"change_id" uuid NOT NULL,
	"side" "magic"."document_node_change_relation_side" NOT NULL,
	"entity_id" text,
	"node_ref_id" text,
	"node_id" text,
	"weight" double precision,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."document_node_contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"document_node_id" text NOT NULL,
	"locale" "magic"."locale" NOT NULL,
	"content" bytea NOT NULL,
	"content_hash" text NOT NULL,
	"fingerprint_hash" text NOT NULL,
	"size" integer NOT NULL,
	"source_content_hash" text NOT NULL,
	"status" "magic"."document_node_content_status" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."document_node_entities" (
	"id" text PRIMARY KEY,
	"document_id" text NOT NULL,
	"origin_version_id" text NOT NULL,
	"origin_node_id" text NOT NULL,
	"current_node_ref_id" text,
	"current_node_id" text,
	"current_version_id" text,
	"total_revisions" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."document_versions" (
	"id" text PRIMARY KEY,
	"version_tag" text NOT NULL,
	"document_id" text NOT NULL,
	"effective_date" text NOT NULL,
	"published_at" text NOT NULL,
	"txt_url" text,
	"pdf_url" text,
	"docx_url" text,
	"total_nodes" integer DEFAULT 0 NOT NULL,
	"lifecycle_status" "magic"."document_version_lifecycle_status" DEFAULT 'active'::"magic"."document_version_lifecycle_status" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."formats" (
	"format_id" text PRIMARY KEY,
	"localization" jsonb NOT NULL,
	"sets" text[],
	"banlist" jsonb DEFAULT '[]' NOT NULL,
	"birthday" text,
	"deathdate" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."card_changes" (
	"source" text NOT NULL,
	"date" text NOT NULL,
	"effective_date" text,
	"name" text NOT NULL,
	"link" text[] DEFAULT '{}'::text[] NOT NULL,
	"type" "magic"."game_change_type" NOT NULL,
	"format" text,
	"card_id" text NOT NULL,
	"set_id" text,
	"group" text,
	"status" text NOT NULL,
	"score" integer,
	"adjustment" jsonb
);
--> statement-breakpoint
CREATE TABLE "magic"."format_changes" (
	"source" text NOT NULL,
	"date" text NOT NULL,
	"effective_date" text,
	"name" text NOT NULL,
	"link" text[] DEFAULT '{}'::text[] NOT NULL,
	"type" "magic"."game_change_type" NOT NULL,
	"format" text,
	"card_id" text,
	"set_id" text,
	"rule_id" text,
	"group" text,
	"status" text,
	"score" integer,
	"adjustment" jsonb
);
--> statement-breakpoint
CREATE TABLE "magic"."set_changes" (
	"source" text NOT NULL,
	"date" text NOT NULL,
	"effective_date" text,
	"name" text NOT NULL,
	"link" text[] DEFAULT '{}'::text[] NOT NULL,
	"type" "magic"."game_change_type" NOT NULL,
	"format" text,
	"set_id" text NOT NULL,
	"status" text NOT NULL,
	"score" integer
);
--> statement-breakpoint
CREATE TABLE "magic"."prints" (
	"card_id" text,
	"set" text,
	"number" text,
	"lang" "magic"."locale",
	"print_name" text NOT NULL,
	"print_typeline" text NOT NULL,
	"print_text" text NOT NULL,
	"layout" "magic"."layout" NOT NULL,
	"frame" "magic"."frame" NOT NULL,
	"frame_effects" text[] NOT NULL,
	"border_color" "magic"."border_color" NOT NULL,
	"card_back" uuid,
	"security_stamp" "magic"."security_stamp",
	"promo_types" text[],
	"rarity" "magic"."rarity" NOT NULL,
	"release_date" text NOT NULL,
	"is_digital" boolean NOT NULL,
	"is_promo" boolean NOT NULL,
	"is_reprint" boolean NOT NULL,
	"finishes" "magic"."finish"[] NOT NULL,
	"has_high_res_image" boolean NOT NULL,
	"image_status" "magic"."image_status" NOT NULL,
	"full_image_type" "magic"."full_image_type" NOT NULL,
	"in_booster" boolean NOT NULL,
	"games" "magic"."game"[] NOT NULL,
	"preview_date" text,
	"preview_source" text,
	"preview_uri" text,
	"print_tags" text[] NOT NULL,
	"print_scryfall_oracle_id" uuid NOT NULL,
	"scryfall_card_id" uuid,
	"scryfall_face" "magic"."scryfall_face",
	"scryfall_image_uris" jsonb,
	"arena_id" integer,
	"mtgo_id" integer,
	"mtgo_foil_id" integer,
	"multiverse_id" integer[] NOT NULL,
	"tcg_player_id" integer,
	"card_market_id" integer,
	"print_locked_paths" text[] DEFAULT '{}'::text[] NOT NULL,
	"print_updations" jsonb DEFAULT '[]' NOT NULL,
	CONSTRAINT "prints_pkey" PRIMARY KEY("card_id","set","number","lang")
);
--> statement-breakpoint
CREATE TABLE "magic"."print_parts" (
	"card_id" text,
	"set" text,
	"number" text,
	"lang" "magic"."locale",
	"part_index" smallint,
	"print_part_name" text NOT NULL,
	"print_part_typeline" text NOT NULL,
	"print_part_text" text NOT NULL,
	"attraction_lights" bit(6),
	"flavor_name" text,
	"flavor_text" text,
	"artist" text,
	"watermark" text,
	"scryfall_illus_id" uuid[],
	"print_part_locked_paths" text[] DEFAULT '{}'::text[] NOT NULL,
	"print_part_updations" jsonb DEFAULT '[]' NOT NULL,
	CONSTRAINT "print_parts_pkey" PRIMARY KEY("card_id","set","number","lang","part_index")
);
--> statement-breakpoint
CREATE TABLE "magic"."rules" (
	"date" text,
	"lang" text,
	CONSTRAINT "rules_pkey" PRIMARY KEY("date","lang")
);
--> statement-breakpoint
CREATE TABLE "magic"."rule_change" (
	"id" text PRIMARY KEY,
	"from_source_id" text NOT NULL,
	"to_source_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"from_node_id" text,
	"to_node_id" text,
	"type" text NOT NULL,
	"details" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."rule_content" (
	"hash" text PRIMARY KEY,
	"content" bytea NOT NULL,
	"size" integer NOT NULL,
	"ref_count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."rule_entity" (
	"id" text PRIMARY KEY,
	"current_node_id" text,
	"current_rule_id" text,
	"current_source_id" text,
	"total_revisions" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."rule_items" (
	"date" text,
	"lang" text,
	"item_id" text,
	"index" integer NOT NULL,
	"depth" integer NOT NULL,
	"serial" text,
	"text" text NOT NULL,
	"rich_text" text NOT NULL,
	CONSTRAINT "rule_items_pkey" PRIMARY KEY("date","lang","item_id")
);
--> statement-breakpoint
CREATE TABLE "magic"."rule_node" (
	"id" text PRIMARY KEY,
	"source_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"path" text NOT NULL,
	"level" integer NOT NULL,
	"parent_id" text,
	"title" text,
	"content_hash" text NOT NULL,
	"entity_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."rule_source" (
	"id" text PRIMARY KEY,
	"effective_date" text,
	"published_at" text,
	"txt_url" text,
	"pdf_url" text,
	"docx_url" text,
	"total_rules" integer,
	"imported_at" timestamp DEFAULT now(),
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."rulings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"card_id" text NOT NULL,
	"source" text NOT NULL,
	"date" text NOT NULL,
	"text" text NOT NULL,
	"rich_text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."boosters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"set_id" text NOT NULL,
	"booster_id" text NOT NULL,
	"total_weight" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"booster_id" uuid NOT NULL,
	"weight" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."pack_contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"pack_id" uuid NOT NULL,
	"type" text NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."sets" (
	"set_id" text PRIMARY KEY,
	"block" text,
	"parent" text,
	"printed_size" integer,
	"card_count" integer NOT NULL,
	"langs" "magic"."locale"[] NOT NULL,
	"rarities" "magic"."rarity"[] NOT NULL,
	"type" text NOT NULL,
	"is_digital" boolean NOT NULL,
	"is_foil_only" boolean NOT NULL,
	"is_nonfoil_only" boolean NOT NULL,
	"symbol_style" text[],
	"double_faced_icon" text[],
	"release_date" text,
	"scryfall_id" uuid NOT NULL,
	"scryfall_code" text NOT NULL,
	"mtgo_code" text,
	"tcg_player_id" integer
);
--> statement-breakpoint
CREATE TABLE "magic"."set_localizations" (
	"set_id" text,
	"lang" text,
	"name" text,
	"url" text,
	CONSTRAINT "set_localizations_pkey" PRIMARY KEY("set_id","lang")
);
--> statement-breakpoint
CREATE TABLE "magic"."booster_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"booster_id" uuid NOT NULL,
	"type_id" text NOT NULL,
	"total_weight" bigint NOT NULL,
	"allow_duplicates" boolean NOT NULL,
	"balance_colors" boolean NOT NULL,
	"is_foil" boolean NOT NULL,
	"is_fixed" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."booster_sheet_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"sheet_id" uuid,
	"card_id" text NOT NULL,
	"set" text NOT NULL,
	"number" text NOT NULL,
	"lang" text,
	"weight" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."gatherer" (
	"multiverse_id" integer PRIMARY KEY,
	"data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "magic_data"."mtgch" (
	"set" text,
	"number" text,
	"data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "mtgch_pkey" PRIMARY KEY("set","number")
);
--> statement-breakpoint
CREATE TABLE "magic_data"."scryfall" (
	"card_id" uuid PRIMARY KEY,
	"oracle_id" uuid NOT NULL,
	"legalities" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."document_version_imports" (
	"version_id" text PRIMARY KEY,
	"source_file_hash" text NOT NULL,
	"parser_version" text NOT NULL,
	"normalized_content_version" text NOT NULL,
	"import_run_id" text NOT NULL,
	"imported_at" timestamp,
	"import_status" "magic_data"."document_version_import_status" DEFAULT 'pending'::"magic_data"."document_version_import_status" NOT NULL,
	"import_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "task_runs_active_task_type_uq" ON "task_runs" ("task_type") WHERE "status" in ('pending', 'running', 'pausing', 'paused', 'resuming', 'canceling');--> statement-breakpoint
CREATE INDEX "task_runs_status_idx" ON "task_runs" ("status");--> statement-breakpoint
CREATE INDEX "task_runs_scope_idx" ON "task_runs" ("task_scope_type","task_scope_key");--> statement-breakpoint
CREATE INDEX "task_runs_task_type_status_idx" ON "task_runs" ("task_type","status");--> statement-breakpoint
CREATE INDEX "task_runs_heartbeat_at_idx" ON "task_runs" ("heartbeat_at");--> statement-breakpoint
CREATE INDEX "task_runs_retry_of_idx" ON "task_runs" ("retry_of_task_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_stages_task_run_id_stage_key_uq" ON "task_stages" ("task_run_id","stage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "task_stages_task_run_id_stage_index_uq" ON "task_stages" ("task_run_id","stage_index");--> statement-breakpoint
CREATE INDEX "task_stages_task_run_id_status_idx" ON "task_stages" ("task_run_id","status");--> statement-breakpoint
CREATE INDEX "cards_deleted_at_idx" ON "hearthstone"."cards" ("deleted_at") WHERE "deleted_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "card_image_assets_r2_key_uq" ON "hearthstone_data"."card_image_assets" ("r2_key");--> statement-breakpoint
CREATE INDEX "card_image_assets_render_hash_idx" ON "hearthstone_data"."card_image_assets" ("render_hash");--> statement-breakpoint
CREATE INDEX "card_image_assets_lang_status_idx" ON "hearthstone_data"."card_image_assets" ("lang","status");--> statement-breakpoint
CREATE INDEX "card_image_assets_variant_status_idx" ON "hearthstone_data"."card_image_assets" ("category","zone","template","premium","status");--> statement-breakpoint
CREATE INDEX "card_image_exports_created_at_idx" ON "hearthstone_data"."card_image_exports" ("created_at");--> statement-breakpoint
CREATE INDEX "card_image_exports_image_spec_version_idx" ON "hearthstone_data"."card_image_exports" ("image_spec_version");--> statement-breakpoint
CREATE INDEX "card_image_imports_created_at_idx" ON "hearthstone_data"."card_image_imports" ("created_at");--> statement-breakpoint
CREATE INDEX "card_image_imports_export_id_idx" ON "hearthstone_data"."card_image_imports" ("export_id");--> statement-breakpoint
CREATE INDEX "card_image_imports_image_spec_version_idx" ON "hearthstone_data"."card_image_imports" ("image_spec_version");--> statement-breakpoint
CREATE INDEX "entity_relations_deleted_at_idx" ON "hearthstone"."entity_relations" ("deleted_at") WHERE "deleted_at" is not null;--> statement-breakpoint
CREATE INDEX "entity_relations_source_idx" ON "hearthstone"."entity_relations" ("source_id") WHERE "deleted_at" is null;--> statement-breakpoint
CREATE INDEX "entity_relations_target_idx" ON "hearthstone"."entity_relations" ("target_id") WHERE "deleted_at" is null;--> statement-breakpoint
CREATE INDEX "entity_relations_source_relation_idx" ON "hearthstone"."entity_relations" ("source_id","relation") WHERE "deleted_at" is null;--> statement-breakpoint
CREATE INDEX "entity_relations_target_relation_idx" ON "hearthstone"."entity_relations" ("target_id","relation") WHERE "deleted_at" is null;--> statement-breakpoint
CREATE INDEX "entity_relations_latest_idx" ON "hearthstone"."entity_relations" ("is_latest") WHERE "deleted_at" is null;--> statement-breakpoint
CREATE INDEX "entity_relations_version_gin_idx" ON "hearthstone"."entity_relations" USING gin ("version") WHERE "deleted_at" is null;--> statement-breakpoint
CREATE INDEX "entities_latest_idx" ON "hearthstone"."entities" ("is_latest") WHERE "deleted_at" is null;--> statement-breakpoint
CREATE INDEX "entities_version_gin_idx" ON "hearthstone"."entities" USING gin ("version") WHERE "deleted_at" is null;--> statement-breakpoint
CREATE INDEX "entities_deleted_at_idx" ON "hearthstone"."entities" ("deleted_at") WHERE "deleted_at" is not null;--> statement-breakpoint
CREATE INDEX "entity_localizations_card_lang_idx" ON "hearthstone"."entity_localizations" ("card_id","lang") WHERE "deleted_at" is null;--> statement-breakpoint
CREATE INDEX "entity_localizations_latest_idx" ON "hearthstone"."entity_localizations" ("is_latest") WHERE "deleted_at" is null;--> statement-breakpoint
CREATE INDEX "entity_localizations_version_gin_idx" ON "hearthstone"."entity_localizations" USING gin ("version") WHERE "deleted_at" is null;--> statement-breakpoint
CREATE INDEX "entity_localizations_render_hash_idx" ON "hearthstone"."entity_localizations" ("render_hash") WHERE ("render_hash" is not null and "deleted_at" is null);--> statement-breakpoint
CREATE INDEX "entity_localizations_deleted_at_idx" ON "hearthstone"."entity_localizations" ("deleted_at") WHERE "deleted_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "field_commits_client_mutation_id_uq" ON "hearthstone_data"."field_commits" ("client_mutation_id");--> statement-breakpoint
CREATE INDEX "field_commits_sequence_idx" ON "hearthstone_data"."field_commits" ("sequence");--> statement-breakpoint
CREATE INDEX "field_commits_entity_field_sequence_idx" ON "hearthstone_data"."field_commits" ("entity_type","entity_key","field_path","sequence");--> statement-breakpoint
CREATE INDEX "field_commits_review_projection_created_at_idx" ON "hearthstone_data"."field_commits" ("review_status","projection_status","created_at");--> statement-breakpoint
CREATE INDEX "field_conflicts_side_stage_status_created_at_idx" ON "hearthstone_data"."field_conflicts" ("processing_side","processing_stage","status","created_at");--> statement-breakpoint
CREATE INDEX "field_conflicts_entity_field_status_idx" ON "hearthstone_data"."field_conflicts" ("entity_type","entity_key","field_path","status");--> statement-breakpoint
CREATE UNIQUE INDEX "field_winners_active_entity_field_uq" ON "hearthstone_data"."field_winners" ("entity_type","entity_key","field_path") WHERE "status" = 'active';--> statement-breakpoint
CREATE INDEX "field_winners_entity_field_idx" ON "hearthstone_data"."field_winners" ("entity_type","entity_key","field_path");--> statement-breakpoint
CREATE INDEX "field_winners_entity_status_idx" ON "hearthstone_data"."field_winners" ("entity_type","entity_key","status");--> statement-breakpoint
CREATE INDEX "field_winners_field_status_idx" ON "hearthstone_data"."field_winners" ("entity_type","field_path","status");--> statement-breakpoint
CREATE INDEX "field_winners_updated_at_idx" ON "hearthstone_data"."field_winners" ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_slug_uq" ON "hearthstone"."tags" ("slug");--> statement-breakpoint
CREATE INDEX "tags_status_idx" ON "hearthstone"."tags" ("status");--> statement-breakpoint
CREATE INDEX "tags_target_path_idx" ON "hearthstone"."tags" ("project_target_type","project_target_path");--> statement-breakpoint
CREATE INDEX "tags_first_seen_idx" ON "hearthstone"."tags" ("first_seen_source_tag");--> statement-breakpoint
CREATE INDEX "tags_last_seen_idx" ON "hearthstone"."tags" ("last_seen_source_tag");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_entity_snapshots_card_hash_uq" ON "hearthstone_data"."raw_entity_snapshots" ("card_id","snapshot_hash");--> statement-breakpoint
CREATE INDEX "raw_entity_snapshots_card_id_idx" ON "hearthstone_data"."raw_entity_snapshots" ("card_id");--> statement-breakpoint
CREATE INDEX "raw_entity_snapshots_dbf_id_idx" ON "hearthstone_data"."raw_entity_snapshots" ("dbf_id");--> statement-breakpoint
CREATE INDEX "raw_entity_snapshots_snapshot_hash_idx" ON "hearthstone_data"."raw_entity_snapshots" ("snapshot_hash");--> statement-breakpoint
CREATE INDEX "raw_entity_snapshots_source_tags_gin_idx" ON "hearthstone_data"."raw_entity_snapshots" USING gin ("source_tags");--> statement-breakpoint
CREATE INDEX "raw_entity_snapshots_projection_state_idx" ON "hearthstone_data"."raw_entity_snapshots" ("projection_state") WHERE "projection_state" != 'projected';--> statement-breakpoint
CREATE INDEX "raw_entity_snapshot_tags_snapshot_idx" ON "hearthstone_data"."raw_entity_snapshot_tags" ("snapshot_id");--> statement-breakpoint
CREATE INDEX "raw_entity_snapshot_tags_enum_idx" ON "hearthstone_data"."raw_entity_snapshot_tags" ("enum_id");--> statement-breakpoint
CREATE INDEX "raw_entity_snapshot_tags_enum_int_idx" ON "hearthstone_data"."raw_entity_snapshot_tags" ("enum_id","int_value") WHERE "int_value" is not null;--> statement-breakpoint
CREATE INDEX "raw_entity_snapshot_tags_enum_bool_idx" ON "hearthstone_data"."raw_entity_snapshot_tags" ("enum_id","bool_value") WHERE "bool_value" is not null;--> statement-breakpoint
CREATE INDEX "raw_entity_snapshot_tags_enum_string_idx" ON "hearthstone_data"."raw_entity_snapshot_tags" ("enum_id","string_value") WHERE "string_value" is not null;--> statement-breakpoint
CREATE INDEX "raw_entity_snapshot_tags_enum_enum_idx" ON "hearthstone_data"."raw_entity_snapshot_tags" ("enum_id","enum_value") WHERE "enum_value" is not null;--> statement-breakpoint
CREATE INDEX "raw_entity_snapshot_tags_enum_card_idx" ON "hearthstone_data"."raw_entity_snapshot_tags" ("enum_id","card_value") WHERE "card_value" is not null;--> statement-breakpoint
CREATE INDEX "source_versions_status_idx" ON "hearthstone_data"."source_versions" ("status");--> statement-breakpoint
CREATE INDEX "source_versions_projection_status_idx" ON "hearthstone_data"."source_versions" ("projection_status");--> statement-breakpoint
CREATE INDEX "source_versions_build_idx" ON "hearthstone_data"."source_versions" ("build");--> statement-breakpoint
CREATE INDEX "source_versions_source_hash_idx" ON "hearthstone_data"."source_versions" ("source_hash");--> statement-breakpoint
CREATE INDEX "push_batches_stream_consumer_idx" ON "hearthstone_data"."push_batches" ("stream","consumer");--> statement-breakpoint
CREATE INDEX "push_batches_created_at_idx" ON "hearthstone_data"."push_batches" ("created_at");--> statement-breakpoint
CREATE INDEX "hsdata_import_jobs_source_tag_status_idx" ON "hearthstone_data"."hsdata_import_jobs" ("source_tag","status");--> statement-breakpoint
CREATE INDEX "hsdata_import_jobs_status_created_at_idx" ON "hearthstone_data"."hsdata_import_jobs" ("status","created_at");--> statement-breakpoint
CREATE INDEX "hsdata_import_jobs_source_hash_idx" ON "hearthstone_data"."hsdata_import_jobs" ("source_hash");--> statement-breakpoint
CREATE INDEX "hsdata_import_jobs_manifest_hash_idx" ON "hearthstone_data"."hsdata_import_jobs" ("manifest_hash");--> statement-breakpoint
CREATE INDEX "hsdata_import_jobs_cleanup_status_idx" ON "hearthstone_data"."hsdata_import_jobs" ("staging_cleanup_status");--> statement-breakpoint
CREATE INDEX "hsdata_import_job_workspace_snapshots_job_id_chunk_index_idx" ON "hearthstone_data"."hsdata_import_job_workspace_snapshots" ("job_id","chunk_index");--> statement-breakpoint
CREATE INDEX "hsdata_import_job_workspace_snapshots_job_id_snapshot_id_idx" ON "hearthstone_data"."hsdata_import_job_workspace_snapshots" ("job_id","snapshot_id");--> statement-breakpoint
CREATE INDEX "hsdata_import_job_workspace_snapshots_job_id_snapshot_hash_idx" ON "hearthstone_data"."hsdata_import_job_workspace_snapshots" ("job_id","snapshot_hash");--> statement-breakpoint
CREATE INDEX "publish_baselines_batch_id_idx" ON "hearthstone_data"."publish_baselines" ("batch_id");--> statement-breakpoint
CREATE INDEX "publish_batches_stream_status_idx" ON "hearthstone_data"."publish_batches" ("publish_target","environment","publish_type","status");--> statement-breakpoint
CREATE INDEX "publish_batches_created_at_idx" ON "hearthstone_data"."publish_batches" ("created_at");--> statement-breakpoint
CREATE INDEX "publish_batches_manifest_hash_idx" ON "hearthstone_data"."publish_batches" ("manifest_hash");--> statement-breakpoint
CREATE INDEX "publish_batch_rows_batch_action_idx" ON "hearthstone_data"."publish_batch_rows" ("batch_id","action");--> statement-breakpoint
CREATE INDEX "publish_batch_rows_batch_status_idx" ON "hearthstone_data"."publish_batch_rows" ("batch_id","status");--> statement-breakpoint
CREATE INDEX "publish_batch_rows_batch_table_idx" ON "hearthstone_data"."publish_batch_rows" ("batch_id","table_name");--> statement-breakpoint
CREATE INDEX "publish_row_baselines_stream_idx" ON "hearthstone_data"."publish_row_baselines" ("publish_target","environment","publish_type");--> statement-breakpoint
CREATE INDEX "publish_row_baselines_source_batch_idx" ON "hearthstone_data"."publish_row_baselines" ("source_batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_definitions_slug_uq" ON "magic"."document_definitions" ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "document_nodes_version_id_node_id_uq" ON "magic"."document_nodes" ("version_id","node_id");--> statement-breakpoint
CREATE INDEX "document_nodes_document_id_entity_id_idx" ON "magic"."document_nodes" ("document_id","entity_id");--> statement-breakpoint
CREATE INDEX "document_nodes_version_id_path_idx" ON "magic"."document_nodes" ("version_id","path");--> statement-breakpoint
CREATE INDEX "document_nodes_parent_node_id_idx" ON "magic"."document_nodes" ("parent_node_id");--> statement-breakpoint
CREATE INDEX "document_nodes_version_id_source_fingerprint_hash_idx" ON "magic"."document_nodes" ("version_id","source_fingerprint_hash");--> statement-breakpoint
CREATE INDEX "doc_node_changes_doc_from_to_idx" ON "magic"."document_node_changes" ("document_id","from_version_id","to_version_id");--> statement-breakpoint
CREATE INDEX "doc_node_changes_doc_entity_idx" ON "magic"."document_node_changes" ("document_id","entity_id");--> statement-breakpoint
CREATE INDEX "doc_node_changes_doc_type_idx" ON "magic"."document_node_changes" ("document_id","type");--> statement-breakpoint
CREATE INDEX "doc_node_changes_doc_conf_idx" ON "magic"."document_node_changes" ("document_id","confidence_score");--> statement-breakpoint
CREATE INDEX "document_node_change_relations_change_id_side_sort_order_idx" ON "magic"."document_node_change_relations" ("change_id","side","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "document_node_contents_document_node_id_locale_uq" ON "magic"."document_node_contents" ("document_node_id","locale");--> statement-breakpoint
CREATE INDEX "document_node_contents_content_hash_idx" ON "magic"."document_node_contents" ("content_hash");--> statement-breakpoint
CREATE INDEX "document_node_contents_source_content_hash_idx" ON "magic"."document_node_contents" ("source_content_hash");--> statement-breakpoint
CREATE INDEX "document_node_contents_status_idx" ON "magic"."document_node_contents" ("status");--> statement-breakpoint
CREATE INDEX "doc_node_entities_doc_current_ver_idx" ON "magic"."document_node_entities" ("document_id","current_version_id");--> statement-breakpoint
CREATE INDEX "doc_node_entities_doc_origin_node_idx" ON "magic"."document_node_entities" ("document_id","origin_version_id","origin_node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_document_id_version_tag_uq" ON "magic"."document_versions" ("document_id","version_tag");--> statement-breakpoint
CREATE INDEX "document_versions_document_id_lifecycle_status_idx" ON "magic"."document_versions" ("document_id","lifecycle_status");--> statement-breakpoint
CREATE INDEX "import_apply_logs_field_change_id_action_idx" ON "magic_data"."import_apply_logs" ("field_change_id","action");--> statement-breakpoint
CREATE INDEX "import_apply_logs_change_set_id_applied_at_idx" ON "magic_data"."import_apply_logs" ("change_set_id","applied_at");--> statement-breakpoint
CREATE INDEX "import_change_sets_import_run_id_target_entity_type_idx" ON "magic_data"."import_change_sets" ("import_run_id","target_entity_type");--> statement-breakpoint
CREATE INDEX "import_change_sets_decision_status_decision_mode_idx" ON "magic_data"."import_change_sets" ("decision_status","decision_mode");--> statement-breakpoint
CREATE INDEX "import_change_sets_source_id_rule_set_id_idx" ON "magic_data"."import_change_sets" ("source_id","rule_set_id");--> statement-breakpoint
CREATE UNIQUE INDEX "import_field_changes_change_set_id_field_path_uq" ON "magic_data"."import_field_changes" ("change_set_id","field_path");--> statement-breakpoint
CREATE INDEX "import_field_changes_decision_status_decision_mode_idx" ON "magic_data"."import_field_changes" ("decision_status","decision_mode");--> statement-breakpoint
CREATE INDEX "import_field_changes_batch_key_idx" ON "magic_data"."import_field_changes" ("batch_key");--> statement-breakpoint
CREATE INDEX "import_field_changes_applied_at_idx" ON "magic_data"."import_field_changes" ("applied_at");--> statement-breakpoint
CREATE UNIQUE INDEX "import_field_rules_scope_path_reason_uq" ON "magic_data"."import_field_rules" ("rule_set_id","source_id","field_path","reason_code");--> statement-breakpoint
CREATE INDEX "import_field_rules_source_entity_idx" ON "magic_data"."import_field_rules" ("source_id","entity_type");--> statement-breakpoint
CREATE INDEX "import_field_rules_rule_set_mode_idx" ON "magic_data"."import_field_rules" ("rule_set_id","decision_mode");--> statement-breakpoint
CREATE INDEX "import_field_rules_group_risk_idx" ON "magic_data"."import_field_rules" ("field_group","risk_level");--> statement-breakpoint
CREATE UNIQUE INDEX "import_policy_snapshots_version_uq" ON "magic_data"."import_policy_snapshots" ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "import_policy_snapshots_content_hash_uq" ON "magic_data"."import_policy_snapshots" ("content_hash");--> statement-breakpoint
CREATE INDEX "import_policy_snapshots_rule_set_id_published_at_idx" ON "magic_data"."import_policy_snapshots" ("rule_set_id","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "import_raw_records_import_run_id_source_record_key_uq" ON "magic_data"."import_raw_records" ("import_run_id","source_record_key");--> statement-breakpoint
CREATE INDEX "import_raw_records_import_run_id_idx" ON "magic_data"."import_raw_records" ("import_run_id");--> statement-breakpoint
CREATE INDEX "import_raw_records_source_id_target_entity_type_idx" ON "magic_data"."import_raw_records" ("source_id","target_entity_type");--> statement-breakpoint
CREATE INDEX "import_raw_records_payload_hash_idx" ON "magic_data"."import_raw_records" ("payload_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "import_rule_sets_version_uq" ON "magic_data"."import_rule_sets" ("version");--> statement-breakpoint
CREATE INDEX "import_rule_sets_status_published_at_idx" ON "magic_data"."import_rule_sets" ("status","published_at");--> statement-breakpoint
CREATE INDEX "import_runs_source_id_status_started_at_idx" ON "magic_data"."import_runs" ("source_id","status","started_at");--> statement-breakpoint
CREATE INDEX "import_runs_rule_set_id_status_idx" ON "magic_data"."import_runs" ("rule_set_id","status");--> statement-breakpoint
CREATE INDEX "import_sources_status_idx" ON "magic_data"."import_sources" ("status");--> statement-breakpoint
CREATE INDEX "import_sources_trust_level_status_idx" ON "magic_data"."import_sources" ("trust_level","status");--> statement-breakpoint
CREATE INDEX "document_version_imports_import_status_idx" ON "magic_data"."document_version_imports" ("import_status");--> statement-breakpoint
CREATE INDEX "document_version_imports_import_run_id_idx" ON "magic_data"."document_version_imports" ("import_run_id");--> statement-breakpoint
ALTER TABLE "task_runs" ADD CONSTRAINT "task_runs_retry_of_task_run_id_fkey" FOREIGN KEY ("retry_of_task_run_id") REFERENCES "task_runs"("id");--> statement-breakpoint
ALTER TABLE "task_stages" ADD CONSTRAINT "task_stages_task_run_id_task_runs_id_fkey" FOREIGN KEY ("task_run_id") REFERENCES "task_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."raw_entity_snapshot_tags" ADD CONSTRAINT "raw_entity_snapshot_tags_hEzNrbrC1iAX_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "hearthstone_data"."raw_entity_snapshots"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."raw_entity_snapshot_tags" ADD CONSTRAINT "raw_entity_snapshot_tags_enum_id_tags_enum_id_fkey" FOREIGN KEY ("enum_id") REFERENCES "hearthstone"."tags"("enum_id");--> statement-breakpoint
ALTER TABLE "hearthstone_data"."hsdata_import_job_workspace_snapshots" ADD CONSTRAINT "hsdata_import_job_workspace_snapshots_jmvJqKhHgjfy_fkey" FOREIGN KEY ("job_id") REFERENCES "hearthstone_data"."hsdata_import_jobs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_baselines" ADD CONSTRAINT "publish_baselines_batch_id_publish_batches_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "hearthstone_data"."publish_batches"("id");--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batch_rows" ADD CONSTRAINT "publish_batch_rows_batch_id_publish_batches_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "hearthstone_data"."publish_batches"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_row_baselines" ADD CONSTRAINT "publish_row_baselines_source_batch_id_publish_batches_id_fkey" FOREIGN KEY ("source_batch_id") REFERENCES "hearthstone_data"."publish_batches"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_nodes" ADD CONSTRAINT "document_nodes_version_id_document_versions_id_fkey" FOREIGN KEY ("version_id") REFERENCES "magic"."document_versions"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_nodes" ADD CONSTRAINT "document_nodes_document_id_document_definitions_id_fkey" FOREIGN KEY ("document_id") REFERENCES "magic"."document_definitions"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_nodes" ADD CONSTRAINT "document_nodes_parent_node_id_document_nodes_id_fkey" FOREIGN KEY ("parent_node_id") REFERENCES "magic"."document_nodes"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_nodes" ADD CONSTRAINT "document_nodes_entity_id_document_node_entities_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "magic"."document_node_entities"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_node_changes" ADD CONSTRAINT "document_node_changes_document_id_document_definitions_id_fkey" FOREIGN KEY ("document_id") REFERENCES "magic"."document_definitions"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_node_changes" ADD CONSTRAINT "document_node_changes_from_version_id_document_versions_id_fkey" FOREIGN KEY ("from_version_id") REFERENCES "magic"."document_versions"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_node_changes" ADD CONSTRAINT "document_node_changes_to_version_id_document_versions_id_fkey" FOREIGN KEY ("to_version_id") REFERENCES "magic"."document_versions"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_node_changes" ADD CONSTRAINT "document_node_changes_entity_id_document_node_entities_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "magic"."document_node_entities"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_node_changes" ADD CONSTRAINT "document_node_changes_from_node_ref_id_document_nodes_id_fkey" FOREIGN KEY ("from_node_ref_id") REFERENCES "magic"."document_nodes"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_node_changes" ADD CONSTRAINT "document_node_changes_to_node_ref_id_document_nodes_id_fkey" FOREIGN KEY ("to_node_ref_id") REFERENCES "magic"."document_nodes"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_node_change_relations" ADD CONSTRAINT "document_node_change_relations_yM7gonFIxcTB_fkey" FOREIGN KEY ("change_id") REFERENCES "magic"."document_node_changes"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_node_change_relations" ADD CONSTRAINT "document_node_change_relations_ync0YhFTWBzc_fkey" FOREIGN KEY ("entity_id") REFERENCES "magic"."document_node_entities"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_node_change_relations" ADD CONSTRAINT "document_node_change_relations_CF04jYRUyDfk_fkey" FOREIGN KEY ("node_ref_id") REFERENCES "magic"."document_nodes"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_node_contents" ADD CONSTRAINT "document_node_contents_document_node_id_document_nodes_id_fkey" FOREIGN KEY ("document_node_id") REFERENCES "magic"."document_nodes"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_node_entities" ADD CONSTRAINT "document_node_entities_document_id_document_definitions_id_fkey" FOREIGN KEY ("document_id") REFERENCES "magic"."document_definitions"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_node_entities" ADD CONSTRAINT "document_node_entities_hBuEOyjPka2k_fkey" FOREIGN KEY ("origin_version_id") REFERENCES "magic"."document_versions"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_node_entities" ADD CONSTRAINT "document_node_entities_vkvJqXKA5fAT_fkey" FOREIGN KEY ("current_node_ref_id") REFERENCES "magic"."document_nodes"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_node_entities" ADD CONSTRAINT "document_node_entities_lddrvWyOi6xZ_fkey" FOREIGN KEY ("current_version_id") REFERENCES "magic"."document_versions"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_versions" ADD CONSTRAINT "document_versions_document_id_document_definitions_id_fkey" FOREIGN KEY ("document_id") REFERENCES "magic"."document_definitions"("id");--> statement-breakpoint
ALTER TABLE "magic"."rule_change" ADD CONSTRAINT "rule_change_from_source_id_rule_source_id_fkey" FOREIGN KEY ("from_source_id") REFERENCES "magic"."rule_source"("id");--> statement-breakpoint
ALTER TABLE "magic"."rule_change" ADD CONSTRAINT "rule_change_to_source_id_rule_source_id_fkey" FOREIGN KEY ("to_source_id") REFERENCES "magic"."rule_source"("id");--> statement-breakpoint
ALTER TABLE "magic"."rule_change" ADD CONSTRAINT "rule_change_entity_id_rule_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "magic"."rule_entity"("id");--> statement-breakpoint
ALTER TABLE "magic"."rule_change" ADD CONSTRAINT "rule_change_from_node_id_rule_node_id_fkey" FOREIGN KEY ("from_node_id") REFERENCES "magic"."rule_node"("id");--> statement-breakpoint
ALTER TABLE "magic"."rule_change" ADD CONSTRAINT "rule_change_to_node_id_rule_node_id_fkey" FOREIGN KEY ("to_node_id") REFERENCES "magic"."rule_node"("id");--> statement-breakpoint
ALTER TABLE "magic"."rule_node" ADD CONSTRAINT "rule_node_source_id_rule_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "magic"."rule_source"("id");--> statement-breakpoint
ALTER TABLE "magic"."rule_node" ADD CONSTRAINT "rule_node_content_hash_rule_content_hash_fkey" FOREIGN KEY ("content_hash") REFERENCES "magic"."rule_content"("hash");--> statement-breakpoint
ALTER TABLE "magic"."rule_node" ADD CONSTRAINT "rule_node_entity_id_rule_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "magic"."rule_entity"("id");--> statement-breakpoint
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
ALTER TABLE "magic_data"."import_runs" ADD CONSTRAINT "import_runs_source_id_import_sources_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "magic_data"."import_sources"("source_id");--> statement-breakpoint
ALTER TABLE "magic_data"."import_runs" ADD CONSTRAINT "import_runs_rule_set_id_import_rule_sets_id_fkey" FOREIGN KEY ("rule_set_id") REFERENCES "magic_data"."import_rule_sets"("id");--> statement-breakpoint
ALTER TABLE "magic_data"."document_version_imports" ADD CONSTRAINT "document_version_imports_version_id_document_versions_id_fkey" FOREIGN KEY ("version_id") REFERENCES "magic"."document_versions"("id");--> statement-breakpoint
CREATE VIEW "hearthstone"."announcement_view" AS (select "hearthstone"."announcements"."id", "hearthstone"."announcements"."source", "hearthstone"."announcements"."date", "hearthstone"."announcements"."name", "hearthstone"."announcements"."version", "hearthstone"."announcements"."last_version", coalesce("hearthstone"."announcement_items"."effective_date", "hearthstone"."announcements"."effective_date") as "effective_date", "hearthstone"."announcements"."link", "hearthstone"."announcement_items"."type", "hearthstone"."announcement_items"."format", "hearthstone"."announcement_items"."card_id", "hearthstone"."announcement_items"."set_id", "hearthstone"."announcement_items"."rule_id", "hearthstone"."announcement_items"."status", "hearthstone"."announcement_items"."score", "hearthstone"."announcement_items"."adjustment", "hearthstone"."announcement_items"."related_cards" from "hearthstone"."announcements" left join "hearthstone"."announcement_items" on "hearthstone"."announcements"."id" = "hearthstone"."announcement_items"."announcement_id");--> statement-breakpoint
CREATE VIEW "hearthstone"."active_cards" AS (select "card_id", "legalities", "created_at", "updated_at", "deleted_at" from "hearthstone"."cards" where "hearthstone"."cards"."deleted_at" is null);--> statement-breakpoint
CREATE VIEW "hearthstone"."active_entity_relations" AS (select "source_id", "source_revision_hash", "relation", "target_id", "version", "is_latest", "created_at", "updated_at", "deleted_at" from "hearthstone"."entity_relations" where "hearthstone"."entity_relations"."deleted_at" is null);--> statement-breakpoint
CREATE VIEW "hearthstone"."card_entity_view" AS (select "hearthstone"."entities"."card_id", "hearthstone"."entities"."version" & "hearthstone"."entity_localizations"."version" as "version", "hearthstone"."entity_localizations"."lang", "hearthstone"."entities"."revision_hash", "hearthstone"."entity_localizations"."localization_hash", "hearthstone"."entity_localizations"."render_hash", "hearthstone"."entities"."dbf_id", "hearthstone"."entities"."legacy_payload", "hearthstone"."entities"."set", "hearthstone"."entities"."class", "hearthstone"."entities"."type", "hearthstone"."entities"."cost", "hearthstone"."entities"."attack", "hearthstone"."entities"."health", "hearthstone"."entities"."durability", "hearthstone"."entities"."armor", "hearthstone"."entities"."rune", "hearthstone"."entities"."race", "hearthstone"."entities"."spell_school", "hearthstone"."entities"."quest_type", "hearthstone"."entities"."quest_progress", "hearthstone"."entities"."quest_part", "hearthstone"."entities"."hero_power", "hearthstone"."entities"."tech_level", "hearthstone"."entities"."in_bobs_tavern", "hearthstone"."entities"."triple_card", "hearthstone"."entities"."race_bucket", "hearthstone"."entities"."armor_bucket", "hearthstone"."entities"."buddy", "hearthstone"."entities"."banned_race", "hearthstone"."entities"."mercenary_role", "hearthstone"."entities"."mercenary_faction", "hearthstone"."entities"."colddown", "hearthstone"."entities"."collectible", "hearthstone"."entities"."elite", "hearthstone"."entities"."rarity", "hearthstone"."entities"."artist", "hearthstone"."entities"."override_watermark", "hearthstone"."entities"."faction", "hearthstone"."entities"."mechanics", "hearthstone"."entities"."referenced_tags", "hearthstone"."entities"."text_builder_type", "hearthstone"."entities"."change_type", "hearthstone"."entities"."is_latest", "hearthstone"."entity_localizations"."name", "hearthstone"."entity_localizations"."text", "hearthstone"."entity_localizations"."rich_text", "hearthstone"."entity_localizations"."display_text", "hearthstone"."entity_localizations"."target_text", "hearthstone"."entity_localizations"."text_in_play", "hearthstone"."entity_localizations"."how_to_earn", "hearthstone"."entity_localizations"."how_to_earn_golden", "hearthstone"."entity_localizations"."flavor_text", "hearthstone"."entity_localizations"."loc_change_type", "hearthstone"."cards"."legalities" from "hearthstone"."entities" inner join "hearthstone"."entity_localizations" on ("hearthstone"."entities"."card_id" = "hearthstone"."entity_localizations"."card_id" and "hearthstone"."entities"."revision_hash" = "hearthstone"."entity_localizations"."revision_hash" and "hearthstone"."entities"."version" && "hearthstone"."entity_localizations"."version") inner join "hearthstone"."cards" on "hearthstone"."entities"."card_id" = "hearthstone"."cards"."card_id" where "hearthstone"."entities"."deleted_at" is null and "hearthstone"."entity_localizations"."deleted_at" is null);--> statement-breakpoint
CREATE VIEW "hearthstone"."active_entities" AS (select "card_id", "version", "revision_hash", "dbf_id", "legacy_payload", "set", "class", "type", "cost", "attack", "health", "durability", "armor", "rune", "race", "spell_school", "quest_type", "quest_progress", "quest_part", "hero_power", "tech_level", "in_bobs_tavern", "triple_card", "race_bucket", "armor_bucket", "buddy", "banned_race", "mercenary_role", "mercenary_faction", "colddown", "collectible", "elite", "rarity", "artist", "override_watermark", "faction", "mechanics", "referenced_tags", "text_builder_type", "change_type", "is_latest", "created_at", "updated_at", "deleted_at" from "hearthstone"."entities" where "hearthstone"."entities"."deleted_at" is null);--> statement-breakpoint
CREATE VIEW "hearthstone"."active_entity_localizations" AS (select "card_id", "version", "lang", "revision_hash", "localization_hash", "render_hash", "render_model", "is_latest", "name", "text", "rich_text", "display_text", "target_text", "text_in_play", "how_to_earn", "how_to_earn_golden", "flavor_text", "loc_change_type", "created_at", "updated_at", "deleted_at" from "hearthstone"."entity_localizations" where "hearthstone"."entity_localizations"."deleted_at" is null);--> statement-breakpoint
CREATE VIEW "hearthstone"."entity_view" AS (select "hearthstone"."entities"."card_id", "hearthstone"."entities"."version" & "hearthstone"."entity_localizations"."version" as "version", "hearthstone"."entity_localizations"."lang", "hearthstone"."entities"."dbf_id", "hearthstone"."entities"."legacy_payload", "hearthstone"."entities"."set", "hearthstone"."entities"."class", "hearthstone"."entities"."type", "hearthstone"."entities"."cost", "hearthstone"."entities"."attack", "hearthstone"."entities"."health", "hearthstone"."entities"."durability", "hearthstone"."entities"."armor", "hearthstone"."entities"."rune", "hearthstone"."entities"."race", "hearthstone"."entities"."spell_school", "hearthstone"."entities"."quest_type", "hearthstone"."entities"."quest_progress", "hearthstone"."entities"."quest_part", "hearthstone"."entities"."hero_power", "hearthstone"."entities"."tech_level", "hearthstone"."entities"."in_bobs_tavern", "hearthstone"."entities"."triple_card", "hearthstone"."entities"."race_bucket", "hearthstone"."entities"."armor_bucket", "hearthstone"."entities"."buddy", "hearthstone"."entities"."banned_race", "hearthstone"."entities"."mercenary_role", "hearthstone"."entities"."mercenary_faction", "hearthstone"."entities"."colddown", "hearthstone"."entities"."collectible", "hearthstone"."entities"."elite", "hearthstone"."entities"."rarity", "hearthstone"."entities"."artist", "hearthstone"."entities"."override_watermark", "hearthstone"."entities"."faction", "hearthstone"."entities"."mechanics", "hearthstone"."entities"."referenced_tags", "hearthstone"."entities"."text_builder_type", "hearthstone"."entities"."change_type", "hearthstone"."entities"."is_latest", "hearthstone"."entities"."deleted_at", "hearthstone"."entity_localizations"."name", "hearthstone"."entity_localizations"."text", "hearthstone"."entity_localizations"."rich_text", "hearthstone"."entity_localizations"."display_text", "hearthstone"."entity_localizations"."target_text", "hearthstone"."entity_localizations"."text_in_play", "hearthstone"."entity_localizations"."how_to_earn", "hearthstone"."entity_localizations"."how_to_earn_golden", "hearthstone"."entity_localizations"."flavor_text", "hearthstone"."entity_localizations"."loc_change_type" from "hearthstone"."entities" inner join "hearthstone"."entity_localizations" on ("hearthstone"."entities"."card_id" = "hearthstone"."entity_localizations"."card_id" and "hearthstone"."entities"."revision_hash" = "hearthstone"."entity_localizations"."revision_hash" and "hearthstone"."entities"."version" && "hearthstone"."entity_localizations"."version") where "hearthstone"."entities"."deleted_at" is null and "hearthstone"."entity_localizations"."deleted_at" is null);--> statement-breakpoint
CREATE VIEW "hearthstone"."set_view" AS (select "set_id", "dbf_id", "slug", "raw_name", "type", "release_date", "card_count", "group" from "hearthstone"."sets");--> statement-breakpoint
CREATE VIEW "hearthstone_data"."tag_value_view" AS (select "hearthstone_data"."raw_entity_snapshot_tags"."snapshot_id", "hearthstone_data"."raw_entity_snapshots"."card_id", "hearthstone_data"."raw_entity_snapshots"."dbf_id", "hearthstone_data"."raw_entity_snapshots"."source_tags", "hearthstone_data"."raw_entity_snapshot_tags"."enum_id", "hearthstone"."tags"."slug" as "tag_slug", "hearthstone"."tags"."name" as "tag_name", "hearthstone_data"."raw_entity_snapshot_tags"."value_kind", "hearthstone_data"."raw_entity_snapshot_tags"."bool_value", "hearthstone_data"."raw_entity_snapshot_tags"."int_value", "hearthstone_data"."raw_entity_snapshot_tags"."string_value", "hearthstone_data"."raw_entity_snapshot_tags"."enum_value", "hearthstone_data"."raw_entity_snapshot_tags"."loc_string_value", "hearthstone_data"."raw_entity_snapshot_tags"."card_value", "hearthstone_data"."raw_entity_snapshot_tags"."json_value" from "hearthstone_data"."raw_entity_snapshot_tags" inner join "hearthstone_data"."raw_entity_snapshots" on "hearthstone_data"."raw_entity_snapshot_tags"."snapshot_id" = "hearthstone_data"."raw_entity_snapshots"."id" inner join "hearthstone"."tags" on "hearthstone_data"."raw_entity_snapshot_tags"."enum_id" = "hearthstone"."tags"."enum_id");--> statement-breakpoint
CREATE VIEW "magic"."announcement_view" AS (select "magic"."announcements"."id", "magic"."announcements"."source", "magic"."announcements"."date", "magic"."announcements"."name", coalesce("magic"."announcement_items"."effective_date", "magic"."announcements"."effective_date") as "effective_date", "magic"."announcements"."effective_date_tabletop", "magic"."announcements"."effective_date_online", "magic"."announcements"."effective_date_arena", "magic"."announcements"."next_date", "magic"."announcements"."link", "magic"."announcement_items"."type", "magic"."announcement_items"."format", "magic"."announcement_items"."card_id", "magic"."announcement_items"."set_id", "magic"."announcement_items"."rule_id", "magic"."announcement_items"."status", "magic"."announcement_items"."score", "magic"."announcement_items"."adjustment", "magic"."announcement_items"."related_cards" from "magic"."announcements" left join "magic"."announcement_items" on "magic"."announcements"."id" = "magic"."announcement_items"."announcement_id");--> statement-breakpoint
CREATE VIEW "magic"."card_view" AS (select "magic"."cards"."card_id", "magic"."card_localizations"."locale", "magic"."card_parts"."part_index", "magic"."cards"."part_count", "magic"."cards"."name", "magic"."cards"."typeline", "magic"."cards"."text", "magic"."cards"."mana_value", "magic"."cards"."color_identity", "magic"."cards"."keywords", "magic"."cards"."counters", "magic"."cards"."producible_mana", "magic"."cards"."content_warning", "magic"."cards"."category", "magic"."cards"."tags", "magic"."cards"."legalities", "magic"."cards"."scryfall_oracle_id", "magic"."card_localizations"."loc_name", "magic"."card_localizations"."loc_typeline", "magic"."card_localizations"."loc_text", "magic"."card_localizations"."last_date", "magic"."card_parts"."part_name", "magic"."card_parts"."part_typeline", "magic"."card_parts"."part_text", "magic"."card_parts"."cost", "magic"."card_parts"."part_mana_value", "magic"."card_parts"."color", "magic"."card_parts"."color_indicator", "magic"."card_parts"."type_super", "magic"."card_parts"."type_main", "magic"."card_parts"."type_sub", "magic"."card_parts"."power", "magic"."card_parts"."toughness", "magic"."card_parts"."loyalty", "magic"."card_parts"."defense", "magic"."card_parts"."hand_modifier", "magic"."card_parts"."life_modifier", "magic"."card_part_localizations"."part_loc_name", "magic"."card_part_localizations"."part_loc_typeline", "magic"."card_part_localizations"."part_loc_text" from "magic"."cards" inner join "magic"."card_localizations" on "magic"."card_localizations"."card_id" = "magic"."cards"."card_id" inner join "magic"."card_parts" on "magic"."card_parts"."card_id" = "magic"."cards"."card_id" inner join "magic"."card_part_localizations" on ("magic"."card_part_localizations"."card_id" = "magic"."card_parts"."card_id" and "magic"."card_part_localizations"."locale" = "magic"."card_localizations"."locale" and "magic"."card_part_localizations"."part_index" = "magic"."card_parts"."part_index"));--> statement-breakpoint
CREATE VIEW "magic"."card_editor_view" AS (select "magic"."cards"."card_id", "magic"."card_localizations"."locale", "magic"."card_parts"."part_index", "magic"."prints"."lang", "magic"."prints"."set", "magic"."prints"."number", "magic"."cards"."part_count", "magic"."cards"."name", "magic"."cards"."typeline", "magic"."cards"."text", "magic"."cards"."mana_value", "magic"."cards"."color_identity", "magic"."cards"."keywords", "magic"."cards"."counters", "magic"."cards"."producible_mana", "magic"."cards"."content_warning", "magic"."cards"."category", "magic"."cards"."tags", "magic"."cards"."legalities", "magic"."cards"."scryfall_oracle_id", "magic"."cards"."card_locked_paths", "magic"."cards"."card_updations", "magic"."card_localizations"."loc_name", "magic"."card_localizations"."loc_typeline", "magic"."card_localizations"."loc_text", "magic"."card_localizations"."last_date", "magic"."card_localizations"."card_localization_locked_paths", "magic"."card_localizations"."card_localization_updations", "magic"."card_parts"."part_name", "magic"."card_parts"."part_typeline", "magic"."card_parts"."part_text", "magic"."card_parts"."cost", "magic"."card_parts"."part_mana_value", "magic"."card_parts"."color", "magic"."card_parts"."color_indicator", "magic"."card_parts"."type_super", "magic"."card_parts"."type_main", "magic"."card_parts"."type_sub", "magic"."card_parts"."power", "magic"."card_parts"."toughness", "magic"."card_parts"."loyalty", "magic"."card_parts"."defense", "magic"."card_parts"."hand_modifier", "magic"."card_parts"."life_modifier", "magic"."card_parts"."card_part_locked_paths", "magic"."card_parts"."card_part_updations", "magic"."card_part_localizations"."part_loc_name", "magic"."card_part_localizations"."part_loc_typeline", "magic"."card_part_localizations"."part_loc_text", "magic"."card_part_localizations"."card_part_localization_locked_paths", "magic"."card_part_localizations"."card_part_localization_updations", "magic"."prints"."print_name", "magic"."prints"."print_typeline", "magic"."prints"."print_text", "magic"."prints"."layout", "magic"."prints"."frame", "magic"."prints"."frame_effects", "magic"."prints"."border_color", "magic"."prints"."card_back", "magic"."prints"."security_stamp", "magic"."prints"."promo_types", "magic"."prints"."rarity", "magic"."prints"."release_date", "magic"."prints"."is_digital", "magic"."prints"."is_promo", "magic"."prints"."is_reprint", "magic"."prints"."finishes", "magic"."prints"."has_high_res_image", "magic"."prints"."image_status", "magic"."prints"."full_image_type", "magic"."prints"."in_booster", "magic"."prints"."games", "magic"."prints"."preview_date", "magic"."prints"."preview_source", "magic"."prints"."preview_uri", "magic"."prints"."print_tags", "magic"."prints"."print_scryfall_oracle_id", "magic"."prints"."scryfall_card_id", "magic"."prints"."scryfall_face", "magic"."prints"."scryfall_image_uris", "magic"."prints"."arena_id", "magic"."prints"."mtgo_id", "magic"."prints"."mtgo_foil_id", "magic"."prints"."multiverse_id", "magic"."prints"."tcg_player_id", "magic"."prints"."card_market_id", "magic"."prints"."print_locked_paths", "magic"."prints"."print_updations", "magic"."print_parts"."print_part_name", "magic"."print_parts"."print_part_typeline", "magic"."print_parts"."print_part_text", "magic"."print_parts"."attraction_lights", "magic"."print_parts"."flavor_name", "magic"."print_parts"."flavor_text", "magic"."print_parts"."artist", "magic"."print_parts"."watermark", "magic"."print_parts"."scryfall_illus_id", "magic"."print_parts"."print_part_locked_paths", "magic"."print_parts"."print_part_updations", true as "in_database", jsonb_build_object() as "original" from "magic"."cards" inner join "magic"."card_localizations" on "magic"."card_localizations"."card_id" = "magic"."cards"."card_id" inner join "magic"."card_parts" on "magic"."card_parts"."card_id" = "magic"."cards"."card_id" inner join "magic"."card_part_localizations" on ("magic"."card_part_localizations"."card_id" = "magic"."card_parts"."card_id" and "magic"."card_part_localizations"."locale" = "magic"."card_localizations"."locale" and "magic"."card_part_localizations"."part_index" = "magic"."card_parts"."part_index") inner join "magic"."prints" on ("magic"."cards"."card_id" = "magic"."prints"."card_id" and "magic"."prints"."lang" = (
                CASE
                    WHEN EXISTS (SELECT 1 FROM "magic"."prints" WHERE card_id = "magic"."cards"."card_id" AND lang = "magic"."card_localizations"."locale")
                    THEN "magic"."card_localizations"."locale"
                    ELSE 'en'
                END
            )) inner join "magic"."print_parts" on ("magic"."cards"."card_id" = "magic"."print_parts"."card_id" and "magic"."prints"."set" = "magic"."print_parts"."set" and "magic"."prints"."number" = "magic"."print_parts"."number" and "magic"."prints"."lang" = "magic"."print_parts"."lang" and "magic"."card_parts"."part_index" = "magic"."print_parts"."part_index"));--> statement-breakpoint
CREATE VIEW "magic"."card_print_view" AS (select "magic"."cards"."card_id", "magic"."card_localizations"."locale", "magic"."card_parts"."part_index", "magic"."prints"."lang", "magic"."prints"."set", "magic"."prints"."number", "magic"."cards"."part_count", "magic"."cards"."name", "magic"."cards"."typeline", "magic"."cards"."text", "magic"."cards"."mana_value", "magic"."cards"."color_identity", "magic"."cards"."keywords", "magic"."cards"."counters", "magic"."cards"."producible_mana", "magic"."cards"."content_warning", "magic"."cards"."category", "magic"."cards"."tags", "magic"."cards"."legalities", "magic"."cards"."scryfall_oracle_id", "magic"."card_localizations"."loc_name", "magic"."card_localizations"."loc_typeline", "magic"."card_localizations"."loc_text", "magic"."card_localizations"."last_date", "magic"."card_parts"."part_name", "magic"."card_parts"."part_typeline", "magic"."card_parts"."part_text", "magic"."card_parts"."cost", "magic"."card_parts"."part_mana_value", "magic"."card_parts"."color", "magic"."card_parts"."color_indicator", "magic"."card_parts"."type_super", "magic"."card_parts"."type_main", "magic"."card_parts"."type_sub", "magic"."card_parts"."power", "magic"."card_parts"."toughness", "magic"."card_parts"."loyalty", "magic"."card_parts"."defense", "magic"."card_parts"."hand_modifier", "magic"."card_parts"."life_modifier", "magic"."card_part_localizations"."part_loc_name", "magic"."card_part_localizations"."part_loc_typeline", "magic"."card_part_localizations"."part_loc_text", "magic"."prints"."print_name", "magic"."prints"."print_typeline", "magic"."prints"."print_text", "magic"."prints"."layout", "magic"."prints"."frame", "magic"."prints"."frame_effects", "magic"."prints"."border_color", "magic"."prints"."card_back", "magic"."prints"."security_stamp", "magic"."prints"."promo_types", "magic"."prints"."rarity", "magic"."prints"."release_date", "magic"."prints"."is_digital", "magic"."prints"."is_promo", "magic"."prints"."is_reprint", "magic"."prints"."finishes", "magic"."prints"."has_high_res_image", "magic"."prints"."image_status", "magic"."prints"."full_image_type", "magic"."prints"."in_booster", "magic"."prints"."games", "magic"."prints"."preview_date", "magic"."prints"."preview_source", "magic"."prints"."preview_uri", "magic"."prints"."print_tags", "magic"."prints"."print_scryfall_oracle_id", "magic"."prints"."scryfall_card_id", "magic"."prints"."scryfall_face", "magic"."prints"."scryfall_image_uris", "magic"."prints"."arena_id", "magic"."prints"."mtgo_id", "magic"."prints"."mtgo_foil_id", "magic"."prints"."multiverse_id", "magic"."prints"."tcg_player_id", "magic"."prints"."card_market_id", "magic"."print_parts"."print_part_name", "magic"."print_parts"."print_part_typeline", "magic"."print_parts"."print_part_text", "magic"."print_parts"."attraction_lights", "magic"."print_parts"."flavor_name", "magic"."print_parts"."flavor_text", "magic"."print_parts"."artist", "magic"."print_parts"."watermark", "magic"."print_parts"."scryfall_illus_id" from "magic"."cards" inner join "magic"."card_localizations" on "magic"."card_localizations"."card_id" = "magic"."cards"."card_id" inner join "magic"."card_parts" on "magic"."card_parts"."card_id" = "magic"."cards"."card_id" inner join "magic"."card_part_localizations" on ("magic"."card_part_localizations"."card_id" = "magic"."card_parts"."card_id" and "magic"."card_part_localizations"."locale" = "magic"."card_localizations"."locale" and "magic"."card_part_localizations"."part_index" = "magic"."card_parts"."part_index") inner join "magic"."prints" on ("magic"."cards"."card_id" = "magic"."prints"."card_id" and "magic"."prints"."lang" = (
                CASE
                    WHEN EXISTS (SELECT 1 FROM "magic"."prints" WHERE card_id = "magic"."cards"."card_id" AND lang = "magic"."card_localizations"."locale")
                    THEN "magic"."card_localizations"."locale"
                    ELSE 'en'
                END
            )) inner join "magic"."print_parts" on ("magic"."cards"."card_id" = "magic"."print_parts"."card_id" and "magic"."prints"."set" = "magic"."print_parts"."set" and "magic"."prints"."number" = "magic"."print_parts"."number" and "magic"."prints"."lang" = "magic"."print_parts"."lang" and "magic"."card_parts"."part_index" = "magic"."print_parts"."part_index"));--> statement-breakpoint
CREATE VIEW "magic"."print_view" AS (select "magic"."prints"."card_id", "magic"."prints"."set", "magic"."prints"."number", "magic"."prints"."lang", "magic"."print_parts"."part_index", "magic"."prints"."print_name", "magic"."prints"."print_typeline", "magic"."prints"."print_text", "magic"."prints"."layout", "magic"."prints"."frame", "magic"."prints"."frame_effects", "magic"."prints"."border_color", "magic"."prints"."card_back", "magic"."prints"."security_stamp", "magic"."prints"."promo_types", "magic"."prints"."rarity", "magic"."prints"."release_date", "magic"."prints"."is_digital", "magic"."prints"."is_promo", "magic"."prints"."is_reprint", "magic"."prints"."finishes", "magic"."prints"."has_high_res_image", "magic"."prints"."image_status", "magic"."prints"."full_image_type", "magic"."prints"."in_booster", "magic"."prints"."games", "magic"."prints"."preview_date", "magic"."prints"."preview_source", "magic"."prints"."preview_uri", "magic"."prints"."print_tags", "magic"."prints"."print_scryfall_oracle_id", "magic"."prints"."scryfall_card_id", "magic"."prints"."scryfall_face", "magic"."prints"."scryfall_image_uris", "magic"."prints"."arena_id", "magic"."prints"."mtgo_id", "magic"."prints"."mtgo_foil_id", "magic"."prints"."multiverse_id", "magic"."prints"."tcg_player_id", "magic"."prints"."card_market_id", "magic"."print_parts"."print_part_name", "magic"."print_parts"."print_part_typeline", "magic"."print_parts"."print_part_text", "magic"."print_parts"."attraction_lights", "magic"."print_parts"."flavor_name", "magic"."print_parts"."flavor_text", "magic"."print_parts"."artist", "magic"."print_parts"."watermark", "magic"."print_parts"."scryfall_illus_id" from "magic"."prints" inner join "magic"."print_parts" on ("magic"."prints"."card_id" = "magic"."print_parts"."card_id" and "magic"."prints"."set" = "magic"."print_parts"."set" and "magic"."prints"."number" = "magic"."print_parts"."number" and "magic"."prints"."lang" = "magic"."print_parts"."lang"));--> statement-breakpoint
CREATE VIEW "magic"."rule_view" AS (select "magic"."rules"."date", "magic"."rules"."lang", "magic"."rule_items"."item_id", "magic"."rule_items"."index", "magic"."rule_items"."depth", "magic"."rule_items"."text", "magic"."rule_items"."rich_text" from "magic"."rules" left join "magic"."rule_items" on ("magic"."rules"."date" = "magic"."rule_items"."date" and "magic"."rules"."lang" = "magic"."rule_items"."lang"));