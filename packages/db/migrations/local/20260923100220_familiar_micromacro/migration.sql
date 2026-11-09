CREATE TABLE "magic_data"."print_commits" (
	"oracle_id" uuid,
	"set" text,
	"number" text,
	"lang" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"origin" text DEFAULT 'manual' NOT NULL,
	"faces" jsonb,
	"metadata" jsonb,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "print_commits_pkey" PRIMARY KEY("oracle_id","set","number","lang")
);
--> statement-breakpoint
CREATE INDEX "print_commits_status_idx" ON "magic_data"."print_commits" ("status");--> statement-breakpoint
CREATE INDEX "print_commits_set_idx" ON "magic_data"."print_commits" ("set");