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
CREATE TYPE "hearthstone"."game_change_type" AS ENUM('card_change', 'set_change', 'rule_change', 'format_death', 'card_adjustment');--> statement-breakpoint
CREATE TYPE "hearthstone"."legality" AS ENUM('banned_in_card_pool', 'banned_in_deck', 'banned', 'derived', 'legal', 'minor', 'unavailable', 'score');--> statement-breakpoint
CREATE TYPE "hearthstone"."status" AS ENUM('banned_in_card_pool', 'banned_in_deck', 'banned', 'derived', 'legal', 'minor', 'unavailable', 'score', 'buff', 'nerf', 'adjust');--> statement-breakpoint
CREATE TYPE "hearthstone"."change_type" AS ENUM('unknown', 'major', 'minor', 'non-functional', 'wording', 'bugged');--> statement-breakpoint
CREATE TYPE "hearthstone"."locale" AS ENUM('en', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'mx', 'pl', 'pt', 'ru', 'th', 'zhs', 'zht');--> statement-breakpoint
CREATE TYPE "hearthstone_data"."knowledge_job_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "hearthstone_data"."knowledge_source_status" AS ENUM('pending', 'ready', 'stale', 'failed');--> statement-breakpoint
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
CREATE TYPE "magic_data"."knowledge_job_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "magic_data"."knowledge_source_status" AS ENUM('pending', 'ready', 'stale', 'failed');--> statement-breakpoint
CREATE TYPE "magic_app"."document_change_review_status" AS ENUM('pending', 'confirmed', 'rejected', 'override');--> statement-breakpoint
CREATE TYPE "magic_app"."document_node_change_review_state_cache" AS ENUM('unreviewed', 'pending', 'confirmed', 'rejected', 'overridden');--> statement-breakpoint
CREATE TYPE "magic_app"."deck_visibility" AS ENUM('public', 'unlisted', 'private');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apikeys" (
	"id" text PRIMARY KEY,
	"config_id" text DEFAULT 'default' NOT NULL,
	"name" text,
	"start" text,
	"reference_id" text NOT NULL,
	"prefix" text,
	"key" text NOT NULL,
	"refill_interval" integer,
	"refill_amount" integer,
	"last_refill_at" timestamp,
	"enabled" boolean DEFAULT true,
	"rate_limit_enabled" boolean DEFAULT true,
	"rate_limit_time_window" integer DEFAULT 1000,
	"rate_limit_max" integer DEFAULT 100,
	"request_count" integer DEFAULT 0,
	"remaining" integer,
	"last_request" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"permissions" text,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"username" text UNIQUE,
	"display_username" text,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publish_ledgers" (
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
	"changed_row_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "publish_ledgers_pkey" PRIMARY KEY("publish_target","environment","publish_type"),
	CONSTRAINT "publish_ledgers_build_range_chk" CHECK ("build_min" <= "build_max"),
	CONSTRAINT "publish_ledgers_build_min_positive_chk" CHECK ("build_min" > 0),
	CONSTRAINT "publish_ledgers_generation_order_positive_chk" CHECK ("generation_order" > 0),
	CONSTRAINT "publish_ledgers_total_row_count_nonnegative_chk" CHECK ("total_row_count" >= 0),
	CONSTRAINT "publish_ledgers_changed_row_count_nonnegative_chk" CHECK ("changed_row_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "publish_stream_registrations" (
	"publish_target" text,
	"environment" text,
	"publish_type" text DEFAULT 'card_data',
	"target_fingerprint" text NOT NULL,
	"normal_publish_enabled" boolean DEFAULT false NOT NULL,
	"lease_holder_id" text,
	"lease_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "publish_stream_registrations_pkey" PRIMARY KEY("publish_target","environment","publish_type")
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
CREATE TABLE "hearthstone_data"."knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"chunk_type" text DEFAULT 'text' NOT NULL,
	"content" text NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"char_count" integer DEFAULT 0 NOT NULL,
	"citation" text NOT NULL,
	"checksum" text NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."knowledge_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"chunk_id" uuid NOT NULL,
	"provider" text DEFAULT 'cloudflare' NOT NULL,
	"model" text NOT NULL,
	"model_version" text DEFAULT '' NOT NULL,
	"dimensions" integer DEFAULT 1024 NOT NULL,
	"distance" text DEFAULT 'cosine' NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."knowledge_index_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source_id" uuid NOT NULL,
	"job_type" text DEFAULT 'index' NOT NULL,
	"trigger" text NOT NULL,
	"status" "hearthstone_data"."knowledge_job_status" DEFAULT 'pending'::"hearthstone_data"."knowledge_job_status" NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"scheduled_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	"error" text,
	"payload" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."knowledge_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source_type" text NOT NULL,
	"source_key" text NOT NULL,
	"version_key" text DEFAULT '' NOT NULL,
	"locale" text DEFAULT '' NOT NULL,
	"checksum" text NOT NULL,
	"status" "hearthstone_data"."knowledge_source_status" DEFAULT 'pending'::"hearthstone_data"."knowledge_source_status" NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_indexed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."knowledge_source_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_key" text NOT NULL,
	"relation" text DEFAULT 'primary' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "magic_data"."knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"chunk_type" text DEFAULT 'text' NOT NULL,
	"content" text NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"char_count" integer DEFAULT 0 NOT NULL,
	"citation" text NOT NULL,
	"checksum" text NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."knowledge_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"chunk_id" uuid NOT NULL,
	"provider" text DEFAULT 'cloudflare' NOT NULL,
	"model" text NOT NULL,
	"model_version" text DEFAULT '' NOT NULL,
	"dimensions" integer DEFAULT 1024 NOT NULL,
	"distance" text DEFAULT 'cosine' NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."knowledge_index_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source_id" uuid NOT NULL,
	"job_type" text DEFAULT 'index' NOT NULL,
	"trigger" text NOT NULL,
	"status" "magic_data"."knowledge_job_status" DEFAULT 'pending'::"magic_data"."knowledge_job_status" NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"scheduled_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	"error" text,
	"payload" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."knowledge_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source_type" text NOT NULL,
	"source_key" text NOT NULL,
	"version_key" text DEFAULT '' NOT NULL,
	"locale" text DEFAULT '' NOT NULL,
	"checksum" text NOT NULL,
	"status" "magic_data"."knowledge_source_status" DEFAULT 'pending'::"magic_data"."knowledge_source_status" NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_indexed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "magic_data"."knowledge_source_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_key" text NOT NULL,
	"relation" text DEFAULT 'primary' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_app"."document_change_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"change_id" uuid NOT NULL,
	"status" "magic_app"."document_change_review_status" NOT NULL,
	"revision" integer NOT NULL,
	"is_latest" boolean DEFAULT true NOT NULL,
	"reason" text,
	"reviewer_id" text,
	"reviewed_at" timestamp,
	"override_payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_app"."document_change_review_states" (
	"change_id" uuid PRIMARY KEY,
	"review_state" "magic_app"."document_node_change_review_state_cache" DEFAULT 'unreviewed'::"magic_app"."document_node_change_review_state_cache" NOT NULL,
	"reviewed_at" timestamp,
	"latest_review_id" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_app"."document_version_pair_revisions" (
	"id" text PRIMARY KEY,
	"document_id" text NOT NULL,
	"from_version_id" text NOT NULL,
	"to_version_id" text NOT NULL,
	"review_revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_app"."decks" (
	"deck_id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"format" text NOT NULL,
	"cards" jsonb NOT NULL,
	"visibility" "magic_app"."deck_visibility" DEFAULT 'private'::"magic_app"."deck_visibility" NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"favorites" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_app"."deck_favorites" (
	"user_id" text,
	"deck_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deck_favorites_pkey" PRIMARY KEY("user_id","deck_id")
);
--> statement-breakpoint
CREATE TABLE "magic_app"."deck_likes" (
	"user_id" text,
	"deck_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deck_likes_pkey" PRIMARY KEY("user_id","deck_id")
);
--> statement-breakpoint
CREATE INDEX "accounts_userId_idx" ON "accounts" ("user_id");--> statement-breakpoint
CREATE INDEX "apikeys_configId_idx" ON "apikeys" ("config_id");--> statement-breakpoint
CREATE INDEX "apikeys_referenceId_idx" ON "apikeys" ("reference_id");--> statement-breakpoint
CREATE INDEX "apikeys_key_idx" ON "apikeys" ("key");--> statement-breakpoint
CREATE INDEX "sessions_userId_idx" ON "sessions" ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" ("identifier");--> statement-breakpoint
CREATE INDEX "publish_ledgers_environment_idx" ON "publish_ledgers" ("environment");--> statement-breakpoint
CREATE INDEX "publish_ledgers_stream_idx" ON "publish_ledgers" ("publish_target","environment","publish_type");--> statement-breakpoint
CREATE INDEX "publish_ledgers_published_at_idx" ON "publish_ledgers" ("published_at");--> statement-breakpoint
CREATE INDEX "publish_stream_registrations_stream_idx" ON "publish_stream_registrations" ("publish_target","environment","publish_type");--> statement-breakpoint
CREATE INDEX "publish_stream_registrations_publish_enabled_idx" ON "publish_stream_registrations" ("normal_publish_enabled");--> statement-breakpoint
CREATE INDEX "publish_stream_registrations_lease_expires_at_idx" ON "publish_stream_registrations" ("lease_expires_at");--> statement-breakpoint
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
CREATE UNIQUE INDEX "knowledge_chunks_source_id_chunk_index_uq" ON "hearthstone_data"."knowledge_chunks" ("source_id","chunk_index");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_source_id_idx" ON "hearthstone_data"."knowledge_chunks" ("source_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_checksum_idx" ON "hearthstone_data"."knowledge_chunks" ("checksum");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_embeddings_chunk_id_provider_model_model_version_uq" ON "hearthstone_data"."knowledge_embeddings" ("chunk_id","provider","model","model_version");--> statement-breakpoint
CREATE INDEX "knowledge_embeddings_provider_model_dimensions_idx" ON "hearthstone_data"."knowledge_embeddings" ("provider","model","dimensions");--> statement-breakpoint
CREATE INDEX "knowledge_embeddings_embedding_hnsw_idx" ON "hearthstone_data"."knowledge_embeddings" USING hnsw ("embedding" vector_cosine_ops) WITH (m=16, ef_construction=64);--> statement-breakpoint
CREATE INDEX "knowledge_index_jobs_status_scheduled_at_idx" ON "hearthstone_data"."knowledge_index_jobs" ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "knowledge_index_jobs_source_id_status_idx" ON "hearthstone_data"."knowledge_index_jobs" ("source_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_sources_source_type_source_key_version_key_locale_uq" ON "hearthstone_data"."knowledge_sources" ("source_type","source_key","version_key","locale");--> statement-breakpoint
CREATE INDEX "knowledge_sources_status_idx" ON "hearthstone_data"."knowledge_sources" ("status");--> statement-breakpoint
CREATE INDEX "knowledge_sources_source_type_source_key_idx" ON "hearthstone_data"."knowledge_sources" ("source_type","source_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ks_links_source_target_rel_uq" ON "hearthstone_data"."knowledge_source_links" ("source_id","target_type","target_key","relation");--> statement-breakpoint
CREATE INDEX "ks_links_target_type_key_idx" ON "hearthstone_data"."knowledge_source_links" ("target_type","target_key");--> statement-breakpoint
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
CREATE UNIQUE INDEX "knowledge_chunks_source_id_chunk_index_uq" ON "magic_data"."knowledge_chunks" ("source_id","chunk_index");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_source_id_idx" ON "magic_data"."knowledge_chunks" ("source_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_checksum_idx" ON "magic_data"."knowledge_chunks" ("checksum");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_embeddings_chunk_id_provider_model_model_version_uq" ON "magic_data"."knowledge_embeddings" ("chunk_id","provider","model","model_version");--> statement-breakpoint
CREATE INDEX "knowledge_embeddings_provider_model_dimensions_idx" ON "magic_data"."knowledge_embeddings" ("provider","model","dimensions");--> statement-breakpoint
CREATE INDEX "knowledge_embeddings_embedding_hnsw_idx" ON "magic_data"."knowledge_embeddings" USING hnsw ("embedding" vector_cosine_ops) WITH (m=16, ef_construction=64);--> statement-breakpoint
CREATE INDEX "knowledge_index_jobs_status_scheduled_at_idx" ON "magic_data"."knowledge_index_jobs" ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "knowledge_index_jobs_source_id_status_idx" ON "magic_data"."knowledge_index_jobs" ("source_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_sources_source_type_source_key_version_key_locale_uq" ON "magic_data"."knowledge_sources" ("source_type","source_key","version_key","locale");--> statement-breakpoint
CREATE INDEX "knowledge_sources_status_idx" ON "magic_data"."knowledge_sources" ("status");--> statement-breakpoint
CREATE INDEX "knowledge_sources_source_type_source_key_idx" ON "magic_data"."knowledge_sources" ("source_type","source_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ks_links_source_target_rel_uq" ON "magic_data"."knowledge_source_links" ("source_id","target_type","target_key","relation");--> statement-breakpoint
CREATE INDEX "ks_links_target_type_key_idx" ON "magic_data"."knowledge_source_links" ("target_type","target_key");--> statement-breakpoint
CREATE UNIQUE INDEX "document_change_reviews_change_id_latest_uq" ON "magic_app"."document_change_reviews" ("change_id") WHERE "is_latest" = true;--> statement-breakpoint
CREATE INDEX "document_change_reviews_change_id_is_latest_revision_idx" ON "magic_app"."document_change_reviews" ("change_id","is_latest","revision");--> statement-breakpoint
CREATE INDEX "document_change_review_states_review_state_idx" ON "magic_app"."document_change_review_states" ("review_state");--> statement-breakpoint
CREATE UNIQUE INDEX "document_change_review_states_latest_review_id_uq" ON "magic_app"."document_change_review_states" ("latest_review_id") WHERE "latest_review_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "doc_ver_pair_rev_doc_from_to_uq" ON "magic_app"."document_version_pair_revisions" ("document_id","from_version_id","to_version_id");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_source_id_knowledge_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "hearthstone_data"."knowledge_sources"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."knowledge_embeddings" ADD CONSTRAINT "knowledge_embeddings_chunk_id_knowledge_chunks_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "hearthstone_data"."knowledge_chunks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."knowledge_index_jobs" ADD CONSTRAINT "knowledge_index_jobs_source_id_knowledge_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "hearthstone_data"."knowledge_sources"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."knowledge_source_links" ADD CONSTRAINT "knowledge_source_links_source_id_knowledge_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "hearthstone_data"."knowledge_sources"("id") ON DELETE CASCADE;--> statement-breakpoint
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
ALTER TABLE "magic_data"."knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_source_id_knowledge_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "magic_data"."knowledge_sources"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "magic_data"."knowledge_embeddings" ADD CONSTRAINT "knowledge_embeddings_chunk_id_knowledge_chunks_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "magic_data"."knowledge_chunks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "magic_data"."knowledge_index_jobs" ADD CONSTRAINT "knowledge_index_jobs_source_id_knowledge_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "magic_data"."knowledge_sources"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "magic_data"."knowledge_source_links" ADD CONSTRAINT "knowledge_source_links_source_id_knowledge_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "magic_data"."knowledge_sources"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "magic_app"."document_change_reviews" ADD CONSTRAINT "document_change_reviews_change_id_document_node_changes_id_fkey" FOREIGN KEY ("change_id") REFERENCES "magic"."document_node_changes"("id");--> statement-breakpoint
ALTER TABLE "magic_app"."document_change_review_states" ADD CONSTRAINT "document_change_review_states_PY2cjpH9Eey2_fkey" FOREIGN KEY ("change_id") REFERENCES "magic"."document_node_changes"("id");--> statement-breakpoint
ALTER TABLE "magic_app"."document_change_review_states" ADD CONSTRAINT "document_change_review_states_SHLbSmMDq0Ia_fkey" FOREIGN KEY ("latest_review_id") REFERENCES "magic_app"."document_change_reviews"("id");--> statement-breakpoint
ALTER TABLE "magic_app"."document_version_pair_revisions" ADD CONSTRAINT "document_version_pair_revisions_pEvrT1bRRgYd_fkey" FOREIGN KEY ("document_id") REFERENCES "magic"."document_definitions"("id");--> statement-breakpoint
ALTER TABLE "magic_app"."document_version_pair_revisions" ADD CONSTRAINT "document_version_pair_revisions_tEEzYIZzSxMU_fkey" FOREIGN KEY ("from_version_id") REFERENCES "magic"."document_versions"("id");--> statement-breakpoint
ALTER TABLE "magic_app"."document_version_pair_revisions" ADD CONSTRAINT "document_version_pair_revisions_Jo1qS1zjCpEv_fkey" FOREIGN KEY ("to_version_id") REFERENCES "magic"."document_versions"("id");--> statement-breakpoint
ALTER TABLE "magic_app"."decks" ADD CONSTRAINT "decks_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "magic_app"."deck_favorites" ADD CONSTRAINT "deck_favorites_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "magic_app"."deck_favorites" ADD CONSTRAINT "deck_favorites_deck_id_decks_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "magic_app"."decks"("deck_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "magic_app"."deck_likes" ADD CONSTRAINT "deck_likes_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "magic_app"."deck_likes" ADD CONSTRAINT "deck_likes_deck_id_decks_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "magic_app"."decks"("deck_id") ON DELETE CASCADE;--> statement-breakpoint
CREATE VIEW "hearthstone"."announcement_view" AS (select "hearthstone"."announcements"."id", "hearthstone"."announcements"."source", "hearthstone"."announcements"."date", "hearthstone"."announcements"."name", "hearthstone"."announcements"."version", "hearthstone"."announcements"."last_version", coalesce("hearthstone"."announcement_items"."effective_date", "hearthstone"."announcements"."effective_date") as "effective_date", "hearthstone"."announcements"."link", "hearthstone"."announcement_items"."type", "hearthstone"."announcement_items"."format", "hearthstone"."announcement_items"."card_id", "hearthstone"."announcement_items"."set_id", "hearthstone"."announcement_items"."rule_id", "hearthstone"."announcement_items"."status", "hearthstone"."announcement_items"."score", "hearthstone"."announcement_items"."adjustment", "hearthstone"."announcement_items"."related_cards" from "hearthstone"."announcements" left join "hearthstone"."announcement_items" on "hearthstone"."announcements"."id" = "hearthstone"."announcement_items"."announcement_id");--> statement-breakpoint
CREATE VIEW "hearthstone"."active_cards" AS (select "card_id", "legalities", "created_at", "updated_at", "deleted_at" from "hearthstone"."cards" where "hearthstone"."cards"."deleted_at" is null);--> statement-breakpoint
CREATE VIEW "hearthstone"."active_entity_relations" AS (select "source_id", "source_revision_hash", "relation", "target_id", "version", "is_latest", "created_at", "updated_at", "deleted_at" from "hearthstone"."entity_relations" where "hearthstone"."entity_relations"."deleted_at" is null);--> statement-breakpoint
CREATE VIEW "hearthstone"."card_entity_view" AS (select "hearthstone"."entities"."card_id", "hearthstone"."entities"."version" & "hearthstone"."entity_localizations"."version" as "version", "hearthstone"."entity_localizations"."lang", "hearthstone"."entities"."revision_hash", "hearthstone"."entity_localizations"."localization_hash", "hearthstone"."entity_localizations"."render_hash", "hearthstone"."entities"."dbf_id", "hearthstone"."entities"."legacy_payload", "hearthstone"."entities"."set", "hearthstone"."entities"."class", "hearthstone"."entities"."type", "hearthstone"."entities"."cost", "hearthstone"."entities"."attack", "hearthstone"."entities"."health", "hearthstone"."entities"."durability", "hearthstone"."entities"."armor", "hearthstone"."entities"."rune", "hearthstone"."entities"."race", "hearthstone"."entities"."spell_school", "hearthstone"."entities"."quest_type", "hearthstone"."entities"."quest_progress", "hearthstone"."entities"."quest_part", "hearthstone"."entities"."hero_power", "hearthstone"."entities"."tech_level", "hearthstone"."entities"."in_bobs_tavern", "hearthstone"."entities"."triple_card", "hearthstone"."entities"."race_bucket", "hearthstone"."entities"."armor_bucket", "hearthstone"."entities"."buddy", "hearthstone"."entities"."banned_race", "hearthstone"."entities"."mercenary_role", "hearthstone"."entities"."mercenary_faction", "hearthstone"."entities"."colddown", "hearthstone"."entities"."collectible", "hearthstone"."entities"."elite", "hearthstone"."entities"."rarity", "hearthstone"."entities"."artist", "hearthstone"."entities"."override_watermark", "hearthstone"."entities"."faction", "hearthstone"."entities"."mechanics", "hearthstone"."entities"."referenced_tags", "hearthstone"."entities"."text_builder_type", "hearthstone"."entities"."change_type", "hearthstone"."entities"."is_latest", "hearthstone"."entity_localizations"."name", "hearthstone"."entity_localizations"."text", "hearthstone"."entity_localizations"."rich_text", "hearthstone"."entity_localizations"."display_text", "hearthstone"."entity_localizations"."target_text", "hearthstone"."entity_localizations"."text_in_play", "hearthstone"."entity_localizations"."how_to_earn", "hearthstone"."entity_localizations"."how_to_earn_golden", "hearthstone"."entity_localizations"."flavor_text", "hearthstone"."entity_localizations"."loc_change_type", "hearthstone"."cards"."legalities" from "hearthstone"."entities" inner join "hearthstone"."entity_localizations" on ("hearthstone"."entities"."card_id" = "hearthstone"."entity_localizations"."card_id" and "hearthstone"."entities"."revision_hash" = "hearthstone"."entity_localizations"."revision_hash" and "hearthstone"."entities"."version" && "hearthstone"."entity_localizations"."version") inner join "hearthstone"."cards" on "hearthstone"."entities"."card_id" = "hearthstone"."cards"."card_id" where "hearthstone"."entities"."deleted_at" is null and "hearthstone"."entity_localizations"."deleted_at" is null);--> statement-breakpoint
CREATE VIEW "hearthstone"."active_entities" AS (select "card_id", "version", "revision_hash", "dbf_id", "legacy_payload", "set", "class", "type", "cost", "attack", "health", "durability", "armor", "rune", "race", "spell_school", "quest_type", "quest_progress", "quest_part", "hero_power", "tech_level", "in_bobs_tavern", "triple_card", "race_bucket", "armor_bucket", "buddy", "banned_race", "mercenary_role", "mercenary_faction", "colddown", "collectible", "elite", "rarity", "artist", "override_watermark", "faction", "mechanics", "referenced_tags", "text_builder_type", "change_type", "is_latest", "created_at", "updated_at", "deleted_at" from "hearthstone"."entities" where "hearthstone"."entities"."deleted_at" is null);--> statement-breakpoint
CREATE VIEW "hearthstone"."active_entity_localizations" AS (select "card_id", "version", "lang", "revision_hash", "localization_hash", "render_hash", "render_model", "is_latest", "name", "text", "rich_text", "display_text", "target_text", "text_in_play", "how_to_earn", "how_to_earn_golden", "flavor_text", "loc_change_type", "created_at", "updated_at", "deleted_at" from "hearthstone"."entity_localizations" where "hearthstone"."entity_localizations"."deleted_at" is null);--> statement-breakpoint
CREATE VIEW "hearthstone"."entity_view" AS (select "hearthstone"."entities"."card_id", "hearthstone"."entities"."version" & "hearthstone"."entity_localizations"."version" as "version", "hearthstone"."entity_localizations"."lang", "hearthstone"."entities"."dbf_id", "hearthstone"."entities"."legacy_payload", "hearthstone"."entities"."set", "hearthstone"."entities"."class", "hearthstone"."entities"."type", "hearthstone"."entities"."cost", "hearthstone"."entities"."attack", "hearthstone"."entities"."health", "hearthstone"."entities"."durability", "hearthstone"."entities"."armor", "hearthstone"."entities"."rune", "hearthstone"."entities"."race", "hearthstone"."entities"."spell_school", "hearthstone"."entities"."quest_type", "hearthstone"."entities"."quest_progress", "hearthstone"."entities"."quest_part", "hearthstone"."entities"."hero_power", "hearthstone"."entities"."tech_level", "hearthstone"."entities"."in_bobs_tavern", "hearthstone"."entities"."triple_card", "hearthstone"."entities"."race_bucket", "hearthstone"."entities"."armor_bucket", "hearthstone"."entities"."buddy", "hearthstone"."entities"."banned_race", "hearthstone"."entities"."mercenary_role", "hearthstone"."entities"."mercenary_faction", "hearthstone"."entities"."colddown", "hearthstone"."entities"."collectible", "hearthstone"."entities"."elite", "hearthstone"."entities"."rarity", "hearthstone"."entities"."artist", "hearthstone"."entities"."override_watermark", "hearthstone"."entities"."faction", "hearthstone"."entities"."mechanics", "hearthstone"."entities"."referenced_tags", "hearthstone"."entities"."text_builder_type", "hearthstone"."entities"."change_type", "hearthstone"."entities"."is_latest", "hearthstone"."entities"."deleted_at", "hearthstone"."entity_localizations"."name", "hearthstone"."entity_localizations"."text", "hearthstone"."entity_localizations"."rich_text", "hearthstone"."entity_localizations"."display_text", "hearthstone"."entity_localizations"."target_text", "hearthstone"."entity_localizations"."text_in_play", "hearthstone"."entity_localizations"."how_to_earn", "hearthstone"."entity_localizations"."how_to_earn_golden", "hearthstone"."entity_localizations"."flavor_text", "hearthstone"."entity_localizations"."loc_change_type" from "hearthstone"."entities" inner join "hearthstone"."entity_localizations" on ("hearthstone"."entities"."card_id" = "hearthstone"."entity_localizations"."card_id" and "hearthstone"."entities"."revision_hash" = "hearthstone"."entity_localizations"."revision_hash" and "hearthstone"."entities"."version" && "hearthstone"."entity_localizations"."version") where "hearthstone"."entities"."deleted_at" is null and "hearthstone"."entity_localizations"."deleted_at" is null);--> statement-breakpoint
CREATE VIEW "hearthstone"."set_view" AS (select "set_id", "dbf_id", "slug", "raw_name", "type", "release_date", "card_count", "group" from "hearthstone"."sets");--> statement-breakpoint
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