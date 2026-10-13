CREATE TABLE "yugioh_data"."cnocg_cards" (
	"cid" bigint PRIMARY KEY,
	"url" text,
	"data" jsonb,
	"cache_days" integer DEFAULT 7 NOT NULL,
	"content_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
