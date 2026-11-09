CREATE TABLE "magic_data"."mtgch_zhs_card" (
	"card_id" text PRIMARY KEY,
	"name" text,
	"face_name" text,
	"flavor_name" text,
	"type_line" text,
	"text" text,
	"flavor_text" text,
	"multiverse_id" integer,
	"source" text,
	"extra" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."mtgch_zhs_flavor" (
	"flavor_id" text PRIMARY KEY,
	"name" text,
	"flavor_name" text,
	"flavor_text" text,
	"set" text,
	"collector_number" text,
	"released_at" text,
	"translated_flavor_name" text,
	"translated_flavor_text" text,
	"flavor_updated_at" text,
	"source" text,
	"stage" integer,
	"extra" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."mtgch_zhs_oracle" (
	"face_oracle_id" text PRIMARY KEY,
	"oracle_id" text NOT NULL,
	"name" text NOT NULL,
	"set" text NOT NULL,
	"collector_number" text NOT NULL,
	"released_at" text NOT NULL,
	"type_line" text NOT NULL,
	"oracle_text" text,
	"translated_name" text,
	"name_stage" integer,
	"name_source" text,
	"translated_type" text,
	"type_stage" integer,
	"translated_text" text,
	"text_stage" integer,
	"text_source" text,
	"former_names" jsonb,
	"extra" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."mtgch_zhs_ruling" (
	"ruling" text PRIMARY KEY,
	"comment" text NOT NULL,
	"translation" text NOT NULL,
	"source" text,
	"stage" integer,
	"last_published_at" text,
	"extra" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."mtgch_zhs_set" (
	"set_id" text PRIMARY KEY,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"source" text,
	"stage" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."mtgch_zhs_type" (
	"type_name" text,
	"type_type" text,
	"translation" text,
	"stage" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "mtgch_zhs_type_pkey" PRIMARY KEY("type_name","type_type")
);
--> statement-breakpoint
CREATE TABLE "magic_data"."mtgjson_sets" (
	"set_id" text PRIMARY KEY,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"base_set_size" integer NOT NULL,
	"total_set_size" integer NOT NULL,
	"release_date" text NOT NULL,
	"is_foil_only" boolean NOT NULL,
	"is_non_foil_only" boolean,
	"is_online_only" boolean NOT NULL,
	"is_paper_only" boolean,
	"is_foreign_only" boolean,
	"is_partial_preview" boolean,
	"keyrune_code" text NOT NULL,
	"block" text,
	"parent_code" text,
	"mtgo_code" text,
	"mcm_id" integer,
	"mcm_id_extras" integer,
	"mcm_name" text,
	"cardsphere_set_id" integer,
	"tcgplayer_group_id" integer,
	"token_set_code" text,
	"languages" text[],
	"translations" jsonb,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."scryfall_cards" (
	"card_id" uuid PRIMARY KEY,
	"oracle_id" uuid NOT NULL,
	"lang" text NOT NULL,
	"arena_id" integer,
	"mtgo_id" integer,
	"mtgo_foil_id" integer,
	"multiverse_ids" integer[] NOT NULL,
	"tcgplayer_id" integer,
	"tcgplayer_etched_id" integer,
	"cardmarket_id" integer,
	"prints_search_uri" text,
	"rulings_uri" text,
	"scryfall_uri" text,
	"uri" text,
	"layout" text NOT NULL,
	"name" text NOT NULL,
	"oracle_text" text,
	"type_line" text NOT NULL,
	"mana_cost" text,
	"cmc" double precision NOT NULL,
	"colors" text[],
	"color_identity" text[] NOT NULL,
	"color_indicator" text[],
	"keywords" text[] NOT NULL,
	"produced_mana" text[],
	"legalities" jsonb NOT NULL,
	"power" text,
	"toughness" text,
	"loyalty" text,
	"defense" text,
	"hand_modifier" text,
	"life_modifier" text,
	"reserved" boolean NOT NULL,
	"oversized" boolean NOT NULL,
	"game_changer" boolean NOT NULL,
	"content_warning" boolean,
	"edhrec_rank" integer,
	"penny_rank" integer,
	"all_parts" jsonb,
	"card_faces" jsonb,
	"resource_id" text,
	"set" text NOT NULL,
	"set_id" uuid NOT NULL,
	"set_name" text NOT NULL,
	"set_type" text NOT NULL,
	"set_uri" text,
	"set_search_uri" text,
	"scryfall_set_uri" text,
	"collector_number" text NOT NULL,
	"rarity" text NOT NULL,
	"released_at" text NOT NULL,
	"frame" text NOT NULL,
	"frame_effects" text[],
	"border_color" text NOT NULL,
	"card_back_id" uuid,
	"artist" text,
	"artist_ids" uuid[],
	"flavor_text" text,
	"flavor_name" text,
	"illustration_id" uuid,
	"image_uris" jsonb,
	"image_status" text NOT NULL,
	"image_updated_at" text,
	"highres_image" boolean NOT NULL,
	"finishes" text[] NOT NULL,
	"games" text[] NOT NULL,
	"booster" boolean NOT NULL,
	"promo" boolean NOT NULL,
	"promo_types" text[],
	"full_art" boolean NOT NULL,
	"textless" boolean NOT NULL,
	"story_spotlight" boolean NOT NULL,
	"reprint" boolean NOT NULL,
	"digital" boolean NOT NULL,
	"variation" boolean NOT NULL,
	"variation_of" uuid,
	"security_stamp" text,
	"watermark" text,
	"attraction_lights" integer[],
	"printed_name" text,
	"printed_text" text,
	"printed_type_line" text,
	"preview" jsonb,
	"prices" jsonb,
	"purchase_uris" jsonb,
	"related_uris" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."scryfall_rulings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"oracle_id" uuid NOT NULL,
	"source" text NOT NULL,
	"published_at" text NOT NULL,
	"comment" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."scryfall_sets" (
	"id" uuid PRIMARY KEY,
	"code" text NOT NULL,
	"mtgo_code" text,
	"arena_code" text,
	"tcgplayer_id" integer,
	"name" text NOT NULL,
	"set_type" text NOT NULL,
	"released_at" text,
	"block_code" text,
	"block" text,
	"parent_set_code" text,
	"card_count" integer NOT NULL,
	"printed_size" integer,
	"digital" boolean NOT NULL,
	"foil_only" boolean NOT NULL,
	"nonfoil_only" boolean NOT NULL,
	"scryfall_uri" text,
	"uri" text,
	"icon_svg_uri" text,
	"search_uri" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."card_slug_annotations" (
	"slug" text PRIMARY KEY,
	"oracle_id" uuid NOT NULL,
	"reason" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."card_unified_localizations" (
	"card_id" text,
	"version" text DEFAULT '',
	"locale" "magic"."locale",
	"unified_name" text NOT NULL,
	"unified_typeline" text NOT NULL,
	"unified_text" text NOT NULL,
	"unified_flavor_text" text,
	"source_set" text,
	"source_number" text,
	"source_release_date" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "card_unified_localizations_pkey" PRIMARY KEY("card_id","version","locale")
);
--> statement-breakpoint
DROP VIEW "magic"."card_view";--> statement-breakpoint
DROP VIEW "magic"."card_editor_view";--> statement-breakpoint
DROP VIEW "magic"."card_print_view";--> statement-breakpoint
DROP VIEW "magic"."print_view";--> statement-breakpoint
DROP TABLE "magic_data"."mtgch";--> statement-breakpoint
DROP TABLE "magic_data"."scryfall";--> statement-breakpoint
ALTER TABLE "magic"."cards" ADD COLUMN "version" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "magic"."cards" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "magic"."cards" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "magic"."cards" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "magic"."card_localizations" ADD COLUMN "version" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "magic"."card_localizations" ADD COLUMN "source" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "magic"."card_localizations" ADD COLUMN "loc_flavor_text" text;--> statement-breakpoint
ALTER TABLE "magic"."card_localizations" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "magic"."card_localizations" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "magic"."card_localizations" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "magic"."card_parts" ADD COLUMN "version" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "magic"."card_parts" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "magic"."card_parts" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "magic"."card_parts" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "magic"."card_part_localizations" ADD COLUMN "version" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "magic"."card_part_localizations" ADD COLUMN "source" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "magic"."card_part_localizations" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "magic"."card_part_localizations" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "magic"."card_part_localizations" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "magic"."prints" ADD COLUMN "version" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "magic"."prints" ADD COLUMN "source" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "magic"."prints" ADD COLUMN "image_updated_at" text;--> statement-breakpoint
ALTER TABLE "magic"."prints" ADD COLUMN "variation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "magic"."prints" ADD COLUMN "variation_of" uuid;--> statement-breakpoint
ALTER TABLE "magic"."prints" ADD COLUMN "artist_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "magic"."prints" ADD COLUMN "illustration_id" uuid;--> statement-breakpoint
ALTER TABLE "magic"."prints" ADD COLUMN "resource_id" text;--> statement-breakpoint
ALTER TABLE "magic"."prints" ADD COLUMN "tcgplayer_etched_id" integer;--> statement-breakpoint
ALTER TABLE "magic"."prints" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "magic"."prints" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "magic"."prints" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "magic"."print_parts" ADD COLUMN "version" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "magic"."print_parts" ADD COLUMN "source" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "magic"."print_parts" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "magic"."print_parts" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "magic"."print_parts" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "magic"."sets" ADD COLUMN "base_set_size" integer;--> statement-breakpoint
ALTER TABLE "magic"."sets" ADD COLUMN "total_set_size" integer;--> statement-breakpoint
ALTER TABLE "magic"."sets" ADD COLUMN "is_online_only" boolean;--> statement-breakpoint
ALTER TABLE "magic"."sets" ADD COLUMN "is_paper_only" boolean;--> statement-breakpoint
ALTER TABLE "magic"."sets" ADD COLUMN "is_foreign_only" boolean;--> statement-breakpoint
ALTER TABLE "magic"."sets" ADD COLUMN "is_partial_preview" boolean;--> statement-breakpoint
ALTER TABLE "magic"."sets" ADD COLUMN "keyrune_code" text;--> statement-breakpoint
ALTER TABLE "magic"."sets" ADD COLUMN "arena_code" text;--> statement-breakpoint
ALTER TABLE "magic"."sets" ADD COLUMN "tcgplayer_group_id" integer;--> statement-breakpoint
ALTER TABLE "magic"."sets" ADD COLUMN "mcm_id" integer;--> statement-breakpoint
ALTER TABLE "magic"."sets" ADD COLUMN "mcm_id_extras" integer;--> statement-breakpoint
ALTER TABLE "magic"."sets" ADD COLUMN "mcm_name" text;--> statement-breakpoint
ALTER TABLE "magic"."sets" ADD COLUMN "cardsphere_set_id" integer;--> statement-breakpoint
ALTER TABLE "magic"."sets" ADD COLUMN "token_set_code" text;--> statement-breakpoint
ALTER TABLE "magic"."cards" DROP COLUMN "card_locked_paths";--> statement-breakpoint
ALTER TABLE "magic"."cards" DROP COLUMN "card_updations";--> statement-breakpoint
ALTER TABLE "magic"."card_localizations" DROP COLUMN "last_date";--> statement-breakpoint
ALTER TABLE "magic"."card_localizations" DROP COLUMN "card_localization_locked_paths";--> statement-breakpoint
ALTER TABLE "magic"."card_localizations" DROP COLUMN "card_localization_updations";--> statement-breakpoint
ALTER TABLE "magic"."card_parts" DROP COLUMN "card_part_locked_paths";--> statement-breakpoint
ALTER TABLE "magic"."card_parts" DROP COLUMN "card_part_updations";--> statement-breakpoint
ALTER TABLE "magic"."card_part_localizations" DROP COLUMN "card_part_localization_locked_paths";--> statement-breakpoint
ALTER TABLE "magic"."card_part_localizations" DROP COLUMN "card_part_localization_updations";--> statement-breakpoint
ALTER TABLE "magic"."prints" DROP COLUMN "print_locked_paths";--> statement-breakpoint
ALTER TABLE "magic"."prints" DROP COLUMN "print_updations";--> statement-breakpoint
ALTER TABLE "magic"."print_parts" DROP COLUMN "print_part_locked_paths";--> statement-breakpoint
ALTER TABLE "magic"."print_parts" DROP COLUMN "print_part_updations";--> statement-breakpoint
ALTER TABLE "magic"."card_localizations" DROP CONSTRAINT "card_localizations_pkey";--> statement-breakpoint
ALTER TABLE "magic"."card_localizations" ADD PRIMARY KEY ("card_id","version","locale","source");--> statement-breakpoint
ALTER TABLE "magic"."card_parts" DROP CONSTRAINT "card_parts_pkey";--> statement-breakpoint
ALTER TABLE "magic"."card_parts" ADD PRIMARY KEY ("card_id","version","part_index");--> statement-breakpoint
ALTER TABLE "magic"."card_part_localizations" DROP CONSTRAINT "card_part_localizations_pkey";--> statement-breakpoint
ALTER TABLE "magic"."card_part_localizations" ADD PRIMARY KEY ("card_id","version","locale","source","part_index");--> statement-breakpoint
ALTER TABLE "magic"."prints" DROP CONSTRAINT "prints_pkey";--> statement-breakpoint
ALTER TABLE "magic"."prints" ADD PRIMARY KEY ("card_id","version","set","number","lang","source");--> statement-breakpoint
ALTER TABLE "magic"."print_parts" DROP CONSTRAINT "print_parts_pkey";--> statement-breakpoint
ALTER TABLE "magic"."print_parts" ADD PRIMARY KEY ("card_id","version","set","number","lang","source","part_index");--> statement-breakpoint
ALTER TABLE "magic"."cards" DROP CONSTRAINT "cards_pkey";--> statement-breakpoint
ALTER TABLE "magic"."cards" ADD PRIMARY KEY ("card_id","version");--> statement-breakpoint
CREATE INDEX "mtgch_zhs_oracle_oracle_id_idx" ON "magic_data"."mtgch_zhs_oracle" ("oracle_id");--> statement-breakpoint
CREATE INDEX "scryfall_rulings_oracle_id_idx" ON "magic_data"."scryfall_rulings" ("oracle_id");--> statement-breakpoint
CREATE VIEW "magic"."card_view" AS (select "magic"."cards"."card_id", "magic"."cards"."version", "magic"."card_localizations"."locale", "magic"."card_localizations"."source", "magic"."card_parts"."part_index", "magic"."cards"."part_count", "magic"."cards"."name", "magic"."cards"."typeline", "magic"."cards"."text", "magic"."cards"."mana_value", "magic"."cards"."color_identity", "magic"."cards"."keywords", "magic"."cards"."counters", "magic"."cards"."producible_mana", "magic"."cards"."content_warning", "magic"."cards"."category", "magic"."cards"."tags", "magic"."cards"."legalities", "magic"."cards"."scryfall_oracle_id", "magic"."card_localizations"."loc_name", "magic"."card_localizations"."loc_typeline", "magic"."card_localizations"."loc_text", "magic"."card_localizations"."loc_flavor_text", "magic"."card_parts"."part_name", "magic"."card_parts"."part_typeline", "magic"."card_parts"."part_text", "magic"."card_parts"."cost", "magic"."card_parts"."part_mana_value", "magic"."card_parts"."color", "magic"."card_parts"."color_indicator", "magic"."card_parts"."type_super", "magic"."card_parts"."type_main", "magic"."card_parts"."type_sub", "magic"."card_parts"."power", "magic"."card_parts"."toughness", "magic"."card_parts"."loyalty", "magic"."card_parts"."defense", "magic"."card_parts"."hand_modifier", "magic"."card_parts"."life_modifier", "magic"."card_part_localizations"."part_loc_name", "magic"."card_part_localizations"."part_loc_typeline", "magic"."card_part_localizations"."part_loc_text" from "magic"."cards" inner join "magic"."card_localizations" on ("magic"."card_localizations"."card_id" = "magic"."cards"."card_id" and "magic"."card_localizations"."version" = "magic"."cards"."version") inner join "magic"."card_parts" on ("magic"."card_parts"."card_id" = "magic"."cards"."card_id" and "magic"."card_parts"."version" = "magic"."cards"."version") inner join "magic"."card_part_localizations" on ("magic"."card_part_localizations"."card_id" = "magic"."card_parts"."card_id" and "magic"."card_part_localizations"."version" = "magic"."card_parts"."version" and "magic"."card_part_localizations"."locale" = "magic"."card_localizations"."locale" and "magic"."card_part_localizations"."source" = "magic"."card_localizations"."source" and "magic"."card_part_localizations"."part_index" = "magic"."card_parts"."part_index"));--> statement-breakpoint
CREATE VIEW "magic"."card_editor_view" AS (select "magic"."cards"."card_id", "magic"."cards"."version", "magic"."card_localizations"."locale", "magic"."card_localizations"."source", "magic"."card_parts"."part_index", "magic"."prints"."lang", "magic"."prints"."set", "magic"."prints"."number", "magic"."cards"."part_count", "magic"."cards"."name", "magic"."cards"."typeline", "magic"."cards"."text", "magic"."cards"."mana_value", "magic"."cards"."color_identity", "magic"."cards"."keywords", "magic"."cards"."counters", "magic"."cards"."producible_mana", "magic"."cards"."content_warning", "magic"."cards"."category", "magic"."cards"."tags", "magic"."cards"."legalities", "magic"."cards"."scryfall_oracle_id", "magic"."card_localizations"."loc_name", "magic"."card_localizations"."loc_typeline", "magic"."card_localizations"."loc_text", "magic"."card_localizations"."loc_flavor_text", "magic"."card_parts"."part_name", "magic"."card_parts"."part_typeline", "magic"."card_parts"."part_text", "magic"."card_parts"."cost", "magic"."card_parts"."part_mana_value", "magic"."card_parts"."color", "magic"."card_parts"."color_indicator", "magic"."card_parts"."type_super", "magic"."card_parts"."type_main", "magic"."card_parts"."type_sub", "magic"."card_parts"."power", "magic"."card_parts"."toughness", "magic"."card_parts"."loyalty", "magic"."card_parts"."defense", "magic"."card_parts"."hand_modifier", "magic"."card_parts"."life_modifier", "magic"."card_part_localizations"."part_loc_name", "magic"."card_part_localizations"."part_loc_typeline", "magic"."card_part_localizations"."part_loc_text", "magic"."prints"."print_name", "magic"."prints"."print_typeline", "magic"."prints"."print_text", "magic"."prints"."layout", "magic"."prints"."frame", "magic"."prints"."frame_effects", "magic"."prints"."border_color", "magic"."prints"."card_back", "magic"."prints"."security_stamp", "magic"."prints"."promo_types", "magic"."prints"."rarity", "magic"."prints"."release_date", "magic"."prints"."is_digital", "magic"."prints"."is_promo", "magic"."prints"."is_reprint", "magic"."prints"."finishes", "magic"."prints"."has_high_res_image", "magic"."prints"."image_status", "magic"."prints"."image_updated_at", "magic"."prints"."full_image_type", "magic"."prints"."in_booster", "magic"."prints"."games", "magic"."prints"."preview_date", "magic"."prints"."preview_source", "magic"."prints"."preview_uri", "magic"."prints"."print_tags", "magic"."prints"."variation", "magic"."prints"."variation_of", "magic"."prints"."artist_ids", "magic"."prints"."illustration_id", "magic"."prints"."resource_id", "magic"."prints"."print_scryfall_oracle_id", "magic"."prints"."scryfall_card_id", "magic"."prints"."scryfall_face", "magic"."prints"."scryfall_image_uris", "magic"."prints"."arena_id", "magic"."prints"."mtgo_id", "magic"."prints"."mtgo_foil_id", "magic"."prints"."multiverse_id", "magic"."prints"."tcg_player_id", "magic"."prints"."tcgplayer_etched_id", "magic"."prints"."card_market_id", "magic"."print_parts"."print_part_name", "magic"."print_parts"."print_part_typeline", "magic"."print_parts"."print_part_text", "magic"."print_parts"."attraction_lights", "magic"."print_parts"."flavor_name", "magic"."print_parts"."flavor_text", "magic"."print_parts"."artist", "magic"."print_parts"."watermark", "magic"."print_parts"."scryfall_illus_id", true as "in_database", jsonb_build_object() as "original" from "magic"."cards" inner join "magic"."card_localizations" on ("magic"."card_localizations"."card_id" = "magic"."cards"."card_id" and "magic"."card_localizations"."version" = "magic"."cards"."version") inner join "magic"."card_parts" on ("magic"."card_parts"."card_id" = "magic"."cards"."card_id" and "magic"."card_parts"."version" = "magic"."cards"."version") inner join "magic"."card_part_localizations" on ("magic"."card_part_localizations"."card_id" = "magic"."card_parts"."card_id" and "magic"."card_part_localizations"."version" = "magic"."card_parts"."version" and "magic"."card_part_localizations"."locale" = "magic"."card_localizations"."locale" and "magic"."card_part_localizations"."source" = "magic"."card_localizations"."source" and "magic"."card_part_localizations"."part_index" = "magic"."card_parts"."part_index") inner join "magic"."prints" on ("magic"."cards"."card_id" = "magic"."prints"."card_id" and "magic"."cards"."version" = "magic"."prints"."version" and "magic"."card_localizations"."source" = "magic"."prints"."source" and "magic"."prints"."lang" = (
                CASE
                    WHEN EXISTS (SELECT 1 FROM "magic"."prints" WHERE card_id = "magic"."cards"."card_id" AND lang = "magic"."card_localizations"."locale")
                    THEN "magic"."card_localizations"."locale"
                    ELSE 'en'
                END
            )) inner join "magic"."print_parts" on ("magic"."cards"."card_id" = "magic"."print_parts"."card_id" and "magic"."cards"."version" = "magic"."print_parts"."version" and "magic"."prints"."set" = "magic"."print_parts"."set" and "magic"."prints"."number" = "magic"."print_parts"."number" and "magic"."prints"."lang" = "magic"."print_parts"."lang" and "magic"."prints"."source" = "magic"."print_parts"."source" and "magic"."card_parts"."part_index" = "magic"."print_parts"."part_index"));--> statement-breakpoint
CREATE VIEW "magic"."card_print_view" AS (select "magic"."cards"."card_id", "magic"."cards"."version", "magic"."card_localizations"."locale", "magic"."card_localizations"."source", "magic"."card_parts"."part_index", "magic"."prints"."lang", "magic"."prints"."set", "magic"."prints"."number", "magic"."cards"."part_count", "magic"."cards"."name", "magic"."cards"."typeline", "magic"."cards"."text", "magic"."cards"."mana_value", "magic"."cards"."color_identity", "magic"."cards"."keywords", "magic"."cards"."counters", "magic"."cards"."producible_mana", "magic"."cards"."content_warning", "magic"."cards"."category", "magic"."cards"."tags", "magic"."cards"."legalities", "magic"."cards"."scryfall_oracle_id", "magic"."card_localizations"."loc_name", "magic"."card_localizations"."loc_typeline", "magic"."card_localizations"."loc_text", "magic"."card_localizations"."loc_flavor_text", "magic"."card_parts"."part_name", "magic"."card_parts"."part_typeline", "magic"."card_parts"."part_text", "magic"."card_parts"."cost", "magic"."card_parts"."part_mana_value", "magic"."card_parts"."color", "magic"."card_parts"."color_indicator", "magic"."card_parts"."type_super", "magic"."card_parts"."type_main", "magic"."card_parts"."type_sub", "magic"."card_parts"."power", "magic"."card_parts"."toughness", "magic"."card_parts"."loyalty", "magic"."card_parts"."defense", "magic"."card_parts"."hand_modifier", "magic"."card_parts"."life_modifier", "magic"."card_part_localizations"."part_loc_name", "magic"."card_part_localizations"."part_loc_typeline", "magic"."card_part_localizations"."part_loc_text", "magic"."prints"."print_name", "magic"."prints"."print_typeline", "magic"."prints"."print_text", "magic"."prints"."layout", "magic"."prints"."frame", "magic"."prints"."frame_effects", "magic"."prints"."border_color", "magic"."prints"."card_back", "magic"."prints"."security_stamp", "magic"."prints"."promo_types", "magic"."prints"."rarity", "magic"."prints"."release_date", "magic"."prints"."is_digital", "magic"."prints"."is_promo", "magic"."prints"."is_reprint", "magic"."prints"."finishes", "magic"."prints"."has_high_res_image", "magic"."prints"."image_status", "magic"."prints"."image_updated_at", "magic"."prints"."full_image_type", "magic"."prints"."in_booster", "magic"."prints"."games", "magic"."prints"."preview_date", "magic"."prints"."preview_source", "magic"."prints"."preview_uri", "magic"."prints"."print_tags", "magic"."prints"."variation", "magic"."prints"."variation_of", "magic"."prints"."artist_ids", "magic"."prints"."illustration_id", "magic"."prints"."resource_id", "magic"."prints"."print_scryfall_oracle_id", "magic"."prints"."scryfall_card_id", "magic"."prints"."scryfall_face", "magic"."prints"."scryfall_image_uris", "magic"."prints"."arena_id", "magic"."prints"."mtgo_id", "magic"."prints"."mtgo_foil_id", "magic"."prints"."multiverse_id", "magic"."prints"."tcg_player_id", "magic"."prints"."tcgplayer_etched_id", "magic"."prints"."card_market_id", "magic"."print_parts"."print_part_name", "magic"."print_parts"."print_part_typeline", "magic"."print_parts"."print_part_text", "magic"."print_parts"."attraction_lights", "magic"."print_parts"."flavor_name", "magic"."print_parts"."flavor_text", "magic"."print_parts"."artist", "magic"."print_parts"."watermark", "magic"."print_parts"."scryfall_illus_id" from "magic"."cards" inner join "magic"."card_localizations" on ("magic"."card_localizations"."card_id" = "magic"."cards"."card_id" and "magic"."card_localizations"."version" = "magic"."cards"."version") inner join "magic"."card_parts" on ("magic"."card_parts"."card_id" = "magic"."cards"."card_id" and "magic"."card_parts"."version" = "magic"."cards"."version") inner join "magic"."card_part_localizations" on ("magic"."card_part_localizations"."card_id" = "magic"."card_parts"."card_id" and "magic"."card_part_localizations"."version" = "magic"."card_parts"."version" and "magic"."card_part_localizations"."locale" = "magic"."card_localizations"."locale" and "magic"."card_part_localizations"."source" = "magic"."card_localizations"."source" and "magic"."card_part_localizations"."part_index" = "magic"."card_parts"."part_index") inner join "magic"."prints" on ("magic"."cards"."card_id" = "magic"."prints"."card_id" and "magic"."cards"."version" = "magic"."prints"."version" and "magic"."card_localizations"."source" = "magic"."prints"."source" and "magic"."prints"."lang" = (
                CASE
                    WHEN EXISTS (SELECT 1 FROM "magic"."prints" WHERE card_id = "magic"."cards"."card_id" AND lang = "magic"."card_localizations"."locale")
                    THEN "magic"."card_localizations"."locale"
                    ELSE 'en'
                END
            )) inner join "magic"."print_parts" on ("magic"."cards"."card_id" = "magic"."print_parts"."card_id" and "magic"."cards"."version" = "magic"."print_parts"."version" and "magic"."prints"."set" = "magic"."print_parts"."set" and "magic"."prints"."number" = "magic"."print_parts"."number" and "magic"."prints"."lang" = "magic"."print_parts"."lang" and "magic"."prints"."source" = "magic"."print_parts"."source" and "magic"."card_parts"."part_index" = "magic"."print_parts"."part_index"));--> statement-breakpoint
CREATE VIEW "magic"."print_view" AS (select "magic"."prints"."card_id", "magic"."prints"."version", "magic"."prints"."set", "magic"."prints"."number", "magic"."prints"."lang", "magic"."prints"."source", "magic"."print_parts"."part_index", "magic"."prints"."print_name", "magic"."prints"."print_typeline", "magic"."prints"."print_text", "magic"."prints"."layout", "magic"."prints"."frame", "magic"."prints"."frame_effects", "magic"."prints"."border_color", "magic"."prints"."card_back", "magic"."prints"."security_stamp", "magic"."prints"."promo_types", "magic"."prints"."rarity", "magic"."prints"."release_date", "magic"."prints"."is_digital", "magic"."prints"."is_promo", "magic"."prints"."is_reprint", "magic"."prints"."finishes", "magic"."prints"."has_high_res_image", "magic"."prints"."image_status", "magic"."prints"."image_updated_at", "magic"."prints"."full_image_type", "magic"."prints"."in_booster", "magic"."prints"."games", "magic"."prints"."preview_date", "magic"."prints"."preview_source", "magic"."prints"."preview_uri", "magic"."prints"."print_tags", "magic"."prints"."variation", "magic"."prints"."variation_of", "magic"."prints"."artist_ids", "magic"."prints"."illustration_id", "magic"."prints"."resource_id", "magic"."prints"."print_scryfall_oracle_id", "magic"."prints"."scryfall_card_id", "magic"."prints"."scryfall_face", "magic"."prints"."scryfall_image_uris", "magic"."prints"."arena_id", "magic"."prints"."mtgo_id", "magic"."prints"."mtgo_foil_id", "magic"."prints"."multiverse_id", "magic"."prints"."tcg_player_id", "magic"."prints"."tcgplayer_etched_id", "magic"."prints"."card_market_id", "magic"."print_parts"."print_part_name", "magic"."print_parts"."print_part_typeline", "magic"."print_parts"."print_part_text", "magic"."print_parts"."attraction_lights", "magic"."print_parts"."flavor_name", "magic"."print_parts"."flavor_text", "magic"."print_parts"."artist", "magic"."print_parts"."watermark", "magic"."print_parts"."scryfall_illus_id" from "magic"."prints" inner join "magic"."print_parts" on ("magic"."prints"."card_id" = "magic"."print_parts"."card_id" and "magic"."prints"."version" = "magic"."print_parts"."version" and "magic"."prints"."set" = "magic"."print_parts"."set" and "magic"."prints"."number" = "magic"."print_parts"."number" and "magic"."prints"."lang" = "magic"."print_parts"."lang" and "magic"."prints"."source" = "magic"."print_parts"."source"));