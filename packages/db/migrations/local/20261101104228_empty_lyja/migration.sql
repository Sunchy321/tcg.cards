CREATE TABLE "search_publication_metadata" (
	"game" text PRIMARY KEY,
	"data_version" text NOT NULL,
	"pg_fingerprint" text NOT NULL,
	"release_hash" text,
	"schema_version" integer NOT NULL,
	"ready" boolean DEFAULT false NOT NULL,
	"planner_metadata" jsonb DEFAULT '{}' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "search_publication_metadata_game_chk" CHECK ("game" IN ('magic', 'hearthstone')),
	CONSTRAINT "search_publication_metadata_schema_version_chk" CHECK ("schema_version" > 0)
);
