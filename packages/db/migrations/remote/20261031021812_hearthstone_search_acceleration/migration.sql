CREATE TABLE "hearthstone"."search_cards" (
	"card_id" text PRIMARY KEY,
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
	"collectible" boolean NOT NULL,
	"elite" boolean NOT NULL,
	"rarity" text,
	"ambit" "ambit" NOT NULL,
	"legalities" jsonb NOT NULL,
	"tech_level" integer,
	"in_bobs_tavern" boolean NOT NULL,
	"race_bucket" text[],
	"mercenary_role" text,
	"mercenary_faction" text,
	"colddown" integer,
	"simple_tags" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "hearthstone"."search_card_localizations" (
	"card_id" text,
	"lang" "hearthstone"."locale",
	"name" text NOT NULL,
	"text" text NOT NULL,
	"render_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "search_card_localizations_pkey" PRIMARY KEY("card_id","lang")
);
--> statement-breakpoint
CREATE INDEX "search_cards_cost_idx" ON "hearthstone"."search_cards" ("cost");--> statement-breakpoint
CREATE INDEX "search_cards_class_gin_idx" ON "hearthstone"."search_cards" USING gin ("class");--> statement-breakpoint
CREATE INDEX "search_cards_in_tavern_idx" ON "hearthstone"."search_cards" ("card_id") WHERE "in_bobs_tavern";