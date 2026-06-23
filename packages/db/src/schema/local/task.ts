import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/** Runtime-wide lifecycle states tracked on one heavy task run snapshot. */
export const taskRunStatus = pgEnum('task_run_status', [
  'pending',
  'running',
  'pausing',
  'paused',
  'resuming',
  'canceling',
  'canceled',
  'failed',
  'completed',
  'abandoned',
]);

/** Stage-local lifecycle states tracked on one heavy task stage snapshot. */
export const taskStageStatus = pgEnum('task_stage_status', [
  'pending',
  'running',
  'paused',
  'canceled',
  'failed',
  'completed',
  'abandoned',
]);

/** Cooperative control intents that may still be waiting to settle. */
export const taskControlRequestKind = pgEnum('task_control_request_kind', [
  'pause',
  'resume',
  'cancel',
]);

/** Resume contracts declared by one task stage or paused boundary. */
export const taskResumeMode = pgEnum('task_resume_mode', [
  'none',
  'durable',
  'session_bound',
]);

/** Progress representations exposed for one heavy task stage. */
export const taskProgressMode = pgEnum('task_progress_mode', [
  'bounded',
  'unbound',
  'simple',
]);

/** Stable terminal reason codes emitted by the heavy task framework. */
export const taskTerminalReason = pgEnum('task_terminal_reason', [
  'execution_failed',
  'resume_incompatible',
  'resume_context_lost',
  'schedule_exhausted',
  'manual_cancel',
  'system_cancel',
  'abandoned_stale_run',
]);

/** Task-wide runtime snapshot stored in the local runtime public schema. */
export const TaskRun = pgTable('task_runs', {
  id: uuid('id').primaryKey().defaultRandom(),

  taskType:           text('task_type').notNull(),
  definitionVersion:  text('definition_version').notNull(),
  taskScopeType:      text('task_scope_type').notNull(),
  taskScopeKey:       text('task_scope_key').notNull(),
  taskScopeSnapshot:  jsonb('task_scope_snapshot').$type<Record<string, unknown>>(),
  status:             taskRunStatus('status').notNull().default('pending'),
  params:             jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
  supportsResume:     boolean('supports_resume').notNull().default(false),
  currentStageKey:    text('current_stage_key'),
  currentStageIndex:  integer('current_stage_index'),
  currentResumeMode:  taskResumeMode('current_resume_mode'),
  pausedResumeMode:   taskResumeMode('paused_resume_mode'),
  selectionAnchor:    jsonb('selection_anchor').$type<Record<string, unknown>>(),
  resumeToken:        jsonb('resume_token').$type<Record<string, unknown>>(),
  runtimeBootId:      text('runtime_boot_id'),
  resumeContextKey:   text('resume_context_key'),
  runRevision:        integer('run_revision').notNull().default(0),
  controlRequestKind: taskControlRequestKind('control_request_kind'),
  heartbeatAt:        timestamp('heartbeat_at'),
  startedAt:          timestamp('started_at'),
  finishedAt:         timestamp('finished_at'),
  errorCode:          text('error_code'),
  errorMessage:       text('error_message'),
  terminalReason:     taskTerminalReason('terminal_reason'),
  retryOfTaskRunId:   uuid('retry_of_task_run_id'),
  createdAt:          timestamp('created_at').defaultNow().notNull(),
  updatedAt:          timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  foreignKey({
    columns:        [table.retryOfTaskRunId],
    foreignColumns: [table.id],
    name:           'task_runs_retry_of_task_run_id_fkey',
  }),
  uniqueIndex('task_runs_active_task_type_uq')
    .on(table.taskType)
    .where(sql`${table.status} in ('pending', 'running', 'pausing', 'paused', 'resuming', 'canceling')`),
  index('task_runs_status_idx').on(table.status),
  index('task_runs_scope_idx').on(table.taskScopeType, table.taskScopeKey),
  index('task_runs_task_type_status_idx').on(table.taskType, table.status),
  index('task_runs_heartbeat_at_idx').on(table.heartbeatAt),
  index('task_runs_retry_of_idx').on(table.retryOfTaskRunId),
  check(
    'task_runs_retry_of_not_self_chk',
    sql`${table.retryOfTaskRunId} is null or ${table.retryOfTaskRunId} <> ${table.id}`,
  ),
  check(
    'task_runs_current_stage_index_nonnegative_chk',
    sql`${table.currentStageIndex} is null or ${table.currentStageIndex} >= 0`,
  ),
  check(
    'task_runs_run_revision_nonnegative_chk',
    sql`${table.runRevision} >= 0`,
  ),
  check(
    'task_runs_terminal_reason_required_chk',
    sql`${table.status} not in ('canceled', 'failed', 'abandoned') or ${table.terminalReason} is not null`,
  ),
  check(
    'task_runs_finished_at_terminal_only_chk',
    sql`${table.finishedAt} is null or ${table.status} in ('canceled', 'failed', 'completed', 'abandoned')`,
  ),
  check(
    'task_runs_terminal_stage_fields_empty_chk',
    sql`${table.status} not in ('canceled', 'failed', 'completed', 'abandoned')
      or (${table.currentStageKey} is null and ${table.currentStageIndex} is null and ${table.currentResumeMode} is null)`,
  ),
  check(
    'task_runs_session_bound_resume_fields_chk',
    sql`${table.pausedResumeMode} = 'session_bound'
      or (${table.runtimeBootId} is null and ${table.resumeContextKey} is null)`,
  ),
  check(
    'task_runs_session_bound_resume_fields_required_chk',
    sql`${table.pausedResumeMode} <> 'session_bound'
      or (${table.runtimeBootId} is not null and ${table.resumeContextKey} is not null)`,
  ),
  check(
    'task_runs_paused_resume_fields_scope_chk',
    sql`${table.status} in ('paused', 'resuming')
      or (${table.pausedResumeMode} is null and ${table.runtimeBootId} is null and ${table.resumeContextKey} is null)`,
  ),
]);

