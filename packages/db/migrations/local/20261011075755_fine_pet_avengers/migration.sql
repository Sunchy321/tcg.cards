CREATE TABLE "magic_data"."card_ambit_overrides" (
	"card_id" text PRIMARY KEY,
	"ambit" "ambit" NOT NULL,
	"reason" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
