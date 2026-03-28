CREATE TYPE "magic"."category" AS ENUM('advertisement', 'art', 'auxiliary', 'decklist', 'default', 'minigame', 'player', 'token');--> statement-breakpoint
CREATE TYPE "magic"."locale" AS ENUM('en', 'zhs', 'zht', 'de', 'fr', 'it', 'ja', 'ko', 'pt', 'ru', 'es', 'ph', 'he', 'ar', 'sa', 'grc', 'la', 'qya');--> statement-breakpoint
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
CREATE TYPE "magic"."game_change_type" AS ENUM('card_change', 'set_change', 'rule_change', 'format_death', 'card_adjustment');--> statement-breakpoint
CREATE TYPE "magic_app"."deck_visibility" AS ENUM('public', 'unlisted', 'private');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
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
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"start" text,
	"prefix" text,
	"key" text NOT NULL,
	"user_id" text NOT NULL,
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
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"username" text,
	"display_username" text,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."cards" (
	"card_id" text PRIMARY KEY NOT NULL,
	"part_count" smallint NOT NULL,
	"name" text NOT NULL,
	"typeline" text NOT NULL,
	"text" text NOT NULL,
	"mana_value" double precision NOT NULL,
	"color_identity" "bit(16)" NOT NULL,
	"keywords" text[] NOT NULL,
	"counters" text[] NOT NULL,
	"producible_mana" "bit(7)",
	"content_warning" boolean,
	"category" "category" NOT NULL,
	"tags" text[] NOT NULL,
	"legalities" jsonb NOT NULL,
	"scryfall_oracle_id" uuid[] NOT NULL,
	"card_locked_paths" text[] DEFAULT '{}' NOT NULL,
	"card_updations" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."card_localizations" (
	"card_id" text NOT NULL,
	"locale" "locale" NOT NULL,
	"loc_name" text NOT NULL,
	"loc_typeline" text NOT NULL,
	"loc_text" text NOT NULL,
	"last_date" text NOT NULL,
	"card_localization_locked_paths" text[] DEFAULT '{}' NOT NULL,
	"card_localization_updations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "card_localizations_card_id_locale_pk" PRIMARY KEY("card_id","locale")
);
--> statement-breakpoint
CREATE TABLE "magic"."card_parts" (
	"card_id" text NOT NULL,
	"part_index" smallint NOT NULL,
	"part_name" text NOT NULL,
	"part_typeline" text NOT NULL,
	"part_text" text NOT NULL,
	"cost" text[],
	"part_mana_value" double precision,
	"color" "bit(16)",
	"color_indicator" "bit(5)",
	"type_super" text[],
	"type_main" text[] NOT NULL,
	"type_sub" text[],
	"power" text,
	"toughness" text,
	"loyalty" text,
	"defense" text,
	"hand_modifier" text,
	"life_modifier" text,
	"card_part_locked_paths" text[] DEFAULT '{}' NOT NULL,
	"card_part_updations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "card_parts_card_id_part_index_pk" PRIMARY KEY("card_id","part_index")
);
--> statement-breakpoint
CREATE TABLE "magic"."card_part_localizations" (
	"card_id" text NOT NULL,
	"locale" "locale" NOT NULL,
	"part_index" smallint NOT NULL,
	"part_loc_name" text NOT NULL,
	"part_loc_typeline" text NOT NULL,
	"part_loc_text" text NOT NULL,
	"card_part_localization_locked_paths" text[] DEFAULT '{}' NOT NULL,
	"card_part_localization_updations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "card_part_localizations_card_id_locale_part_index_pk" PRIMARY KEY("card_id","locale","part_index")
);
--> statement-breakpoint
CREATE TABLE "magic"."prints" (
	"card_id" text NOT NULL,
	"set" text NOT NULL,
	"number" text NOT NULL,
	"lang" "locale" NOT NULL,
	"print_name" text NOT NULL,
	"print_typeline" text NOT NULL,
	"print_text" text NOT NULL,
	"layout" "layout" NOT NULL,
	"frame" "frame" NOT NULL,
	"frame_effects" text[] NOT NULL,
	"border_color" "border_color" NOT NULL,
	"card_back" uuid,
	"security_stamp" "security_stamp",
	"promo_types" text[],
	"rarity" "rarity" NOT NULL,
	"release_date" text NOT NULL,
	"is_digital" boolean NOT NULL,
	"is_promo" boolean NOT NULL,
	"is_reprint" boolean NOT NULL,
	"finishes" "finish"[] NOT NULL,
	"has_high_res_image" boolean NOT NULL,
	"image_status" "image_status" NOT NULL,
	"full_image_type" "full_image_type" NOT NULL,
	"in_booster" boolean NOT NULL,
	"games" "game"[] NOT NULL,
	"preview_date" text,
	"preview_source" text,
	"preview_uri" text,
	"print_tags" text[] NOT NULL,
	"print_scryfall_oracle_id" uuid NOT NULL,
	"scryfall_card_id" uuid,
	"scryfall_face" "scryfall_face",
	"scryfall_image_uris" jsonb,
	"arena_id" integer,
	"mtgo_id" integer,
	"mtgo_foil_id" integer,
	"multiverse_id" integer[] NOT NULL,
	"tcg_player_id" integer,
	"card_market_id" integer,
	"print_locked_paths" text[] DEFAULT '{}' NOT NULL,
	"print_updations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "prints_card_id_set_number_lang_pk" PRIMARY KEY("card_id","set","number","lang")
);
--> statement-breakpoint
CREATE TABLE "magic"."print_parts" (
	"card_id" text NOT NULL,
	"set" text NOT NULL,
	"number" text NOT NULL,
	"lang" "locale" NOT NULL,
	"part_index" smallint NOT NULL,
	"print_part_name" text NOT NULL,
	"print_part_typeline" text NOT NULL,
	"print_part_text" text NOT NULL,
	"attraction_lights" "bit(6)",
	"flavor_name" text,
	"flavor_text" text,
	"artist" text,
	"watermark" text,
	"scryfall_illus_id" uuid[],
	"print_part_locked_paths" text[] DEFAULT '{}' NOT NULL,
	"print_part_updations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "print_parts_card_id_set_number_lang_part_index_pk" PRIMARY KEY("card_id","set","number","lang","part_index")
);
--> statement-breakpoint
CREATE TABLE "magic"."boosters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"set_id" text NOT NULL,
	"booster_id" text NOT NULL,
	"total_weight" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booster_id" uuid NOT NULL,
	"weight" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."pack_contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_id" uuid NOT NULL,
	"type" text NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."sets" (
	"set_id" text PRIMARY KEY NOT NULL,
	"block" text,
	"parent" text,
	"printed_size" integer,
	"card_count" integer NOT NULL,
	"langs" "locale"[] NOT NULL,
	"rarities" "rarity"[] NOT NULL,
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
	"set_id" text NOT NULL,
	"lang" text NOT NULL,
	"name" text,
	"url" text,
	CONSTRAINT "set_localizations_set_id_lang_pk" PRIMARY KEY("set_id","lang")
);
--> statement-breakpoint
CREATE TABLE "magic"."booster_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" uuid,
	"card_id" text NOT NULL,
	"set" text NOT NULL,
	"number" text NOT NULL,
	"lang" text,
	"weight" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."formats" (
	"format_id" text PRIMARY KEY NOT NULL,
	"localization" jsonb NOT NULL,
	"sets" text[],
	"banlist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"birthday" text,
	"deathdate" text,
	"tags" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."rulings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" text NOT NULL,
	"source" text NOT NULL,
	"date" text NOT NULL,
	"text" text NOT NULL,
	"rich_text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."card_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relation" text NOT NULL,
	"source_id" text NOT NULL,
	"target_id" text NOT NULL,
	"target_set" text,
	"target_number" text,
	"target_lang" text
);
--> statement-breakpoint
CREATE TABLE "magic"."cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"keys" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."cycle_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"color" text NOT NULL,
	"card_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"date" text NOT NULL,
	"name" text NOT NULL,
	"effective_date" text,
	"effective_date_tabletop" text,
	"effective_date_online" text,
	"effective_date_arena" text,
	"next_date" text,
	"link" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."announcement_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"announcement_id" uuid NOT NULL,
	"type" "game_change_type" NOT NULL,
	"effective_date" text,
	"format" text,
	"card_id" text,
	"set_id" text,
	"rule_id" text,
	"status" text,
	"score" integer,
	"adjustment" jsonb,
	"related_cards" text[] DEFAULT '{}'
);
--> statement-breakpoint
CREATE TABLE "magic"."announcement_rule_items" (
	"id" text PRIMARY KEY NOT NULL,
	"lang" text NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."card_changes" (
	"source" text NOT NULL,
	"date" text NOT NULL,
	"effective_date" text,
	"name" text NOT NULL,
	"link" text[] DEFAULT '{}' NOT NULL,
	"type" "game_change_type" NOT NULL,
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
	"link" text[] DEFAULT '{}' NOT NULL,
	"type" "game_change_type" NOT NULL,
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
	"link" text[] DEFAULT '{}' NOT NULL,
	"type" "game_change_type" NOT NULL,
	"format" text,
	"set_id" text NOT NULL,
	"status" text NOT NULL,
	"score" integer
);
--> statement-breakpoint
CREATE TABLE "magic"."rules" (
	"date" text NOT NULL,
	"lang" text NOT NULL,
	CONSTRAINT "rules_date_lang_pk" PRIMARY KEY("date","lang")
);
--> statement-breakpoint
CREATE TABLE "magic"."rule_items" (
	"date" text NOT NULL,
	"lang" text NOT NULL,
	"item_id" text NOT NULL,
	"index" integer NOT NULL,
	"depth" integer NOT NULL,
	"serial" text,
	"text" text NOT NULL,
	"rich_text" text NOT NULL,
	CONSTRAINT "rule_items_date_lang_item_id_pk" PRIMARY KEY("date","lang","item_id")
);
--> statement-breakpoint
CREATE TABLE "magic_data"."scryfall" (
	"card_id" uuid PRIMARY KEY NOT NULL,
	"oracle_id" uuid NOT NULL,
	"legalities" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."gatherer" (
	"multiverse_id" integer PRIMARY KEY NOT NULL,
	"data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."mtgch" (
	"set" text NOT NULL,
	"number" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "mtgch_set_number_pk" PRIMARY KEY("set","number")
);
--> statement-breakpoint
CREATE TABLE "magic_app"."decks" (
	"deck_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"format" text NOT NULL,
	"cards" jsonb NOT NULL,
	"visibility" "magic_app"."deck_visibility" DEFAULT 'private' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"favorites" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_app"."deck_favorites" (
	"user_id" text NOT NULL,
	"deck_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deck_favorites_user_id_deck_id_pk" PRIMARY KEY("user_id","deck_id")
);
--> statement-breakpoint
CREATE TABLE "magic_app"."deck_likes" (
	"user_id" text NOT NULL,
	"deck_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deck_likes_user_id_deck_id_pk" PRIMARY KEY("user_id","deck_id")
);
--> statement-breakpoint
CREATE TABLE "magic"."decks" (
	"deck_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"format" text NOT NULL,
	"cards" jsonb NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apikeys" ADD CONSTRAINT "apikeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_app"."decks" ADD CONSTRAINT "decks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_app"."deck_favorites" ADD CONSTRAINT "deck_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_app"."deck_favorites" ADD CONSTRAINT "deck_favorites_deck_id_decks_deck_id_fk" FOREIGN KEY ("deck_id") REFERENCES "magic_app"."decks"("deck_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_app"."deck_likes" ADD CONSTRAINT "deck_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_app"."deck_likes" ADD CONSTRAINT "deck_likes_deck_id_decks_deck_id_fk" FOREIGN KEY ("deck_id") REFERENCES "magic_app"."decks"("deck_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_userId_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "apikeys_key_idx" ON "apikeys" USING btree ("key");--> statement-breakpoint
CREATE INDEX "apikeys_userId_idx" ON "apikeys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_userId_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
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
CREATE VIEW "magic"."announcement_view" AS (select "magic"."announcements"."id", "magic"."announcements"."source", "magic"."announcements"."date", "magic"."announcements"."name", coalesce("magic"."announcement_items"."effective_date", "magic"."announcements"."effective_date") as "effective_date", "magic"."announcements"."effective_date_tabletop", "magic"."announcements"."effective_date_online", "magic"."announcements"."effective_date_arena", "magic"."announcements"."next_date", "magic"."announcements"."link", "magic"."announcement_items"."type", "magic"."announcement_items"."format", "magic"."announcement_items"."card_id", "magic"."announcement_items"."set_id", "magic"."announcement_items"."rule_id", "magic"."announcement_items"."status", "magic"."announcement_items"."score", "magic"."announcement_items"."adjustment", "magic"."announcement_items"."related_cards" from "magic"."announcements" left join "magic"."announcement_items" on "magic"."announcements"."id" = "magic"."announcement_items"."announcement_id");--> statement-breakpoint
CREATE VIEW "magic"."rule_view" AS (select "magic"."rules"."date", "magic"."rules"."lang", "magic"."rule_items"."item_id", "magic"."rule_items"."index", "magic"."rule_items"."depth", "magic"."rule_items"."text", "magic"."rule_items"."rich_text" from "magic"."rules" left join "magic"."rule_items" on ("magic"."rules"."date" = "magic"."rule_items"."date" and "magic"."rules"."lang" = "magic"."rule_items"."lang"));