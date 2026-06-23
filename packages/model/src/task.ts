import { z } from 'zod';

const jsonRecord = z.record(z.string(), z.unknown());

export const taskRunStatus = z.enum([
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

export const taskStageStatus = z.enum([
  'pending',
  'running',
  'paused',
  'canceled',
  'failed',
  'completed',
  'abandoned',
]);

export const taskControlRequestKind = z.enum([
  'pause',
  'resume',
  'cancel',
]);

export const taskProgressMode = z.enum([
  'bounded',
  'unbound',
  'simple',
]);

export const taskResumeMode = z.enum([
  'none',
  'durable',
  'session_bound',
]);

export const taskTerminalReason = z.enum([
  'execution_failed',
  'resume_incompatible',
  'resume_context_lost',
  'schedule_exhausted',
  'manual_cancel',
  'system_cancel',
  'abandoned_stale_run',
]);

export const taskScope = z.strictObject({
  taskScopeType: z.string().trim().min(1),
  taskScopeKey: z.string().trim().min(1),
  taskScopeSnapshot: jsonRecord.optional(),
});

export const segmentsItem = z.strictObject({
  name: z.string(),
  done: z.int().nonnegative(),
  total: z.int().nonnegative(),
});

export const taskStage = z.strictObject({
  stageKey: z.string().trim().min(1),
  stageIndex: z.int().nonnegative(),
  label: z.string(),
  status: taskStageStatus,
  progressMode: taskProgressMode,
  resumeMode: taskResumeMode,
  total: z.int().nonnegative().nullable(),
  done: z.int().nonnegative().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  segments: z.array(segmentsItem).optional(),
});

export const taskControlResult = z.strictObject({
  taskRunId: z.uuid(),
  runRevision: z.int().nonnegative(),
  status: taskRunStatus,
});

export const taskPageTaskIdle = z.strictObject({
  kind: z.literal('idle'),
});

export const taskPageTaskAttached = z.strictObject({
  kind: z.literal('attached'),
  taskRunId: z.uuid(),
  runRevision: z.int().nonnegative(),
  taskType: z.string().trim().min(1),
  taskScopeType: z.string().trim().min(1),
  taskScopeKey: z.string().trim().min(1),
  taskScopeSnapshot: jsonRecord.optional(),
  status: taskRunStatus,
  supportsResume: z.boolean(),
  currentStageKey: z.string().nullable(),
  currentStageIndex: z.int().nonnegative().nullable(),
  currentResumeMode: taskResumeMode.nullable(),
  pausedResumeMode: taskResumeMode.nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  terminalReason: taskTerminalReason.nullable(),
  canPause: z.boolean(),
  canResume: z.boolean(),
  canCancel: z.boolean(),
});

export const taskPageTaskBlocking = z.strictObject({
  kind: z.literal('blocking'),
  taskRunId: z.uuid(),
  taskType: z.string().trim().min(1),
  taskScopeType: z.string().trim().min(1),
  taskScopeKey: z.string().trim().min(1),
  taskScopeSnapshot: jsonRecord.optional(),
  status: taskRunStatus,
  canCancel: z.boolean(),
});

export const taskPageTask = z.discriminatedUnion('kind', [
  taskPageTaskIdle,
  taskPageTaskAttached,
  taskPageTaskBlocking,
]);

export const taskPageSnapshot = z.strictObject({
  pageTask: taskPageTask,
  stages: z.array(taskStage),
});

export const taskPageEvent = z.strictObject({
  pageTask: taskPageTask,
  stages: z.array(taskStage),
});

export type TaskRunStatus = z.infer<typeof taskRunStatus>;
export type TaskStageStatus = z.infer<typeof taskStageStatus>;
export type TaskControlRequestKind = z.infer<typeof taskControlRequestKind>;
export type TaskProgressMode = z.infer<typeof taskProgressMode>;
export type TaskResumeMode = z.infer<typeof taskResumeMode>;
export type TaskTerminalReason = z.infer<typeof taskTerminalReason>;
export type TaskScope = z.infer<typeof taskScope>;
export type ProgressSegment = z.infer<typeof segmentsItem>;
export type TaskStage = z.infer<typeof taskStage>;
export type TaskControlResult = z.infer<typeof taskControlResult>;
export type TaskPageTask = z.infer<typeof taskPageTask>;
export type TaskPageSnapshot = z.infer<typeof taskPageSnapshot>;
export type TaskPageEvent = z.infer<typeof taskPageEvent>;
