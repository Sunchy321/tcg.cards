import type { TaskControlRequestKind, TaskResumeMode, TaskRunStatus, TaskScope, TaskTerminalReason } from '@tcg-cards/model/src/task';

import type { TaskRunInput, TaskStagePlan, TaskStageState } from './definition';

/** Captures one task run snapshot returned by the framework store. */
export interface TaskRunRecord extends TaskRunInput {
  id: string;
  status: TaskRunStatus;
  supportsResume: boolean;
  currentStageKey: string | null;
  currentStageIndex: number | null;
  currentResumeMode: TaskResumeMode | null;
  pausedResumeMode: TaskResumeMode | null;
  runRevision: number;
  heartbeatAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  terminalReason: TaskTerminalReason | null;
  controlRequestKind: TaskControlRequestKind | null;
}

/** Aggregates one task run snapshot together with all persisted stage rows. */
export interface TaskRunSnapshot {
  run: TaskRunRecord;
  stages: TaskStageState[];
}

/** Carries the create-time payload persisted by the framework store. */
export interface TaskRunCreateInput {
  run: TaskRunInput;
  supportsResume: boolean;
  stages: TaskStagePlan[];
}

/** Defines the persistence contract consumed by the task framework. */
export interface TaskStore {
  createTaskRun(input: TaskRunCreateInput): Promise<TaskRunSnapshot>;
  getTaskRun(taskRunId: string): Promise<TaskRunSnapshot | null>;
  listPendingTaskRuns(): Promise<TaskRunRecord[]>;
  listResumingTaskRuns(): Promise<TaskRunRecord[]>;
  listActiveTaskRuns(): Promise<TaskRunRecord[]>;
}

/** Builds one not-yet-implemented task store placeholder for the next step. */
export function createTaskStore(): TaskStore {
  throw new Error('Task store is not implemented yet');
}
