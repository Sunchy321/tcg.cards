CREATE TABLE "hearthstone"."entity_relations" (
	"source_id" text,
	"source_revision_hash" text,
	"relation" text,
	"target_id" text,
	"version" integer[] NOT NULL,
	"is_latest" boolean DEFAULT false NOT NULL,
	CONSTRAINT "entity_relations_pkey" PRIMARY KEY("source_id","source_revision_hash","relation","target_id")
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
	"value_kind" text DEFAULT 'json' NOT NULL,
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
	"version" integer[] NOT NULL,
	"entity_xml_version" integer NOT NULL,
	"snapshot_hash" text NOT NULL,
	"extra_payload" jsonb DEFAULT '{}' NOT NULL,
	"is_latest" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
	"card_ref_card_id" text,
	"card_ref_dbf_id" integer,
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
	"status" text DEFAULT 'pending' NOT NULL,
	"imported_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP VIEW "hearthstone"."card_entity_view";--> statement-breakpoint
DROP VIEW "hearthstone"."entity_view";--> statement-breakpoint
ALTER TABLE "hearthstone"."entities" ADD COLUMN "revision_hash" text;--> statement-breakpoint
ALTER TABLE "hearthstone"."entities" ADD COLUMN "legacy_payload" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone"."entity_localizations" ADD COLUMN "revision_hash" text;--> statement-breakpoint
ALTER TABLE "hearthstone"."entity_localizations" ADD COLUMN "localization_hash" text;--> statement-breakpoint
ALTER TABLE "hearthstone"."entity_localizations" ADD COLUMN "render_hash" text;--> statement-breakpoint
ALTER TABLE "hearthstone"."entity_localizations" ADD COLUMN "render_model" jsonb;--> statement-breakpoint
ALTER TABLE "hearthstone"."entity_localizations" ADD COLUMN "is_latest" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone"."entities" DROP COLUMN "slug";--> statement-breakpoint
ALTER TABLE "hearthstone"."entities" DROP COLUMN "heroic_hero_power";--> statement-breakpoint
ALTER TABLE "hearthstone"."entities" DROP COLUMN "coin";--> statement-breakpoint
ALTER TABLE "hearthstone"."entities" DROP COLUMN "entourages";--> statement-breakpoint
ALTER TABLE "hearthstone"."entities" DROP COLUMN "deck_order";--> statement-breakpoint
ALTER TABLE "hearthstone"."entities" DROP COLUMN "deck_size";--> statement-breakpoint
ALTER TABLE "hearthstone"."entities" DROP COLUMN "localization_notes";--> statement-breakpoint
ALTER TABLE "hearthstone"."entities" DROP CONSTRAINT "entities_pkey";--> statement-breakpoint
ALTER TABLE "hearthstone"."entities" ADD PRIMARY KEY ("card_id","revision_hash");--> statement-breakpoint
ALTER TABLE "hearthstone"."entity_localizations" DROP CONSTRAINT "entity_localizations_pkey";--> statement-breakpoint
ALTER TABLE "hearthstone"."entity_localizations" ADD PRIMARY KEY ("card_id","lang","revision_hash","localization_hash");--> statement-breakpoint
ALTER TABLE "hearthstone"."entities" ALTER COLUMN "class" SET DATA TYPE text[] USING "class"::text[];--> statement-breakpoint
ALTER TABLE "hearthstone"."entities" ALTER COLUMN "type" SET DATA TYPE text USING "type"::text;--> statement-breakpoint
ALTER TABLE "hearthstone"."entities" ALTER COLUMN "rune" SET DATA TYPE text[] USING "rune"::text[];--> statement-breakpoint
ALTER TABLE "hearthstone"."entities" ALTER COLUMN "race" SET DATA TYPE text[] USING "race"::text[];--> statement-breakpoint
ALTER TABLE "hearthstone"."entities" ALTER COLUMN "spell_school" SET DATA TYPE text USING "spell_school"::text;--> statement-breakpoint
ALTER TABLE "hearthstone"."entities" ALTER COLUMN "quest_type" SET DATA TYPE text USING "quest_type"::text;--> statement-breakpoint
ALTER TABLE "hearthstone"."entities" ALTER COLUMN "race_bucket" SET DATA TYPE text USING "race_bucket"::text;--> statement-breakpoint
ALTER TABLE "hearthstone"."entities" ALTER COLUMN "mercenary_role" SET DATA TYPE text USING "mercenary_role"::text;--> statement-breakpoint
ALTER TABLE "hearthstone"."entities" ALTER COLUMN "mercenary_faction" SET DATA TYPE text USING "mercenary_faction"::text;--> statement-breakpoint
ALTER TABLE "hearthstone"."entities" ALTER COLUMN "rarity" SET DATA TYPE text USING "rarity"::text;--> statement-breakpoint
ALTER TABLE "hearthstone"."entities" ALTER COLUMN "faction" SET DATA TYPE text USING "faction"::text;--> statement-breakpoint
ALTER TABLE "hearthstone"."entities" ALTER COLUMN "mechanics" SET DATA TYPE jsonb USING "mechanics"::jsonb;--> statement-breakpoint
ALTER TABLE "hearthstone"."entities" ALTER COLUMN "mechanics" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "hearthstone"."entities" ALTER COLUMN "referenced_tags" SET DATA TYPE jsonb USING COALESCE((SELECT jsonb_object_agg(item, true) FROM unnest("referenced_tags") AS item), '{}'::jsonb);--> statement-breakpoint
ALTER TABLE "hearthstone"."entities" ALTER COLUMN "referenced_tags" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "hearthstone"."entities" ALTER COLUMN "text_builder_type" SET DATA TYPE text USING "text_builder_type"::text;--> statement-breakpoint
CREATE INDEX "entity_relations_source_idx" ON "hearthstone"."entity_relations" ("source_id");--> statement-breakpoint
CREATE INDEX "entity_relations_target_idx" ON "hearthstone"."entity_relations" ("target_id");--> statement-breakpoint
CREATE INDEX "entity_relations_source_relation_idx" ON "hearthstone"."entity_relations" ("source_id","relation");--> statement-breakpoint
CREATE INDEX "entity_relations_target_relation_idx" ON "hearthstone"."entity_relations" ("target_id","relation");--> statement-breakpoint
CREATE INDEX "entity_relations_latest_idx" ON "hearthstone"."entity_relations" ("is_latest");--> statement-breakpoint
CREATE INDEX "entity_localizations_render_hash_idx" ON "hearthstone"."entity_localizations" ("render_hash") WHERE "render_hash" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "tags_slug_uq" ON "hearthstone"."tags" ("slug");--> statement-breakpoint
CREATE INDEX "tags_status_idx" ON "hearthstone"."tags" ("status");--> statement-breakpoint
CREATE INDEX "tags_target_path_idx" ON "hearthstone"."tags" ("project_target_type","project_target_path");--> statement-breakpoint
CREATE INDEX "tags_first_seen_idx" ON "hearthstone"."tags" ("first_seen_source_tag");--> statement-breakpoint
CREATE INDEX "tags_last_seen_idx" ON "hearthstone"."tags" ("last_seen_source_tag");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_entity_snapshots_card_hash_uq" ON "hearthstone_data"."raw_entity_snapshots" ("card_id","snapshot_hash");--> statement-breakpoint
CREATE INDEX "raw_entity_snapshots_card_id_idx" ON "hearthstone_data"."raw_entity_snapshots" ("card_id");--> statement-breakpoint
CREATE INDEX "raw_entity_snapshots_dbf_id_idx" ON "hearthstone_data"."raw_entity_snapshots" ("dbf_id");--> statement-breakpoint
CREATE INDEX "raw_entity_snapshots_snapshot_hash_idx" ON "hearthstone_data"."raw_entity_snapshots" ("snapshot_hash");--> statement-breakpoint
CREATE INDEX "raw_entity_snapshots_latest_idx" ON "hearthstone_data"."raw_entity_snapshots" ("is_latest");--> statement-breakpoint
CREATE INDEX "raw_entity_snapshot_tags_snapshot_idx" ON "hearthstone_data"."raw_entity_snapshot_tags" ("snapshot_id");--> statement-breakpoint
CREATE INDEX "raw_entity_snapshot_tags_enum_idx" ON "hearthstone_data"."raw_entity_snapshot_tags" ("enum_id");--> statement-breakpoint
CREATE INDEX "raw_entity_snapshot_tags_enum_int_idx" ON "hearthstone_data"."raw_entity_snapshot_tags" ("enum_id","int_value") WHERE "int_value" is not null;--> statement-breakpoint
CREATE INDEX "raw_entity_snapshot_tags_enum_bool_idx" ON "hearthstone_data"."raw_entity_snapshot_tags" ("enum_id","bool_value") WHERE "bool_value" is not null;--> statement-breakpoint
CREATE INDEX "raw_entity_snapshot_tags_enum_string_idx" ON "hearthstone_data"."raw_entity_snapshot_tags" ("enum_id","string_value") WHERE "string_value" is not null;--> statement-breakpoint
CREATE INDEX "raw_entity_snapshot_tags_enum_enum_idx" ON "hearthstone_data"."raw_entity_snapshot_tags" ("enum_id","enum_value") WHERE "enum_value" is not null;--> statement-breakpoint
CREATE INDEX "raw_entity_snapshot_tags_enum_card_idx" ON "hearthstone_data"."raw_entity_snapshot_tags" ("enum_id","card_ref_card_id") WHERE "card_ref_card_id" is not null;--> statement-breakpoint
CREATE INDEX "source_versions_status_idx" ON "hearthstone_data"."source_versions" ("status");--> statement-breakpoint
CREATE INDEX "source_versions_build_idx" ON "hearthstone_data"."source_versions" ("build");--> statement-breakpoint
CREATE INDEX "source_versions_source_hash_idx" ON "hearthstone_data"."source_versions" ("source_hash");--> statement-breakpoint
ALTER TABLE "hearthstone_data"."raw_entity_snapshot_tags" ADD CONSTRAINT "raw_entity_snapshot_tags_hEzNrbrC1iAX_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "hearthstone_data"."raw_entity_snapshots"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."raw_entity_snapshot_tags" ADD CONSTRAINT "raw_entity_snapshot_tags_enum_id_tags_enum_id_fkey" FOREIGN KEY ("enum_id") REFERENCES "hearthstone"."tags"("enum_id");--> statement-breakpoint
CREATE VIEW "hearthstone_data"."tag_value_view" AS (select "hearthstone_data"."raw_entity_snapshot_tags"."snapshot_id", "hearthstone_data"."raw_entity_snapshots"."card_id", "hearthstone_data"."raw_entity_snapshots"."dbf_id", "hearthstone_data"."raw_entity_snapshots"."version", "hearthstone_data"."raw_entity_snapshot_tags"."enum_id", "hearthstone"."tags"."slug" as "tag_slug", "hearthstone"."tags"."name" as "tag_name", "hearthstone_data"."raw_entity_snapshot_tags"."value_kind", "hearthstone_data"."raw_entity_snapshot_tags"."bool_value", "hearthstone_data"."raw_entity_snapshot_tags"."int_value", "hearthstone_data"."raw_entity_snapshot_tags"."string_value", "hearthstone_data"."raw_entity_snapshot_tags"."enum_value", "hearthstone_data"."raw_entity_snapshot_tags"."loc_string_value", "hearthstone_data"."raw_entity_snapshot_tags"."card_ref_card_id", "hearthstone_data"."raw_entity_snapshot_tags"."card_ref_dbf_id", "hearthstone_data"."raw_entity_snapshot_tags"."json_value" from "hearthstone_data"."raw_entity_snapshot_tags" inner join "hearthstone_data"."raw_entity_snapshots" on "hearthstone_data"."raw_entity_snapshot_tags"."snapshot_id" = "hearthstone_data"."raw_entity_snapshots"."id" inner join "hearthstone"."tags" on "hearthstone_data"."raw_entity_snapshot_tags"."enum_id" = "hearthstone"."tags"."enum_id");--> statement-breakpoint
CREATE VIEW "hearthstone"."card_entity_view" AS (select "hearthstone"."entities"."card_id", "hearthstone"."entities"."version" & "hearthstone"."entity_localizations"."version" as "version", "hearthstone"."entity_localizations"."lang", "hearthstone"."entities"."revision_hash", "hearthstone"."entity_localizations"."localization_hash", "hearthstone"."entity_localizations"."render_hash", "hearthstone"."entities"."dbf_id", "hearthstone"."entities"."legacy_payload", "hearthstone"."entities"."set", "hearthstone"."entities"."class", "hearthstone"."entities"."type", "hearthstone"."entities"."cost", "hearthstone"."entities"."attack", "hearthstone"."entities"."health", "hearthstone"."entities"."durability", "hearthstone"."entities"."armor", "hearthstone"."entities"."rune", "hearthstone"."entities"."race", "hearthstone"."entities"."spell_school", "hearthstone"."entities"."quest_type", "hearthstone"."entities"."quest_progress", "hearthstone"."entities"."quest_part", "hearthstone"."entities"."hero_power", "hearthstone"."entities"."tech_level", "hearthstone"."entities"."in_bobs_tavern", "hearthstone"."entities"."triple_card", "hearthstone"."entities"."race_bucket", "hearthstone"."entities"."armor_bucket", "hearthstone"."entities"."buddy", "hearthstone"."entities"."banned_race", "hearthstone"."entities"."mercenary_role", "hearthstone"."entities"."mercenary_faction", "hearthstone"."entities"."colddown", "hearthstone"."entities"."collectible", "hearthstone"."entities"."elite", "hearthstone"."entities"."rarity", "hearthstone"."entities"."artist", "hearthstone"."entities"."override_watermark", "hearthstone"."entities"."faction", "hearthstone"."entities"."mechanics", "hearthstone"."entities"."referenced_tags", "hearthstone"."entities"."text_builder_type", "hearthstone"."entities"."change_type", "hearthstone"."entities"."is_latest", "hearthstone"."entity_localizations"."name", "hearthstone"."entity_localizations"."text", "hearthstone"."entity_localizations"."rich_text", "hearthstone"."entity_localizations"."display_text", "hearthstone"."entity_localizations"."target_text", "hearthstone"."entity_localizations"."text_in_play", "hearthstone"."entity_localizations"."how_to_earn", "hearthstone"."entity_localizations"."how_to_earn_golden", "hearthstone"."entity_localizations"."flavor_text", "hearthstone"."entity_localizations"."loc_change_type", "hearthstone"."cards"."legalities" from "hearthstone"."entities" inner join "hearthstone"."entity_localizations" on (("hearthstone"."entities"."card_id" = "hearthstone"."entity_localizations"."card_id") and ("hearthstone"."entities"."revision_hash" = "hearthstone"."entity_localizations"."revision_hash") and ("hearthstone"."entities"."version" && "hearthstone"."entity_localizations"."version")) inner join "hearthstone"."cards" on "hearthstone"."entities"."card_id" = "hearthstone"."cards"."card_id");--> statement-breakpoint
CREATE VIEW "hearthstone"."entity_view" AS (select "hearthstone"."entities"."card_id", "hearthstone"."entities"."version" & "hearthstone"."entity_localizations"."version" as "version", "hearthstone"."entity_localizations"."lang", "hearthstone"."entities"."dbf_id", "hearthstone"."entities"."legacy_payload", "hearthstone"."entities"."set", "hearthstone"."entities"."class", "hearthstone"."entities"."type", "hearthstone"."entities"."cost", "hearthstone"."entities"."attack", "hearthstone"."entities"."health", "hearthstone"."entities"."durability", "hearthstone"."entities"."armor", "hearthstone"."entities"."rune", "hearthstone"."entities"."race", "hearthstone"."entities"."spell_school", "hearthstone"."entities"."quest_type", "hearthstone"."entities"."quest_progress", "hearthstone"."entities"."quest_part", "hearthstone"."entities"."hero_power", "hearthstone"."entities"."tech_level", "hearthstone"."entities"."in_bobs_tavern", "hearthstone"."entities"."triple_card", "hearthstone"."entities"."race_bucket", "hearthstone"."entities"."armor_bucket", "hearthstone"."entities"."buddy", "hearthstone"."entities"."banned_race", "hearthstone"."entities"."mercenary_role", "hearthstone"."entities"."mercenary_faction", "hearthstone"."entities"."colddown", "hearthstone"."entities"."collectible", "hearthstone"."entities"."elite", "hearthstone"."entities"."rarity", "hearthstone"."entities"."artist", "hearthstone"."entities"."override_watermark", "hearthstone"."entities"."faction", "hearthstone"."entities"."mechanics", "hearthstone"."entities"."referenced_tags", "hearthstone"."entities"."text_builder_type", "hearthstone"."entities"."change_type", "hearthstone"."entities"."is_latest", "hearthstone"."entity_localizations"."name", "hearthstone"."entity_localizations"."text", "hearthstone"."entity_localizations"."rich_text", "hearthstone"."entity_localizations"."display_text", "hearthstone"."entity_localizations"."target_text", "hearthstone"."entity_localizations"."text_in_play", "hearthstone"."entity_localizations"."how_to_earn", "hearthstone"."entity_localizations"."how_to_earn_golden", "hearthstone"."entity_localizations"."flavor_text", "hearthstone"."entity_localizations"."loc_change_type" from "hearthstone"."entities" inner join "hearthstone"."entity_localizations" on (("hearthstone"."entities"."card_id" = "hearthstone"."entity_localizations"."card_id") and ("hearthstone"."entities"."revision_hash" = "hearthstone"."entity_localizations"."revision_hash") and ("hearthstone"."entities"."version" && "hearthstone"."entity_localizations"."version")));--> statement-breakpoint
DROP TYPE "hearthstone"."class";--> statement-breakpoint
DROP TYPE "hearthstone"."faction";--> statement-breakpoint
DROP TYPE "hearthstone"."mercenary_faction";--> statement-breakpoint
DROP TYPE "hearthstone"."mercenary_role";--> statement-breakpoint
DROP TYPE "hearthstone"."quest_type";--> statement-breakpoint
DROP TYPE "hearthstone"."race";--> statement-breakpoint
DROP TYPE "hearthstone"."rarity";--> statement-breakpoint
DROP TYPE "hearthstone"."rune";--> statement-breakpoint
DROP TYPE "hearthstone"."spell_school";--> statement-breakpoint
DROP TYPE "hearthstone"."card_text_builder_type";--> statement-breakpoint
DROP TYPE "hearthstone"."type";
