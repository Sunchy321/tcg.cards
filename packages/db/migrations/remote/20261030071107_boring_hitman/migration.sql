CREATE TABLE "magic"."search_cards" (
	"card_id" text,
	"version" text DEFAULT '',
	"ambit" "ambit" DEFAULT 'full'::"ambit" NOT NULL,
	"mana_value" double precision NOT NULL,
	"color_identity" bit(16) NOT NULL,
	"tags" text[] NOT NULL,
	"legalities" jsonb NOT NULL,
	"candidate_prints_by_locale" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "search_cards_pkey" PRIMARY KEY("card_id","version")
);
--> statement-breakpoint
CREATE TABLE "magic"."search_card_parts" (
	"card_id" text,
	"version" text DEFAULT '',
	"part_index" smallint,
	"part_name" text NOT NULL,
	"part_typeline" text NOT NULL,
	"part_text" text NOT NULL,
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "search_card_parts_pkey" PRIMARY KEY("card_id","version","part_index")
);
--> statement-breakpoint
CREATE TABLE "magic"."search_card_part_localizations" (
	"card_id" text,
	"version" text DEFAULT '',
	"locale" "magic"."locale",
	"source" text DEFAULT '',
	"part_index" smallint,
	"part_loc_name" text NOT NULL,
	"part_loc_typeline" text NOT NULL,
	"part_loc_text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "search_card_part_localizations_pkey" PRIMARY KEY("card_id","version","locale","source","part_index")
);
--> statement-breakpoint
CREATE INDEX "search_cards_mana_value_idx" ON "magic"."search_cards" ("mana_value");--> statement-breakpoint
CREATE INDEX "search_cards_tags_gin_idx" ON "magic"."search_cards" USING gin ("tags");