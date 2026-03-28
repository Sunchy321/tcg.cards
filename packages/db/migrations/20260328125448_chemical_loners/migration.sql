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
CREATE TYPE "hearthstone"."class" AS ENUM('death_knight', 'druid', 'hunter', 'mage', 'paladin', 'priest', 'rogue', 'shaman', 'warlock', 'warrior', 'dream', 'neutral', 'whizbang', 'demon_hunter');--> statement-breakpoint
CREATE TYPE "hearthstone"."faction" AS ENUM('alliance', 'horde', 'neutral');--> statement-breakpoint
CREATE TYPE "hearthstone"."locale" AS ENUM('en', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'mx', 'pl', 'pt', 'ru', 'th', 'zhs', 'zht');--> statement-breakpoint
CREATE TYPE "hearthstone"."mercenary_faction" AS ENUM('alliance', 'empire', 'explorer', 'horde', 'legion', 'pirate', 'scourge');--> statement-breakpoint
CREATE TYPE "hearthstone"."mercenary_role" AS ENUM('protector', 'fighter', 'caster', 'neutral');--> statement-breakpoint
CREATE TYPE "hearthstone"."quest_type" AS ENUM('normal', 'questline', 'side');--> statement-breakpoint
CREATE TYPE "hearthstone"."race" AS ENUM('bloodelf', 'draenei', 'dwarf', 'gnome', 'goblin', 'human', 'nightelf', 'orc', 'tauren', 'troll', 'undead', 'worgen', 'goblin2', 'murloc', 'demon', 'scourge', 'mech', 'elemental', 'ogre', 'beast', 'totem', 'nerubian', 'pirate', 'dragon', 'blank', 'all', 'egg', 'quilboar', 'centaur', 'furbolg', 'highelf', 'treant', 'halforc', 'lock', 'naga', 'old_god', 'pandaren', 'gronn', 'celestial', 'gnoll', 'golem', 'vulpera');--> statement-breakpoint
CREATE TYPE "hearthstone"."rarity" AS ENUM('unknown', 'free', 'common', 'rare', 'epic', 'legendary');--> statement-breakpoint
CREATE TYPE "hearthstone"."rune" AS ENUM('blood', 'frost', 'unholy');--> statement-breakpoint
CREATE TYPE "hearthstone"."spell_school" AS ENUM('arcane', 'fire', 'frost', 'nature', 'holy', 'shadow', 'fel', 'physical_combat', 'tavern_spell', 'spellcraft', 'lesser_trinket', 'greater_trinket', 'upgrade');--> statement-breakpoint
CREATE TYPE "hearthstone"."card_text_builder_type" AS ENUM('default', 'jade_golem', 'jade_golem_trigger', 'modular_entity', 'kazakus_potion_effect', 'primordial_wand', 'alternate_card_text', 'script_data_num_1', 'galakrond_counter', 'decorate', 'player_tag_threshold', 'entity_tag_threshold', 'multiple_entity_names', 'gameplay_string', 'zombeast', 'zombeast_enchantment', 'hidden_choice', 'investigate', 'reference_creator_entity', 'reference_script_data_num_1_entity', 'reference_script_data_num_1_num_2_entity', 'undatakah_enchant', 'spell_damage_only', 'drustvar_horror', 'hidden_entity', 'score_value_count_down', 'script_data_num_1_num_2', 'powered_up', 'multiple_alt_text_script_data_nums', 'reference_script_data_num_1_entity_power', 'reference_script_data_num_1_card_dbid', 'reference_script_data_num_card_race', 'bg_quest', 'multiple_alt_text_script_data_nums_ref_sdn6_card_dbid', 'zilliax_deluxe_3000');--> statement-breakpoint
CREATE TYPE "hearthstone"."type" AS ENUM('null', 'game', 'player', 'hero', 'minion', 'spell', 'enchantment', 'weapon', 'item', 'token', 'hero_power', 'blank', 'game_mode_button', 'move_minion_hover_target', 'mercenary_ability', 'buddy_meter', 'location', 'quest_reward', 'tavern_spell', 'anomaly', 'trinket', 'pet');--> statement-breakpoint
CREATE TYPE "magic_app"."deck_visibility" AS ENUM('public', 'unlisted', 'private');--> statement-breakpoint
CREATE TYPE "magic"."category" AS ENUM('advertisement', 'art', 'auxiliary', 'decklist', 'default', 'minigame', 'player', 'token');--> statement-breakpoint
CREATE TYPE "magic"."locale" AS ENUM('en', 'zhs', 'zht', 'de', 'fr', 'it', 'ja', 'ko', 'pt', 'ru', 'es', 'ph', 'he', 'ar', 'sa', 'grc', 'la', 'qya');--> statement-breakpoint
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
CREATE TABLE "hearthstone"."card_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"relation" text NOT NULL,
	"version" integer[] NOT NULL,
	"source_id" text NOT NULL,
	"target_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hearthstone"."cards" (
	"card_id" text PRIMARY KEY,
	"legalities" jsonb DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hearthstone"."entities" (
	"card_id" text,
	"version" integer[],
	"dbf_id" integer NOT NULL,
	"slug" text,
	"set" text NOT NULL,
	"class" "hearthstone"."class"[] NOT NULL,
	"type" "hearthstone"."type" NOT NULL,
	"cost" integer NOT NULL,
	"attack" integer,
	"health" integer,
	"durability" integer,
	"armor" integer,
	"rune" "hearthstone"."rune"[],
	"race" "hearthstone"."race"[],
	"spell_school" "hearthstone"."spell_school",
	"quest_type" "hearthstone"."quest_type",
	"quest_progress" integer,
	"quest_part" integer,
	"hero_power" text,
	"heroic_hero_power" text,
	"tech_level" integer,
	"in_bobs_tavern" boolean DEFAULT false NOT NULL,
	"triple_card" text,
	"race_bucket" "hearthstone"."race",
	"coin" integer,
	"armor_bucket" integer,
	"buddy" text,
	"banned_race" text,
	"mercenary_role" "hearthstone"."mercenary_role",
	"mercenary_faction" "hearthstone"."mercenary_faction",
	"colddown" integer,
	"collectible" boolean NOT NULL,
	"elite" boolean NOT NULL,
	"rarity" "hearthstone"."rarity",
	"artist" text NOT NULL,
	"faction" "hearthstone"."faction",
	"mechanics" text[] NOT NULL,
	"referenced_tags" text[] NOT NULL,
	"entourages" text[],
	"deck_order" integer,
	"override_watermark" text,
	"deck_size" integer,
	"localization_notes" text,
	"text_builder_type" "hearthstone"."card_text_builder_type" DEFAULT 'default'::"hearthstone"."card_text_builder_type" NOT NULL,
	"change_type" "hearthstone"."change_type" DEFAULT 'unknown'::"hearthstone"."change_type" NOT NULL,
	"is_latest" boolean DEFAULT false NOT NULL,
	CONSTRAINT "entities_pkey" PRIMARY KEY("card_id","version")
);
--> statement-breakpoint
CREATE TABLE "hearthstone"."entity_localizations" (
	"card_id" text,
	"version" integer[],
	"lang" "hearthstone"."locale",
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
	CONSTRAINT "entity_localizations_pkey" PRIMARY KEY("card_id","version","lang")
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
CREATE TABLE "magic"."decks" (
	"deck_id" text PRIMARY KEY,
	"name" text NOT NULL,
	"description" text,
	"format" text NOT NULL,
	"cards" jsonb NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL
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
CREATE TABLE "magic_data"."gatherer" (
	"multiverse_id" integer PRIMARY KEY,
	"data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
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
	"status" text DEFAULT 'active'
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
CREATE INDEX "accounts_userId_idx" ON "accounts" ("user_id");--> statement-breakpoint
CREATE INDEX "apikeys_configId_idx" ON "apikeys" ("config_id");--> statement-breakpoint
CREATE INDEX "apikeys_referenceId_idx" ON "apikeys" ("reference_id");--> statement-breakpoint
CREATE INDEX "apikeys_key_idx" ON "apikeys" ("key");--> statement-breakpoint
CREATE INDEX "sessions_userId_idx" ON "sessions" ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" ("identifier");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "magic_app"."decks" ADD CONSTRAINT "decks_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "magic_app"."deck_favorites" ADD CONSTRAINT "deck_favorites_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "magic_app"."deck_favorites" ADD CONSTRAINT "deck_favorites_deck_id_decks_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "magic_app"."decks"("deck_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "magic_app"."deck_likes" ADD CONSTRAINT "deck_likes_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "magic_app"."deck_likes" ADD CONSTRAINT "deck_likes_deck_id_decks_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "magic_app"."decks"("deck_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "magic"."rule_change" ADD CONSTRAINT "rule_change_from_source_id_rule_source_id_fkey" FOREIGN KEY ("from_source_id") REFERENCES "magic"."rule_source"("id");--> statement-breakpoint
ALTER TABLE "magic"."rule_change" ADD CONSTRAINT "rule_change_to_source_id_rule_source_id_fkey" FOREIGN KEY ("to_source_id") REFERENCES "magic"."rule_source"("id");--> statement-breakpoint
ALTER TABLE "magic"."rule_change" ADD CONSTRAINT "rule_change_entity_id_rule_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "magic"."rule_entity"("id");--> statement-breakpoint
ALTER TABLE "magic"."rule_change" ADD CONSTRAINT "rule_change_from_node_id_rule_node_id_fkey" FOREIGN KEY ("from_node_id") REFERENCES "magic"."rule_node"("id");--> statement-breakpoint
ALTER TABLE "magic"."rule_change" ADD CONSTRAINT "rule_change_to_node_id_rule_node_id_fkey" FOREIGN KEY ("to_node_id") REFERENCES "magic"."rule_node"("id");--> statement-breakpoint
ALTER TABLE "magic"."rule_node" ADD CONSTRAINT "rule_node_source_id_rule_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "magic"."rule_source"("id");--> statement-breakpoint
ALTER TABLE "magic"."rule_node" ADD CONSTRAINT "rule_node_content_hash_rule_content_hash_fkey" FOREIGN KEY ("content_hash") REFERENCES "magic"."rule_content"("hash");--> statement-breakpoint
ALTER TABLE "magic"."rule_node" ADD CONSTRAINT "rule_node_entity_id_rule_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "magic"."rule_entity"("id");--> statement-breakpoint
CREATE VIEW "hearthstone"."announcement_view" AS (select "hearthstone"."announcements"."id", "hearthstone"."announcements"."source", "hearthstone"."announcements"."date", "hearthstone"."announcements"."name", "hearthstone"."announcements"."version", "hearthstone"."announcements"."last_version", coalesce("hearthstone"."announcement_items"."effective_date", "hearthstone"."announcements"."effective_date") as "effective_date", "hearthstone"."announcements"."link", "hearthstone"."announcement_items"."type", "hearthstone"."announcement_items"."format", "hearthstone"."announcement_items"."card_id", "hearthstone"."announcement_items"."set_id", "hearthstone"."announcement_items"."rule_id", "hearthstone"."announcement_items"."status", "hearthstone"."announcement_items"."score", "hearthstone"."announcement_items"."adjustment", "hearthstone"."announcement_items"."related_cards" from "hearthstone"."announcements" left join "hearthstone"."announcement_items" on "hearthstone"."announcements"."id" = "hearthstone"."announcement_items"."announcement_id");--> statement-breakpoint
CREATE VIEW "hearthstone"."card_entity_view" AS (select "hearthstone"."entities"."card_id", "hearthstone"."entities"."version" & "hearthstone"."entity_localizations"."version" as "version", "hearthstone"."entity_localizations"."lang", "hearthstone"."entities"."dbf_id", "hearthstone"."entities"."slug", "hearthstone"."entities"."set", "hearthstone"."entities"."class", "hearthstone"."entities"."type", "hearthstone"."entities"."cost", "hearthstone"."entities"."attack", "hearthstone"."entities"."health", "hearthstone"."entities"."durability", "hearthstone"."entities"."armor", "hearthstone"."entities"."rune", "hearthstone"."entities"."race", "hearthstone"."entities"."spell_school", "hearthstone"."entities"."quest_type", "hearthstone"."entities"."quest_progress", "hearthstone"."entities"."quest_part", "hearthstone"."entities"."hero_power", "hearthstone"."entities"."heroic_hero_power", "hearthstone"."entities"."tech_level", "hearthstone"."entities"."in_bobs_tavern", "hearthstone"."entities"."triple_card", "hearthstone"."entities"."race_bucket", "hearthstone"."entities"."coin", "hearthstone"."entities"."armor_bucket", "hearthstone"."entities"."buddy", "hearthstone"."entities"."banned_race", "hearthstone"."entities"."mercenary_role", "hearthstone"."entities"."mercenary_faction", "hearthstone"."entities"."colddown", "hearthstone"."entities"."collectible", "hearthstone"."entities"."elite", "hearthstone"."entities"."rarity", "hearthstone"."entities"."artist", "hearthstone"."entities"."faction", "hearthstone"."entities"."mechanics", "hearthstone"."entities"."referenced_tags", "hearthstone"."entities"."entourages", "hearthstone"."entities"."deck_order", "hearthstone"."entities"."override_watermark", "hearthstone"."entities"."deck_size", "hearthstone"."entities"."localization_notes", "hearthstone"."entities"."text_builder_type", "hearthstone"."entities"."change_type", "hearthstone"."entities"."is_latest", "hearthstone"."entity_localizations"."name", "hearthstone"."entity_localizations"."text", "hearthstone"."entity_localizations"."rich_text", "hearthstone"."entity_localizations"."display_text", "hearthstone"."entity_localizations"."target_text", "hearthstone"."entity_localizations"."text_in_play", "hearthstone"."entity_localizations"."how_to_earn", "hearthstone"."entity_localizations"."how_to_earn_golden", "hearthstone"."entity_localizations"."flavor_text", "hearthstone"."entity_localizations"."loc_change_type", "hearthstone"."cards"."legalities" from "hearthstone"."entities" inner join "hearthstone"."entity_localizations" on (("hearthstone"."entities"."card_id" = "hearthstone"."entity_localizations"."card_id") and ("hearthstone"."entities"."version" && "hearthstone"."entity_localizations"."version")) inner join "hearthstone"."cards" on "hearthstone"."entities"."card_id" = "hearthstone"."cards"."card_id");--> statement-breakpoint
CREATE VIEW "hearthstone"."entity_view" AS (select "hearthstone"."entities"."card_id", "hearthstone"."entities"."version" & "hearthstone"."entity_localizations"."version" as "version", "hearthstone"."entity_localizations"."lang", "hearthstone"."entities"."dbf_id", "hearthstone"."entities"."slug", "hearthstone"."entities"."set", "hearthstone"."entities"."class", "hearthstone"."entities"."type", "hearthstone"."entities"."cost", "hearthstone"."entities"."attack", "hearthstone"."entities"."health", "hearthstone"."entities"."durability", "hearthstone"."entities"."armor", "hearthstone"."entities"."rune", "hearthstone"."entities"."race", "hearthstone"."entities"."spell_school", "hearthstone"."entities"."quest_type", "hearthstone"."entities"."quest_progress", "hearthstone"."entities"."quest_part", "hearthstone"."entities"."hero_power", "hearthstone"."entities"."heroic_hero_power", "hearthstone"."entities"."tech_level", "hearthstone"."entities"."in_bobs_tavern", "hearthstone"."entities"."triple_card", "hearthstone"."entities"."race_bucket", "hearthstone"."entities"."coin", "hearthstone"."entities"."armor_bucket", "hearthstone"."entities"."buddy", "hearthstone"."entities"."banned_race", "hearthstone"."entities"."mercenary_role", "hearthstone"."entities"."mercenary_faction", "hearthstone"."entities"."colddown", "hearthstone"."entities"."collectible", "hearthstone"."entities"."elite", "hearthstone"."entities"."rarity", "hearthstone"."entities"."artist", "hearthstone"."entities"."faction", "hearthstone"."entities"."mechanics", "hearthstone"."entities"."referenced_tags", "hearthstone"."entities"."entourages", "hearthstone"."entities"."deck_order", "hearthstone"."entities"."override_watermark", "hearthstone"."entities"."deck_size", "hearthstone"."entities"."localization_notes", "hearthstone"."entities"."text_builder_type", "hearthstone"."entities"."change_type", "hearthstone"."entities"."is_latest", "hearthstone"."entity_localizations"."name", "hearthstone"."entity_localizations"."text", "hearthstone"."entity_localizations"."rich_text", "hearthstone"."entity_localizations"."display_text", "hearthstone"."entity_localizations"."target_text", "hearthstone"."entity_localizations"."text_in_play", "hearthstone"."entity_localizations"."how_to_earn", "hearthstone"."entity_localizations"."how_to_earn_golden", "hearthstone"."entity_localizations"."flavor_text", "hearthstone"."entity_localizations"."loc_change_type" from "hearthstone"."entities" inner join "hearthstone"."entity_localizations" on (("hearthstone"."entities"."card_id" = "hearthstone"."entity_localizations"."card_id") and ("hearthstone"."entities"."version" && "hearthstone"."entity_localizations"."version")));--> statement-breakpoint
CREATE VIEW "hearthstone"."set_view" AS (select "set_id", "dbf_id", "slug", "type", "release_date", "card_count", "group" from "hearthstone"."sets");--> statement-breakpoint
CREATE VIEW "magic"."announcement_view" AS (select "magic"."announcements"."id", "magic"."announcements"."source", "magic"."announcements"."date", "magic"."announcements"."name", coalesce("magic"."announcement_items"."effective_date", "magic"."announcements"."effective_date") as "effective_date", "magic"."announcements"."effective_date_tabletop", "magic"."announcements"."effective_date_online", "magic"."announcements"."effective_date_arena", "magic"."announcements"."next_date", "magic"."announcements"."link", "magic"."announcement_items"."type", "magic"."announcement_items"."format", "magic"."announcement_items"."card_id", "magic"."announcement_items"."set_id", "magic"."announcement_items"."rule_id", "magic"."announcement_items"."status", "magic"."announcement_items"."score", "magic"."announcement_items"."adjustment", "magic"."announcement_items"."related_cards" from "magic"."announcements" left join "magic"."announcement_items" on "magic"."announcements"."id" = "magic"."announcement_items"."announcement_id");--> statement-breakpoint
CREATE VIEW "magic"."card_view" AS (select "magic"."cards"."card_id", "magic"."card_localizations"."locale", "magic"."card_parts"."part_index", "magic"."cards"."part_count", "magic"."cards"."name", "magic"."cards"."typeline", "magic"."cards"."text", "magic"."cards"."mana_value", "magic"."cards"."color_identity", "magic"."cards"."keywords", "magic"."cards"."counters", "magic"."cards"."producible_mana", "magic"."cards"."content_warning", "magic"."cards"."category", "magic"."cards"."tags", "magic"."cards"."legalities", "magic"."cards"."scryfall_oracle_id", "magic"."card_localizations"."loc_name", "magic"."card_localizations"."loc_typeline", "magic"."card_localizations"."loc_text", "magic"."card_localizations"."last_date", "magic"."card_parts"."part_name", "magic"."card_parts"."part_typeline", "magic"."card_parts"."part_text", "magic"."card_parts"."cost", "magic"."card_parts"."part_mana_value", "magic"."card_parts"."color", "magic"."card_parts"."color_indicator", "magic"."card_parts"."type_super", "magic"."card_parts"."type_main", "magic"."card_parts"."type_sub", "magic"."card_parts"."power", "magic"."card_parts"."toughness", "magic"."card_parts"."loyalty", "magic"."card_parts"."defense", "magic"."card_parts"."hand_modifier", "magic"."card_parts"."life_modifier", "magic"."card_part_localizations"."part_loc_name", "magic"."card_part_localizations"."part_loc_typeline", "magic"."card_part_localizations"."part_loc_text" from "magic"."cards" inner join "magic"."card_localizations" on "magic"."card_localizations"."card_id" = "magic"."cards"."card_id" inner join "magic"."card_parts" on "magic"."card_parts"."card_id" = "magic"."cards"."card_id" inner join "magic"."card_part_localizations" on (("magic"."card_part_localizations"."card_id" = "magic"."card_parts"."card_id") and ("magic"."card_part_localizations"."locale" = "magic"."card_localizations"."locale") and ("magic"."card_part_localizations"."part_index" = "magic"."card_parts"."part_index")));--> statement-breakpoint
CREATE VIEW "magic"."card_editor_view" AS (select "magic"."cards"."card_id", "magic"."card_localizations"."locale", "magic"."card_parts"."part_index", "magic"."prints"."lang", "magic"."prints"."set", "magic"."prints"."number", "magic"."cards"."part_count", "magic"."cards"."name", "magic"."cards"."typeline", "magic"."cards"."text", "magic"."cards"."mana_value", "magic"."cards"."color_identity", "magic"."cards"."keywords", "magic"."cards"."counters", "magic"."cards"."producible_mana", "magic"."cards"."content_warning", "magic"."cards"."category", "magic"."cards"."tags", "magic"."cards"."legalities", "magic"."cards"."scryfall_oracle_id", "magic"."cards"."card_locked_paths", "magic"."cards"."card_updations", "magic"."card_localizations"."loc_name", "magic"."card_localizations"."loc_typeline", "magic"."card_localizations"."loc_text", "magic"."card_localizations"."last_date", "magic"."card_localizations"."card_localization_locked_paths", "magic"."card_localizations"."card_localization_updations", "magic"."card_parts"."part_name", "magic"."card_parts"."part_typeline", "magic"."card_parts"."part_text", "magic"."card_parts"."cost", "magic"."card_parts"."part_mana_value", "magic"."card_parts"."color", "magic"."card_parts"."color_indicator", "magic"."card_parts"."type_super", "magic"."card_parts"."type_main", "magic"."card_parts"."type_sub", "magic"."card_parts"."power", "magic"."card_parts"."toughness", "magic"."card_parts"."loyalty", "magic"."card_parts"."defense", "magic"."card_parts"."hand_modifier", "magic"."card_parts"."life_modifier", "magic"."card_parts"."card_part_locked_paths", "magic"."card_parts"."card_part_updations", "magic"."card_part_localizations"."part_loc_name", "magic"."card_part_localizations"."part_loc_typeline", "magic"."card_part_localizations"."part_loc_text", "magic"."card_part_localizations"."card_part_localization_locked_paths", "magic"."card_part_localizations"."card_part_localization_updations", "magic"."prints"."print_name", "magic"."prints"."print_typeline", "magic"."prints"."print_text", "magic"."prints"."layout", "magic"."prints"."frame", "magic"."prints"."frame_effects", "magic"."prints"."border_color", "magic"."prints"."card_back", "magic"."prints"."security_stamp", "magic"."prints"."promo_types", "magic"."prints"."rarity", "magic"."prints"."release_date", "magic"."prints"."is_digital", "magic"."prints"."is_promo", "magic"."prints"."is_reprint", "magic"."prints"."finishes", "magic"."prints"."has_high_res_image", "magic"."prints"."image_status", "magic"."prints"."full_image_type", "magic"."prints"."in_booster", "magic"."prints"."games", "magic"."prints"."preview_date", "magic"."prints"."preview_source", "magic"."prints"."preview_uri", "magic"."prints"."print_tags", "magic"."prints"."print_scryfall_oracle_id", "magic"."prints"."scryfall_card_id", "magic"."prints"."scryfall_face", "magic"."prints"."scryfall_image_uris", "magic"."prints"."arena_id", "magic"."prints"."mtgo_id", "magic"."prints"."mtgo_foil_id", "magic"."prints"."multiverse_id", "magic"."prints"."tcg_player_id", "magic"."prints"."card_market_id", "magic"."prints"."print_locked_paths", "magic"."prints"."print_updations", "magic"."print_parts"."print_part_name", "magic"."print_parts"."print_part_typeline", "magic"."print_parts"."print_part_text", "magic"."print_parts"."attraction_lights", "magic"."print_parts"."flavor_name", "magic"."print_parts"."flavor_text", "magic"."print_parts"."artist", "magic"."print_parts"."watermark", "magic"."print_parts"."scryfall_illus_id", "magic"."print_parts"."print_part_locked_paths", "magic"."print_parts"."print_part_updations", true as "in_database", jsonb_build_object() as "original" from "magic"."cards" inner join "magic"."card_localizations" on "magic"."card_localizations"."card_id" = "magic"."cards"."card_id" inner join "magic"."card_parts" on "magic"."card_parts"."card_id" = "magic"."cards"."card_id" inner join "magic"."card_part_localizations" on (("magic"."card_part_localizations"."card_id" = "magic"."card_parts"."card_id") and ("magic"."card_part_localizations"."locale" = "magic"."card_localizations"."locale") and ("magic"."card_part_localizations"."part_index" = "magic"."card_parts"."part_index")) inner join "magic"."prints" on (("magic"."cards"."card_id" = "magic"."prints"."card_id") and ("magic"."prints"."lang" = (
                CASE
                    WHEN EXISTS (SELECT 1 FROM "magic"."prints" WHERE card_id = "magic"."cards"."card_id" AND lang = "magic"."card_localizations"."locale")
                    THEN "magic"."card_localizations"."locale"
                    ELSE 'en'
                END
            ))) inner join "magic"."print_parts" on (("magic"."cards"."card_id" = "magic"."print_parts"."card_id") and ("magic"."prints"."set" = "magic"."print_parts"."set") and ("magic"."prints"."number" = "magic"."print_parts"."number") and ("magic"."prints"."lang" = "magic"."print_parts"."lang") and ("magic"."card_parts"."part_index" = "magic"."print_parts"."part_index")));--> statement-breakpoint
CREATE VIEW "magic"."card_print_view" AS (select "magic"."cards"."card_id", "magic"."card_localizations"."locale", "magic"."card_parts"."part_index", "magic"."prints"."lang", "magic"."prints"."set", "magic"."prints"."number", "magic"."cards"."part_count", "magic"."cards"."name", "magic"."cards"."typeline", "magic"."cards"."text", "magic"."cards"."mana_value", "magic"."cards"."color_identity", "magic"."cards"."keywords", "magic"."cards"."counters", "magic"."cards"."producible_mana", "magic"."cards"."content_warning", "magic"."cards"."category", "magic"."cards"."tags", "magic"."cards"."legalities", "magic"."cards"."scryfall_oracle_id", "magic"."card_localizations"."loc_name", "magic"."card_localizations"."loc_typeline", "magic"."card_localizations"."loc_text", "magic"."card_localizations"."last_date", "magic"."card_parts"."part_name", "magic"."card_parts"."part_typeline", "magic"."card_parts"."part_text", "magic"."card_parts"."cost", "magic"."card_parts"."part_mana_value", "magic"."card_parts"."color", "magic"."card_parts"."color_indicator", "magic"."card_parts"."type_super", "magic"."card_parts"."type_main", "magic"."card_parts"."type_sub", "magic"."card_parts"."power", "magic"."card_parts"."toughness", "magic"."card_parts"."loyalty", "magic"."card_parts"."defense", "magic"."card_parts"."hand_modifier", "magic"."card_parts"."life_modifier", "magic"."card_part_localizations"."part_loc_name", "magic"."card_part_localizations"."part_loc_typeline", "magic"."card_part_localizations"."part_loc_text", "magic"."prints"."print_name", "magic"."prints"."print_typeline", "magic"."prints"."print_text", "magic"."prints"."layout", "magic"."prints"."frame", "magic"."prints"."frame_effects", "magic"."prints"."border_color", "magic"."prints"."card_back", "magic"."prints"."security_stamp", "magic"."prints"."promo_types", "magic"."prints"."rarity", "magic"."prints"."release_date", "magic"."prints"."is_digital", "magic"."prints"."is_promo", "magic"."prints"."is_reprint", "magic"."prints"."finishes", "magic"."prints"."has_high_res_image", "magic"."prints"."image_status", "magic"."prints"."full_image_type", "magic"."prints"."in_booster", "magic"."prints"."games", "magic"."prints"."preview_date", "magic"."prints"."preview_source", "magic"."prints"."preview_uri", "magic"."prints"."print_tags", "magic"."prints"."print_scryfall_oracle_id", "magic"."prints"."scryfall_card_id", "magic"."prints"."scryfall_face", "magic"."prints"."scryfall_image_uris", "magic"."prints"."arena_id", "magic"."prints"."mtgo_id", "magic"."prints"."mtgo_foil_id", "magic"."prints"."multiverse_id", "magic"."prints"."tcg_player_id", "magic"."prints"."card_market_id", "magic"."print_parts"."print_part_name", "magic"."print_parts"."print_part_typeline", "magic"."print_parts"."print_part_text", "magic"."print_parts"."attraction_lights", "magic"."print_parts"."flavor_name", "magic"."print_parts"."flavor_text", "magic"."print_parts"."artist", "magic"."print_parts"."watermark", "magic"."print_parts"."scryfall_illus_id" from "magic"."cards" inner join "magic"."card_localizations" on "magic"."card_localizations"."card_id" = "magic"."cards"."card_id" inner join "magic"."card_parts" on "magic"."card_parts"."card_id" = "magic"."cards"."card_id" inner join "magic"."card_part_localizations" on (("magic"."card_part_localizations"."card_id" = "magic"."card_parts"."card_id") and ("magic"."card_part_localizations"."locale" = "magic"."card_localizations"."locale") and ("magic"."card_part_localizations"."part_index" = "magic"."card_parts"."part_index")) inner join "magic"."prints" on (("magic"."cards"."card_id" = "magic"."prints"."card_id") and ("magic"."prints"."lang" = (
                CASE
                    WHEN EXISTS (SELECT 1 FROM "magic"."prints" WHERE card_id = "magic"."cards"."card_id" AND lang = "magic"."card_localizations"."locale")
                    THEN "magic"."card_localizations"."locale"
                    ELSE 'en'
                END
            ))) inner join "magic"."print_parts" on (("magic"."cards"."card_id" = "magic"."print_parts"."card_id") and ("magic"."prints"."set" = "magic"."print_parts"."set") and ("magic"."prints"."number" = "magic"."print_parts"."number") and ("magic"."prints"."lang" = "magic"."print_parts"."lang") and ("magic"."card_parts"."part_index" = "magic"."print_parts"."part_index")));--> statement-breakpoint
CREATE VIEW "magic"."print_view" AS (select "magic"."prints"."card_id", "magic"."prints"."set", "magic"."prints"."number", "magic"."prints"."lang", "magic"."print_parts"."part_index", "magic"."prints"."print_name", "magic"."prints"."print_typeline", "magic"."prints"."print_text", "magic"."prints"."layout", "magic"."prints"."frame", "magic"."prints"."frame_effects", "magic"."prints"."border_color", "magic"."prints"."card_back", "magic"."prints"."security_stamp", "magic"."prints"."promo_types", "magic"."prints"."rarity", "magic"."prints"."release_date", "magic"."prints"."is_digital", "magic"."prints"."is_promo", "magic"."prints"."is_reprint", "magic"."prints"."finishes", "magic"."prints"."has_high_res_image", "magic"."prints"."image_status", "magic"."prints"."full_image_type", "magic"."prints"."in_booster", "magic"."prints"."games", "magic"."prints"."preview_date", "magic"."prints"."preview_source", "magic"."prints"."preview_uri", "magic"."prints"."print_tags", "magic"."prints"."print_scryfall_oracle_id", "magic"."prints"."scryfall_card_id", "magic"."prints"."scryfall_face", "magic"."prints"."scryfall_image_uris", "magic"."prints"."arena_id", "magic"."prints"."mtgo_id", "magic"."prints"."mtgo_foil_id", "magic"."prints"."multiverse_id", "magic"."prints"."tcg_player_id", "magic"."prints"."card_market_id", "magic"."print_parts"."print_part_name", "magic"."print_parts"."print_part_typeline", "magic"."print_parts"."print_part_text", "magic"."print_parts"."attraction_lights", "magic"."print_parts"."flavor_name", "magic"."print_parts"."flavor_text", "magic"."print_parts"."artist", "magic"."print_parts"."watermark", "magic"."print_parts"."scryfall_illus_id" from "magic"."prints" inner join "magic"."print_parts" on (("magic"."prints"."card_id" = "magic"."print_parts"."card_id") and ("magic"."prints"."set" = "magic"."print_parts"."set") and ("magic"."prints"."number" = "magic"."print_parts"."number") and ("magic"."prints"."lang" = "magic"."print_parts"."lang")));--> statement-breakpoint
CREATE VIEW "magic"."rule_view" AS (select "magic"."rules"."date", "magic"."rules"."lang", "magic"."rule_items"."item_id", "magic"."rule_items"."index", "magic"."rule_items"."depth", "magic"."rule_items"."text", "magic"."rule_items"."rich_text" from "magic"."rules" left join "magic"."rule_items" on (("magic"."rules"."date" = "magic"."rule_items"."date") and ("magic"."rules"."lang" = "magic"."rule_items"."lang")));