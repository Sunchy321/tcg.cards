CREATE TYPE "task_control_request_kind" AS ENUM('pause', 'resume', 'cancel');--> statement-breakpoint
CREATE TYPE "task_progress_mode" AS ENUM('bounded', 'unbound', 'simple');--> statement-breakpoint
CREATE TYPE "task_resume_mode" AS ENUM('none', 'durable', 'session_bound');--> statement-breakpoint
CREATE TYPE "task_run_status" AS ENUM('pending', 'running', 'pausing', 'paused', 'resuming', 'canceling', 'canceled', 'failed', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "task_stage_status" AS ENUM('pending', 'running', 'paused', 'canceled', 'failed', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "task_terminal_reason" AS ENUM('execution_failed', 'resume_incompatible', 'resume_context_lost', 'schedule_exhausted', 'manual_cancel', 'system_cancel', 'abandoned_stale_run');--> statement-breakpoint
ALTER TYPE "publish_batch_status" ADD VALUE 'paused' BEFORE 'completed';--> statement-breakpoint
ALTER TYPE "publish_batch_status" ADD VALUE 'stopped' BEFORE 'completed';--> statement-breakpoint
CREATE TABLE "task_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"task_type" text NOT NULL,
	"definition_version" text NOT NULL,
	"task_scope_type" text NOT NULL,
	"task_scope_key" text NOT NULL,
	"task_scope_snapshot" jsonb,
	"status" "task_run_status" DEFAULT 'pending'::"task_run_status" NOT NULL,
	"params" jsonb DEFAULT '{}' NOT NULL,
	"supports_resume" boolean DEFAULT false NOT NULL,
	"current_stage_key" text,
	"current_stage_index" integer,
	"current_resume_mode" "task_resume_mode",
	"paused_resume_mode" "task_resume_mode",
	"selection_anchor" jsonb,
	"resume_token" jsonb,
	"runtime_boot_id" text,
	"resume_context_key" text,
	"run_revision" integer DEFAULT 0 NOT NULL,
	"control_request_kind" "task_control_request_kind",
	"heartbeat_at" timestamp,
	"started_at" timestamp,
	"finished_at" timestamp,
	"error_code" text,
	"error_message" text,
	"terminal_reason" "task_terminal_reason",
	"retry_of_task_run_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "task_runs_retry_of_not_self_chk" CHECK ("retry_of_task_run_id" is null or "retry_of_task_run_id" <> "id"),
	CONSTRAINT "task_runs_current_stage_index_nonnegative_chk" CHECK ("current_stage_index" is null or "current_stage_index" >= 0),
	CONSTRAINT "task_runs_run_revision_nonnegative_chk" CHECK ("run_revision" >= 0),
	CONSTRAINT "task_runs_terminal_reason_required_chk" CHECK ("status" = 'completed' or "terminal_reason" is not null),
	CONSTRAINT "task_runs_finished_at_terminal_only_chk" CHECK ("finished_at" is null or "status" in ('canceled', 'failed', 'completed', 'abandoned')),
	CONSTRAINT "task_runs_terminal_stage_fields_empty_chk" CHECK ("status" not in ('canceled', 'failed', 'completed', 'abandoned')
      or ("current_stage_key" is null and "current_stage_index" is null and "current_resume_mode" is null)),
	CONSTRAINT "task_runs_session_bound_resume_fields_chk" CHECK ("paused_resume_mode" = 'session_bound'
      or ("runtime_boot_id" is null and "resume_context_key" is null)),
	CONSTRAINT "task_runs_session_bound_resume_fields_required_chk" CHECK ("paused_resume_mode" <> 'session_bound'
      or ("runtime_boot_id" is not null and "resume_context_key" is not null)),
	CONSTRAINT "task_runs_paused_resume_fields_scope_chk" CHECK ("status" in ('paused', 'resuming')
      or ("paused_resume_mode" is null and "runtime_boot_id" is null and "resume_context_key" is null))
);
--> statement-breakpoint
CREATE TABLE "task_stages" (
	"task_run_id" uuid NOT NULL,
	"stage_key" text NOT NULL,
	"stage_index" integer NOT NULL,
	"status" "task_stage_status" DEFAULT 'pending'::"task_stage_status" NOT NULL,
	"label" text NOT NULL,
	"progress_mode" "task_progress_mode" NOT NULL,
	"resume_mode" "task_resume_mode" DEFAULT 'none'::"task_resume_mode" NOT NULL,
	"total" integer,
	"done" integer,
	"resume_token" jsonb,
	"selection_anchor" jsonb,
	"started_at" timestamp,
	"finished_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "task_stages_stage_index_nonnegative_chk" CHECK ("stage_index" >= 0),
	CONSTRAINT "task_stages_total_nonnegative_chk" CHECK ("total" is null or "total" >= 0),
	CONSTRAINT "task_stages_done_nonnegative_chk" CHECK ("done" is null or "done" >= 0),
	CONSTRAINT "task_stages_bounded_requires_total_done_chk" CHECK ("progress_mode" <> 'bounded' or ("total" is not null and "done" is not null)),
	CONSTRAINT "task_stages_unbound_requires_done_chk" CHECK ("progress_mode" <> 'unbound' or "done" is not null),
	CONSTRAINT "task_stages_simple_omits_counts_chk" CHECK ("progress_mode" <> 'simple' or ("total" is null and "done" is null)),
	CONSTRAINT "task_stages_bounded_done_not_over_total_chk" CHECK ("progress_mode" <> 'bounded' or "done" <= "total")
);
--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ALTER COLUMN "operation_kind" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ALTER COLUMN "operation_kind" DROP DEFAULT;--> statement-breakpoint
DROP TYPE "publish_operation_kind";--> statement-breakpoint
CREATE TYPE "publish_operation_kind" AS ENUM('publish', 'repair', 'rollback', 'reanchor');--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ALTER COLUMN "operation_kind" SET DATA TYPE "publish_operation_kind" USING "operation_kind"::"publish_operation_kind";--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ALTER COLUMN "operation_kind" SET DEFAULT 'publish'::"publish_operation_kind";--> statement-breakpoint
CREATE UNIQUE INDEX "task_runs_active_task_type_uq" ON "task_runs" ("task_type") WHERE "status" in ('pending', 'running', 'pausing', 'paused', 'resuming', 'canceling');--> statement-breakpoint
CREATE INDEX "task_runs_status_idx" ON "task_runs" ("status");--> statement-breakpoint
CREATE INDEX "task_runs_scope_idx" ON "task_runs" ("task_scope_type","task_scope_key");--> statement-breakpoint
CREATE INDEX "task_runs_task_type_status_idx" ON "task_runs" ("task_type","status");--> statement-breakpoint
CREATE INDEX "task_runs_heartbeat_at_idx" ON "task_runs" ("heartbeat_at");--> statement-breakpoint
CREATE INDEX "task_runs_retry_of_idx" ON "task_runs" ("retry_of_task_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_stages_task_run_id_stage_key_uq" ON "task_stages" ("task_run_id","stage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "task_stages_task_run_id_stage_index_uq" ON "task_stages" ("task_run_id","stage_index");--> statement-breakpoint
CREATE INDEX "task_stages_task_run_id_status_idx" ON "task_stages" ("task_run_id","status");--> statement-breakpoint
ALTER TABLE "task_runs" ADD CONSTRAINT "task_runs_retry_of_task_run_id_fkey" FOREIGN KEY ("retry_of_task_run_id") REFERENCES "task_runs"("id");--> statement-breakpoint
ALTER TABLE "task_stages" ADD CONSTRAINT "task_stages_task_run_id_task_runs_id_fkey" FOREIGN KEY ("task_run_id") REFERENCES "task_runs"("id") ON DELETE CASCADE;