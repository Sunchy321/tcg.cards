CREATE TABLE "magic_data"."set_display_choices" (
	"set_id" text PRIMARY KEY,
	"symbol_style" text[],
	"double_faced_icon" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "magic"."packs";--> statement-breakpoint
DROP TABLE "magic"."pack_contents";--> statement-breakpoint
DROP TABLE "magic"."booster_sheets";--> statement-breakpoint
DROP TABLE "magic"."booster_sheet_cards";--> statement-breakpoint
ALTER TABLE "magic"."boosters" ADD COLUMN "packs" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "magic"."boosters" ADD COLUMN "sheets" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "magic"."boosters" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "magic"."boosters" ADD PRIMARY KEY ("set_id","booster_id");--> statement-breakpoint
ALTER TABLE "magic"."boosters" ALTER COLUMN "total_weight" SET DEFAULT 0;