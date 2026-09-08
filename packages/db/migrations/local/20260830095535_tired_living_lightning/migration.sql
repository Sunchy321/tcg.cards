CREATE SCHEMA "shadowverse_data";
--> statement-breakpoint
CREATE SCHEMA "shadowverse";
--> statement-breakpoint
CREATE TYPE "shadowverse"."lang" AS ENUM('ja', 'en', 'chs', 'cht', 'ko');--> statement-breakpoint
CREATE TYPE "shadowverse_data"."import_batch_status" AS ENUM('running', 'completed', 'completed_with_errors', 'failed', 'interrupted');--> statement-breakpoint
CREATE TYPE "shadowverse_data"."image_import_batch_status" AS ENUM('running', 'completed', 'completed_with_errors', 'failed', 'interrupted');--> statement-breakpoint
CREATE TABLE "shadowverse"."card_sets" (
	"card_set_id" integer PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "shadowverse"."card_set_localizations" (
	"card_set_id" integer,
	"lang" "shadowverse"."lang",
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_set_localizations_pkey" PRIMARY KEY("card_set_id","lang"),
	CONSTRAINT "card_set_localizations_name_nonempty_chk" CHECK (length("name") > 0)
);
--> statement-breakpoint
CREATE TABLE "shadowverse"."cards" (
	"card_id" bigint PRIMARY KEY,
	"base_card_id" bigint,
	"card_resource_id" bigint,
	"original_card_id" bigint,
	"card_set_id" integer,
	"type" integer,
	"class" integer,
	"rarity" integer,
	"cost" integer,
	"atk" integer,
	"life" integer,
	"tribes" integer[],
	"is_token" boolean DEFAULT false NOT NULL,
	"is_include_rotation" boolean,
	"deck_enabled_num" integer,
	"is_starter_ability_changed" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "cards_card_id_positive_chk" CHECK ("card_id" > 0),
	CONSTRAINT "cards_cost_nonnegative_chk" CHECK ("cost" is null or "cost" >= 0),
	CONSTRAINT "cards_atk_nonnegative_chk" CHECK ("atk" is null or "atk" >= 0),
	CONSTRAINT "cards_life_nonnegative_chk" CHECK ("life" is null or "life" >= 0),
	CONSTRAINT "cards_deck_enabled_num_nonnegative_chk" CHECK ("deck_enabled_num" is null or "deck_enabled_num" >= 0)
);
--> statement-breakpoint
CREATE TABLE "shadowverse"."card_localizations" (
	"card_id" bigint,
	"lang" "shadowverse"."lang",
	"name" text NOT NULL,
	"name_ruby" text,
	"skill_text" text,
	"flavour_text" text,
	"cv" text,
	"illustrator" text,
	"questions" jsonb,
	"card_image_hash" varchar(32) NOT NULL,
	"card_banner_image_hash" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_localizations_pkey" PRIMARY KEY("card_id","lang"),
	CONSTRAINT "card_localizations_name_nonempty_chk" CHECK (length("name") > 0),
	CONSTRAINT "card_localizations_card_image_hash_format_chk" CHECK ("card_image_hash" ~ '^[a-f0-9]{32}$'),
	CONSTRAINT "card_localizations_card_banner_image_hash_format_chk" CHECK ("card_banner_image_hash" is null or "card_banner_image_hash" ~ '^[a-f0-9]{32}$')
);
--> statement-breakpoint
CREATE TABLE "shadowverse"."card_evolutions" (
	"card_id" bigint PRIMARY KEY,
	"card_resource_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_evolutions_card_resource_id_positive_chk" CHECK ("card_resource_id" is null or "card_resource_id" > 0)
);
--> statement-breakpoint
CREATE TABLE "shadowverse"."card_evolution_localizations" (
	"card_id" bigint,
	"lang" "shadowverse"."lang",
	"skill_text" text,
	"flavour_text" text,
	"card_image_hash" varchar(32) NOT NULL,
	"card_banner_image_hash" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_evolution_localizations_pkey" PRIMARY KEY("card_id","lang"),
	CONSTRAINT "card_evolution_localizations_card_image_hash_format_chk" CHECK ("card_image_hash" ~ '^[a-f0-9]{32}$'),
	CONSTRAINT "card_evolution_localizations_card_banner_image_hash_format_chk" CHECK ("card_banner_image_hash" is null or "card_banner_image_hash" ~ '^[a-f0-9]{32}$')
);
--> statement-breakpoint
CREATE TABLE "shadowverse"."card_styles" (
	"card_id" bigint,
	"style_index" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_styles_pkey" PRIMARY KEY("card_id","style_index"),
	CONSTRAINT "card_styles_style_index_nonnegative_chk" CHECK ("style_index" >= 0)
);
--> statement-breakpoint
CREATE TABLE "shadowverse"."card_style_localizations" (
	"card_id" bigint,
	"style_index" integer,
	"lang" "shadowverse"."lang",
	"name" text,
	"name_ruby" text,
	"cv" text,
	"illustrator" text,
	"skill_text" text,
	"flavour_text" text,
	"evo_flavour_text" text,
	"card_image_hash" varchar(32) NOT NULL,
	"evo_card_image_hash" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_style_localizations_pkey" PRIMARY KEY("card_id","style_index","lang"),
	CONSTRAINT "card_style_localizations_card_image_hash_format_chk" CHECK ("card_image_hash" ~ '^[a-f0-9]{32}$'),
	CONSTRAINT "card_style_localizations_evo_card_image_hash_format_chk" CHECK ("evo_card_image_hash" is null or "evo_card_image_hash" ~ '^[a-f0-9]{32}$')
);
--> statement-breakpoint
CREATE TABLE "shadowverse"."card_relations" (
	"card_id" bigint PRIMARY KEY,
	"related_card_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"specific_effect_card_ids" integer[] DEFAULT '{}'::integer[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shadowverse_data"."import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source" text NOT NULL,
	"source_url" text NOT NULL,
	"unknown_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"source_record_count" integer DEFAULT 0 NOT NULL,
	"added_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"soft_deleted_count" integer DEFAULT 0 NOT NULL,
	"status" "shadowverse_data"."import_batch_status" DEFAULT 'running'::"shadowverse_data"."import_batch_status" NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "import_batches_source_record_count_nonnegative_chk" CHECK ("source_record_count" >= 0),
	CONSTRAINT "import_batches_added_count_nonnegative_chk" CHECK ("added_count" >= 0),
	CONSTRAINT "import_batches_updated_count_nonnegative_chk" CHECK ("updated_count" >= 0),
	CONSTRAINT "import_batches_skipped_count_nonnegative_chk" CHECK ("skipped_count" >= 0),
	CONSTRAINT "import_batches_failed_count_nonnegative_chk" CHECK ("failed_count" >= 0),
	CONSTRAINT "import_batches_soft_deleted_count_nonnegative_chk" CHECK ("soft_deleted_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "shadowverse_data"."import_failures" (
	"batch_id" uuid,
	"source_record_id" text,
	"stage" text NOT NULL,
	"code" text NOT NULL,
	"message" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_failures_pkey" PRIMARY KEY("batch_id","source_record_id")
);
--> statement-breakpoint
CREATE TABLE "shadowverse_data"."import_states" (
	"source" text PRIMARY KEY,
	"source_url" text NOT NULL,
	"last_successful_batch_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shadowverse_data"."image_assets" (
	"id" bigserial PRIMARY KEY,
	"lang" "shadowverse"."lang" NOT NULL,
	"kind" varchar(16) NOT NULL,
	"card_id" bigint NOT NULL,
	"style_index" integer DEFAULT 0 NOT NULL,
	"hash" varchar(32) NOT NULL,
	"file_path" text NOT NULL,
	"byte_size" integer,
	"downloaded_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "image_assets_hash_format_chk" CHECK ("hash" ~ '^[a-f0-9]{32}$'),
	CONSTRAINT "image_assets_style_index_nonnegative_chk" CHECK ("style_index" >= 0)
);
--> statement-breakpoint
CREATE TABLE "shadowverse_data"."image_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source" text NOT NULL,
	"asset_count" integer DEFAULT 0 NOT NULL,
	"downloaded_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"missing_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"downloaded_byte_count" bigint DEFAULT 0 NOT NULL,
	"status" "shadowverse_data"."image_import_batch_status" DEFAULT 'running'::"shadowverse_data"."image_import_batch_status" NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "image_import_batches_asset_count_nonnegative_chk" CHECK ("asset_count" >= 0),
	CONSTRAINT "image_import_batches_downloaded_count_nonnegative_chk" CHECK ("downloaded_count" >= 0),
	CONSTRAINT "image_import_batches_skipped_count_nonnegative_chk" CHECK ("skipped_count" >= 0),
	CONSTRAINT "image_import_batches_missing_count_nonnegative_chk" CHECK ("missing_count" >= 0),
	CONSTRAINT "image_import_batches_failed_count_nonnegative_chk" CHECK ("failed_count" >= 0),
	CONSTRAINT "image_import_batches_downloaded_byte_count_nonnegative_chk" CHECK ("downloaded_byte_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "shadowverse_data"."image_import_failures" (
	"batch_id" uuid,
	"asset_key" text,
	"stage" text NOT NULL,
	"code" text NOT NULL,
	"message" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "image_import_failures_pkey" PRIMARY KEY("batch_id","asset_key")
);
--> statement-breakpoint
CREATE INDEX "card_sets_deleted_at_idx" ON "shadowverse"."card_sets" ("deleted_at");--> statement-breakpoint
CREATE INDEX "cards_card_set_id_idx" ON "shadowverse"."cards" ("card_set_id");--> statement-breakpoint
CREATE INDEX "cards_class_idx" ON "shadowverse"."cards" ("class");--> statement-breakpoint
CREATE INDEX "cards_type_idx" ON "shadowverse"."cards" ("type");--> statement-breakpoint
CREATE INDEX "cards_is_token_idx" ON "shadowverse"."cards" ("is_token");--> statement-breakpoint
CREATE INDEX "cards_deleted_at_idx" ON "shadowverse"."cards" ("deleted_at");--> statement-breakpoint
CREATE INDEX "card_localizations_lang_idx" ON "shadowverse"."card_localizations" ("lang");--> statement-breakpoint
CREATE INDEX "card_localizations_card_image_hash_idx" ON "shadowverse"."card_localizations" ("card_image_hash");--> statement-breakpoint
CREATE INDEX "card_localizations_name_idx" ON "shadowverse"."card_localizations" ("name");--> statement-breakpoint
CREATE INDEX "card_style_localizations_card_image_hash_idx" ON "shadowverse"."card_style_localizations" ("card_image_hash");--> statement-breakpoint
CREATE INDEX "import_batches_source_started_at_idx" ON "shadowverse_data"."import_batches" ("source","started_at");--> statement-breakpoint
CREATE INDEX "import_batches_status_started_at_idx" ON "shadowverse_data"."import_batches" ("status","started_at");--> statement-breakpoint
CREATE INDEX "import_failures_batch_id_idx" ON "shadowverse_data"."import_failures" ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "image_assets_lang_kind_card_style_uidx" ON "shadowverse_data"."image_assets" ("lang","kind","card_id","style_index");--> statement-breakpoint
CREATE INDEX "image_assets_card_id_idx" ON "shadowverse_data"."image_assets" ("card_id");--> statement-breakpoint
CREATE INDEX "image_assets_hash_idx" ON "shadowverse_data"."image_assets" ("hash");--> statement-breakpoint
CREATE INDEX "image_assets_retired_at_idx" ON "shadowverse_data"."image_assets" ("retired_at");--> statement-breakpoint
CREATE INDEX "image_import_batches_source_started_at_idx" ON "shadowverse_data"."image_import_batches" ("source","started_at");--> statement-breakpoint
CREATE INDEX "image_import_batches_status_started_at_idx" ON "shadowverse_data"."image_import_batches" ("status","started_at");--> statement-breakpoint
CREATE INDEX "image_import_failures_batch_id_idx" ON "shadowverse_data"."image_import_failures" ("batch_id");--> statement-breakpoint
ALTER TABLE "shadowverse"."card_set_localizations" ADD CONSTRAINT "card_set_localizations_card_set_id_card_sets_card_set_id_fkey" FOREIGN KEY ("card_set_id") REFERENCES "shadowverse"."card_sets"("card_set_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "shadowverse"."cards" ADD CONSTRAINT "cards_card_set_id_card_sets_card_set_id_fkey" FOREIGN KEY ("card_set_id") REFERENCES "shadowverse"."card_sets"("card_set_id");--> statement-breakpoint
ALTER TABLE "shadowverse"."card_localizations" ADD CONSTRAINT "card_localizations_card_id_cards_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "shadowverse"."cards"("card_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "shadowverse"."card_evolutions" ADD CONSTRAINT "card_evolutions_card_id_cards_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "shadowverse"."cards"("card_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "shadowverse"."card_evolution_localizations" ADD CONSTRAINT "card_evolution_localizations_dkbjN5eHuie1_fkey" FOREIGN KEY ("card_id") REFERENCES "shadowverse"."card_evolutions"("card_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "shadowverse"."card_styles" ADD CONSTRAINT "card_styles_card_id_cards_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "shadowverse"."cards"("card_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "shadowverse"."card_style_localizations" ADD CONSTRAINT "card_style_localizations_card_style_fk" FOREIGN KEY ("card_id","style_index") REFERENCES "shadowverse"."card_styles"("card_id","style_index") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "shadowverse"."card_relations" ADD CONSTRAINT "card_relations_card_id_cards_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "shadowverse"."cards"("card_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "shadowverse_data"."import_failures" ADD CONSTRAINT "import_failures_batch_id_import_batches_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "shadowverse_data"."import_batches"("id");--> statement-breakpoint
ALTER TABLE "shadowverse_data"."import_states" ADD CONSTRAINT "import_states_last_successful_batch_id_import_batches_id_fkey" FOREIGN KEY ("last_successful_batch_id") REFERENCES "shadowverse_data"."import_batches"("id");--> statement-breakpoint
ALTER TABLE "shadowverse_data"."image_assets" ADD CONSTRAINT "image_assets_card_id_cards_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "shadowverse"."cards"("card_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "shadowverse_data"."image_import_failures" ADD CONSTRAINT "image_import_failures_batch_id_image_import_batches_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "shadowverse_data"."image_import_batches"("id");