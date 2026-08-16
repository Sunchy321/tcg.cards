CREATE TABLE "user_configs" (
	"user_id" text,
	"game_id" text,
	"config" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_configs_pkey" PRIMARY KEY("user_id","game_id")
);
--> statement-breakpoint
CREATE INDEX "user_configs_user_id_idx" ON "user_configs" ("user_id");