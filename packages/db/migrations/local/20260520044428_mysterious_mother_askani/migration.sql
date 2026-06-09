CREATE TABLE "hearthstone_data"."field_commits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"sequence" bigserial,
	"entity_type" text NOT NULL,
	"entity_key" jsonb NOT NULL,
	"field_path" text NOT NULL,
	"value" jsonb,
	"operation" text NOT NULL,
	"commit_kind" text NOT NULL,
	"client_mutation_id" text NOT NULL,
	"editor_runtime" text NOT NULL,
	"editor_identity" text,
	"expected_row_revision" text NOT NULL,
	"expected_winner_revision" text,
	"base_revision" text NOT NULL,
	"review_status" text NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"review_reason" text,
	"projection_status" text NOT NULL,
	"sync_status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"projected_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."field_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"processing_side" text NOT NULL,
	"processing_stage" text NOT NULL,
	"conflict_kind" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_key" jsonb NOT NULL,
	"field_path" text NOT NULL,
	"source_summary" jsonb NOT NULL,
	"candidate_base_value" jsonb,
	"local_value" jsonb,
	"incoming_value" jsonb,
	"effective_value" jsonb,
	"winner_value" jsonb,
	"base_revision" text NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"resolution" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."field_winners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"entity_type" text NOT NULL,
	"entity_key" jsonb NOT NULL,
	"field_path" text NOT NULL,
	"winner_value" jsonb,
	"winner_source" text,
	"status" text DEFAULT 'active' NOT NULL,
	"source_runtime" text NOT NULL,
	"updated_by" text,
	"base_revision" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"cleared_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."field_sync_cursors" (
	"consumer" text,
	"stream" text,
	"last_pulled_sequence" bigint DEFAULT 0 NOT NULL,
	"last_pushed_sequence" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "field_sync_cursors_pkey" PRIMARY KEY("consumer","stream")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "field_commits_client_mutation_id_uq" ON "hearthstone_data"."field_commits" ("client_mutation_id");--> statement-breakpoint
CREATE INDEX "field_commits_sequence_idx" ON "hearthstone_data"."field_commits" ("sequence");--> statement-breakpoint
CREATE INDEX "field_commits_entity_field_sequence_idx" ON "hearthstone_data"."field_commits" ("entity_type","entity_key","field_path","sequence");--> statement-breakpoint
CREATE INDEX "field_commits_review_projection_created_at_idx" ON "hearthstone_data"."field_commits" ("review_status","projection_status","created_at");--> statement-breakpoint
CREATE INDEX "field_conflicts_side_stage_status_created_at_idx" ON "hearthstone_data"."field_conflicts" ("processing_side","processing_stage","status","created_at");--> statement-breakpoint
CREATE INDEX "field_conflicts_entity_field_status_idx" ON "hearthstone_data"."field_conflicts" ("entity_type","entity_key","field_path","status");--> statement-breakpoint
CREATE UNIQUE INDEX "field_winners_active_entity_field_uq" ON "hearthstone_data"."field_winners" ("entity_type","entity_key","field_path") WHERE "status" = 'active';--> statement-breakpoint
CREATE INDEX "field_winners_entity_field_idx" ON "hearthstone_data"."field_winners" ("entity_type","entity_key","field_path");--> statement-breakpoint
CREATE INDEX "field_winners_entity_status_idx" ON "hearthstone_data"."field_winners" ("entity_type","entity_key","status");--> statement-breakpoint
CREATE INDEX "field_winners_field_status_idx" ON "hearthstone_data"."field_winners" ("entity_type","field_path","status");--> statement-breakpoint
CREATE INDEX "field_winners_updated_at_idx" ON "hearthstone_data"."field_winners" ("updated_at");