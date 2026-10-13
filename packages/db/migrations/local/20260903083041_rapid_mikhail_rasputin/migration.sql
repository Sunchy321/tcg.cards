CREATE TABLE "magic_data"."card_slug_resolutions" (
	"slug" text PRIMARY KEY,
	"oracle_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"resolved_to" text[] DEFAULT '{}'::text[] NOT NULL,
	"reason" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."projection_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"kind" text NOT NULL,
	"subject" jsonb NOT NULL,
	"payload" jsonb DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"resolution" jsonb,
	"actor" text,
	"resolved_at" timestamp,
	"handled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "magic_data"."card_slug_annotations";--> statement-breakpoint
DROP TABLE "magic_data"."base_change_review";--> statement-breakpoint
CREATE INDEX "projection_review_kind_status_idx" ON "magic_data"."projection_review" ("kind","status");--> statement-breakpoint
CREATE INDEX "projection_review_subject_idx" ON "magic_data"."projection_review" ("subject");