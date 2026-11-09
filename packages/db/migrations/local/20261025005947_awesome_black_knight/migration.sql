ALTER TYPE "task_run_status" ADD VALUE 'interrupted';--> statement-breakpoint
DROP INDEX "task_runs_active_task_type_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "task_runs_active_task_type_uq" ON "task_runs" ("task_type") WHERE "status" in ('pending', 'running', 'pausing', 'paused', 'resuming', 'canceling', 'interrupted');