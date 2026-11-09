CREATE TABLE "search_d1_publication_audits" (
	"task_run_id" uuid PRIMARY KEY,
	"game" text NOT NULL,
	"user_id" text NOT NULL,
	"data_version" text NOT NULL,
	"release_hash" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
