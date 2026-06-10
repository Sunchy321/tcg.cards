CREATE TABLE "hearthstone_data"."push_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"stream" text NOT NULL,
	"consumer" text NOT NULL,
	"status" text NOT NULL,
	"pushed_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"blocked_reason" text,
	"blocked_message" text,
	"blocked_sequence" bigint,
	"started_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "push_batches_stream_consumer_idx" ON "hearthstone_data"."push_batches" ("stream","consumer");--> statement-breakpoint
CREATE INDEX "push_batches_created_at_idx" ON "hearthstone_data"."push_batches" ("created_at");