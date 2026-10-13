CREATE TYPE "yugioh"."card_name_variant_kind" AS ENUM('official', 'master_duel', 'nwbbs', 'cnocg');--> statement-breakpoint
CREATE TYPE "yugioh"."locale" AS ENUM('zhs', 'ja', 'en');--> statement-breakpoint
CREATE TABLE "yugioh"."card_localizations" (
	"card_id" bigint,
	"locale" "yugioh"."locale",
	"name" text,
	"name_ruby" text,
	"types_text" text,
	"pendulum_description" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "card_localizations_pkey" PRIMARY KEY("card_id","locale")
);
--> statement-breakpoint
CREATE TABLE "yugioh"."card_name_variants" (
	"card_id" bigint,
	"locale" "yugioh"."locale",
	"kind" "yugioh"."card_name_variant_kind",
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "card_name_variants_pkey" PRIMARY KEY("card_id","locale","kind"),
	CONSTRAINT "card_name_variants_name_nonempty_chk" CHECK (length("name") > 0)
);
--> statement-breakpoint
ALTER TABLE "yugioh"."cards" DROP COLUMN "cn_name";--> statement-breakpoint
ALTER TABLE "yugioh"."cards" DROP COLUMN "sc_name";--> statement-breakpoint
ALTER TABLE "yugioh"."cards" DROP COLUMN "md_name";--> statement-breakpoint
ALTER TABLE "yugioh"."cards" DROP COLUMN "nwbbs_name";--> statement-breakpoint
ALTER TABLE "yugioh"."cards" DROP COLUMN "cnocg_name";--> statement-breakpoint
ALTER TABLE "yugioh"."cards" DROP COLUMN "jp_ruby";--> statement-breakpoint
ALTER TABLE "yugioh"."cards" DROP COLUMN "jp_name";--> statement-breakpoint
ALTER TABLE "yugioh"."cards" DROP COLUMN "en_name";--> statement-breakpoint
ALTER TABLE "yugioh"."cards" DROP COLUMN "md_en_name";--> statement-breakpoint
ALTER TABLE "yugioh"."cards" DROP COLUMN "wiki_en_name";--> statement-breakpoint
ALTER TABLE "yugioh"."cards" DROP COLUMN "set_ext";--> statement-breakpoint
ALTER TABLE "yugioh"."cards" DROP COLUMN "types_text";--> statement-breakpoint
ALTER TABLE "yugioh"."cards" DROP COLUMN "pendulum_description";--> statement-breakpoint
ALTER TABLE "yugioh"."cards" DROP COLUMN "description";--> statement-breakpoint
CREATE INDEX "card_localizations_locale_name_idx" ON "yugioh"."card_localizations" ("locale","name");--> statement-breakpoint
CREATE INDEX "card_localizations_deleted_at_idx" ON "yugioh"."card_localizations" ("deleted_at");--> statement-breakpoint
CREATE INDEX "card_name_variants_locale_name_idx" ON "yugioh"."card_name_variants" ("locale","name");--> statement-breakpoint
CREATE INDEX "card_name_variants_deleted_at_idx" ON "yugioh"."card_name_variants" ("deleted_at");--> statement-breakpoint
ALTER TABLE "yugioh"."card_localizations" ADD CONSTRAINT "card_localizations_card_id_cards_id_fkey" FOREIGN KEY ("card_id") REFERENCES "yugioh"."cards"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "yugioh"."card_name_variants" ADD CONSTRAINT "card_name_variants_card_id_cards_id_fkey" FOREIGN KEY ("card_id") REFERENCES "yugioh"."cards"("id") ON DELETE CASCADE;