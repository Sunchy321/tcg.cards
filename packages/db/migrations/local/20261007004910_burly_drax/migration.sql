CREATE TABLE "yugioh_data"."neuron_cards" (
	"cid" bigint,
	"locale" text,
	"url" text,
	"data" jsonb,
	"cache_days" integer DEFAULT 7 NOT NULL,
	"content_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "neuron_cards_pkey" PRIMARY KEY("cid","locale")
);
