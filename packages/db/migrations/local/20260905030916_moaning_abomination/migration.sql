CREATE TABLE "magic_data"."publish_baselines" (
	"publish_target" text,
	"environment" text,
	"publish_type" text DEFAULT 'card_data',
	"target_fingerprint" text NOT NULL,
	"batch_id" uuid NOT NULL,
	"generation_fingerprint" text DEFAULT 'magic-card-data/v1' NOT NULL,
	"generation_order" integer DEFAULT 1 NOT NULL,
	"manifest_hash" text NOT NULL,
	"total_row_count" integer NOT NULL,
	"published_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "publish_baselines_pkey" PRIMARY KEY("publish_target","environment","publish_type"),
	CONSTRAINT "publish_baselines_generation_order_positive_chk" CHECK ("generation_order" > 0),
	CONSTRAINT "publish_baselines_total_row_count_nonnegative_chk" CHECK ("total_row_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "magic_data"."publish_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"publish_target" text NOT NULL,
	"environment" text NOT NULL,
	"target_fingerprint" text NOT NULL,
	"publish_type" text DEFAULT 'card_data' NOT NULL,
	"operation_kind" "publish_operation_kind" DEFAULT 'publish'::"publish_operation_kind" NOT NULL,
	"generation_fingerprint" text DEFAULT 'magic-card-data/v1' NOT NULL,
	"generation_order" integer DEFAULT 1 NOT NULL,
	"manifest_hash" text NOT NULL,
	"previous_manifest_hash" text,
	"total_row_count" integer DEFAULT 0 NOT NULL,
	"changed_row_count" integer DEFAULT 0 NOT NULL,
	"inserted_row_count" integer DEFAULT 0 NOT NULL,
	"updated_row_count" integer DEFAULT 0 NOT NULL,
	"deleted_row_count" integer DEFAULT 0 NOT NULL,
	"unchanged_row_count" integer DEFAULT 0 NOT NULL,
	"status" "publish_batch_status" DEFAULT 'planning'::"publish_batch_status" NOT NULL,
	"error" text,
	"summary" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	CONSTRAINT "publish_batches_generation_order_positive_chk" CHECK ("generation_order" > 0),
	CONSTRAINT "publish_batches_total_row_count_nonnegative_chk" CHECK ("total_row_count" >= 0),
	CONSTRAINT "publish_batches_changed_row_count_nonnegative_chk" CHECK ("changed_row_count" >= 0),
	CONSTRAINT "publish_batches_inserted_row_count_nonnegative_chk" CHECK ("inserted_row_count" >= 0),
	CONSTRAINT "publish_batches_updated_row_count_nonnegative_chk" CHECK ("updated_row_count" >= 0),
	CONSTRAINT "publish_batches_deleted_row_count_nonnegative_chk" CHECK ("deleted_row_count" >= 0),
	CONSTRAINT "publish_batches_unchanged_row_count_nonnegative_chk" CHECK ("unchanged_row_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "magic_data"."publish_batch_rows" (
	"batch_id" uuid,
	"table_name" text,
	"row_key" text,
	"row_hash" text NOT NULL,
	"previous_row_hash" text,
	"action" "publish_batch_row_action" NOT NULL,
	"status" "publish_batch_row_status" DEFAULT 'pending'::"publish_batch_row_status" NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"applied_at" timestamp,
	CONSTRAINT "publish_batch_rows_pkey" PRIMARY KEY("batch_id","table_name","row_key")
);
--> statement-breakpoint
CREATE TABLE "magic_data"."publish_row_baselines" (
	"publish_target" text,
	"environment" text,
	"publish_type" text DEFAULT 'card_data',
	"table_name" text,
	"row_key" text,
	"row_hash" text NOT NULL,
	"source_batch_id" uuid,
	"published_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "publish_row_baselines_pkey" PRIMARY KEY("publish_target","environment","publish_type","table_name","row_key")
);
--> statement-breakpoint
CREATE INDEX "publish_baselines_batch_id_idx" ON "magic_data"."publish_baselines" ("batch_id");--> statement-breakpoint
CREATE INDEX "publish_batches_stream_status_idx" ON "magic_data"."publish_batches" ("publish_target","environment","publish_type","status");--> statement-breakpoint
CREATE INDEX "publish_batches_created_at_idx" ON "magic_data"."publish_batches" ("created_at");--> statement-breakpoint
CREATE INDEX "publish_batches_manifest_hash_idx" ON "magic_data"."publish_batches" ("manifest_hash");--> statement-breakpoint
CREATE INDEX "publish_batch_rows_batch_action_idx" ON "magic_data"."publish_batch_rows" ("batch_id","action");--> statement-breakpoint
CREATE INDEX "publish_batch_rows_batch_status_idx" ON "magic_data"."publish_batch_rows" ("batch_id","status");--> statement-breakpoint
CREATE INDEX "publish_batch_rows_batch_table_idx" ON "magic_data"."publish_batch_rows" ("batch_id","table_name");--> statement-breakpoint
CREATE INDEX "publish_row_baselines_stream_idx" ON "magic_data"."publish_row_baselines" ("publish_target","environment","publish_type");--> statement-breakpoint
CREATE INDEX "publish_row_baselines_source_batch_idx" ON "magic_data"."publish_row_baselines" ("source_batch_id");--> statement-breakpoint
ALTER TABLE "magic_data"."publish_baselines" ADD CONSTRAINT "publish_baselines_batch_id_publish_batches_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "magic_data"."publish_batches"("id");--> statement-breakpoint
ALTER TABLE "magic_data"."publish_batch_rows" ADD CONSTRAINT "publish_batch_rows_batch_id_publish_batches_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "magic_data"."publish_batches"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "magic_data"."publish_row_baselines" ADD CONSTRAINT "publish_row_baselines_source_batch_id_publish_batches_id_fkey" FOREIGN KEY ("source_batch_id") REFERENCES "magic_data"."publish_batches"("id");