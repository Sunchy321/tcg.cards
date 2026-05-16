CREATE TABLE "hearthstone_data"."hsdata_import_job_workspace_snapshots" (
	"job_id" uuid,
	"chunk_index" integer NOT NULL,
	"card_id" text,
	"snapshot_id" uuid NOT NULL,
	"snapshot_hash" text NOT NULL,
	"is_new_snapshot" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hsdata_import_job_workspace_snapshots_pkey" PRIMARY KEY("job_id","card_id"),
	CONSTRAINT "hsdata_import_job_workspace_snapshots_chunk_index_nonnegative_chk" CHECK ("chunk_index" >= 0)
);
--> statement-breakpoint
DROP TABLE "hearthstone_data"."hsdata_import_job_chunks";--> statement-breakpoint
DROP TABLE "hearthstone_data"."hsdata_import_job_snapshots";--> statement-breakpoint
CREATE INDEX "hsdata_import_job_workspace_snapshots_job_id_chunk_index_idx" ON "hearthstone_data"."hsdata_import_job_workspace_snapshots" ("job_id","chunk_index");--> statement-breakpoint
CREATE INDEX "hsdata_import_job_workspace_snapshots_job_id_snapshot_id_idx" ON "hearthstone_data"."hsdata_import_job_workspace_snapshots" ("job_id","snapshot_id");--> statement-breakpoint
CREATE INDEX "hsdata_import_job_workspace_snapshots_job_id_snapshot_hash_idx" ON "hearthstone_data"."hsdata_import_job_workspace_snapshots" ("job_id","snapshot_hash");--> statement-breakpoint
ALTER TABLE "hearthstone_data"."hsdata_import_job_workspace_snapshots" ADD CONSTRAINT "hsdata_import_job_workspace_snapshots_jmvJqKhHgjfy_fkey" FOREIGN KEY ("job_id") REFERENCES "hearthstone_data"."hsdata_import_jobs"("id") ON DELETE CASCADE;--> statement-breakpoint
DROP TYPE "hearthstone_data"."hsdata_import_chunk_status";