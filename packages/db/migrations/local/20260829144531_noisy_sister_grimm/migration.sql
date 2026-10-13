ALTER TABLE "magic_data"."mtgch_zhs_card" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "magic_data"."mtgch_zhs_card" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "magic_data"."mtgch_zhs_flavor" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "magic_data"."mtgch_zhs_flavor" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "magic_data"."mtgch_zhs_oracle" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "magic_data"."mtgch_zhs_oracle" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "magic_data"."mtgch_zhs_ruling" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "magic_data"."mtgch_zhs_ruling" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "magic_data"."mtgch_zhs_set" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "magic_data"."mtgch_zhs_set" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "magic_data"."mtgch_zhs_type" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "magic_data"."mtgch_zhs_type" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "magic_data"."mtgjson_sets" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "magic_data"."mtgjson_sets" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "magic_data"."scryfall_cards" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "magic_data"."scryfall_cards" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "magic_data"."scryfall_rulings" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "magic_data"."scryfall_rulings" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "magic_data"."scryfall_sets" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "magic_data"."scryfall_sets" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "magic_data"."mtgch_zhs_card" DROP COLUMN "expires_at";--> statement-breakpoint
ALTER TABLE "magic_data"."mtgch_zhs_flavor" DROP COLUMN "expires_at";--> statement-breakpoint
ALTER TABLE "magic_data"."mtgch_zhs_oracle" DROP COLUMN "expires_at";--> statement-breakpoint
ALTER TABLE "magic_data"."mtgch_zhs_ruling" DROP COLUMN "expires_at";--> statement-breakpoint
ALTER TABLE "magic_data"."mtgch_zhs_set" DROP COLUMN "expires_at";--> statement-breakpoint
ALTER TABLE "magic_data"."mtgch_zhs_type" DROP COLUMN "expires_at";--> statement-breakpoint
ALTER TABLE "magic_data"."mtgjson_sets" DROP COLUMN "expires_at";--> statement-breakpoint
ALTER TABLE "magic_data"."scryfall_cards" DROP COLUMN "expires_at";--> statement-breakpoint
ALTER TABLE "magic_data"."scryfall_rulings" DROP COLUMN "expires_at";--> statement-breakpoint
ALTER TABLE "magic_data"."scryfall_sets" DROP COLUMN "expires_at";