/** Stage-wide progress snapshot stored alongside one heavy task run. */
export const TaskStage = pgTable('task_stages', {
  taskRunId: uuid('task_run_id')
    .notNull()
    .references(() => TaskRun.id, { onDelete: 'cascade' }),
  stageKey:        text('stage_key').notNull(),
  stageIndex:      integer('stage_index').notNull(),
  status:          taskStageStatus('status').notNull().default('pending'),
  label:           text('label').notNull(),
  progressMode:    taskProgressMode('progress_mode').notNull(),
  resumeMode:      taskResumeMode('resume_mode').notNull().default('none'),
  total:           integer('total'),
  done:            integer('done'),
  resumeToken:     jsonb('resume_token').$type<Record<string, unknown>>(),
  selectionAnchor: jsonb('selection_anchor').$type<Record<string, unknown>>(),
  startedAt:       timestamp('started_at'),
  finishedAt:      timestamp('finished_at'),
  updatedAt:       timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  uniqueIndex('task_stages_task_run_id_stage_key_uq').on(table.taskRunId, table.stageKey),
  uniqueIndex('task_stages_task_run_id_stage_index_uq').on(table.taskRunId, table.stageIndex),
  index('task_stages_task_run_id_status_idx').on(table.taskRunId, table.status),
  check('task_stages_stage_index_nonnegative_chk', sql`${table.stageIndex} >= 0`),
  check(
    'task_stages_total_nonnegative_chk',
    sql`${table.total} is null or ${table.total} >= 0`,
  ),
  check(
    'task_stages_done_nonnegative_chk',
    sql`${table.done} is null or ${table.done} >= 0`,
  ),
  check(
    'task_stages_bounded_requires_total_done_chk',
    sql`${table.progressMode} <> 'bounded' or ${table.status} = 'pending' or (${table.total} is not null and ${table.done} is not null)`,
  ),
  check(
    'task_stages_unbound_requires_done_chk',
    sql`${table.progressMode} <> 'unbound' or ${table.done} is not null`,
  ),
  check(
    'task_stages_simple_omits_counts_chk',
    sql`${table.progressMode} <> 'simple' or (${table.total} is null and ${table.done} is null)`,
  ),
  check(
    'task_stages_bounded_done_not_over_total_chk',
    sql`${table.progressMode} <> 'bounded' or ${table.done} <= ${table.total}`,
  ),
]);
