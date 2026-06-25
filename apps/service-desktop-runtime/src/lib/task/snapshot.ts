import type { TaskPageSnapshot, TaskStage, TaskRunStatus } from '@tcg-cards/model/src/task';

import type { TaskRunSnapshot } from './store';

/** Builds one idle page snapshot placeholder. */
export function createIdleTaskPageSnapshot(): TaskPageSnapshot {
  return {
    pageTask: { kind: 'idle' },
    stages: [],
  };
}

/** Statuses that are displayed as an attached page task. */
const attachedStatuses: TaskRunStatus[] = [
  'pending',
  'running',
  'pausing',
  'paused',
  'resuming',
  'canceling',
  'completed',
  'failed',
  'canceled',
  'abandoned',
];

/** Determines whether the current run status supports cancel. */
function canCancelStatus(status: TaskRunStatus): boolean {
  return ['pending', 'running', 'pausing', 'paused', 'resuming'].includes(status);
}

/** Determines whether the current run status supports pause. */
function canPauseStatus(snapshot: TaskRunSnapshot): boolean {
  return snapshot.run.status === 'running' && snapshot.run.supportsResume;
}

/** Determines whether the current run status supports resume. */
function canResumeStatus(status: TaskRunStatus): boolean {
  return status === 'paused';
}

/** Builds one generic page-task from a framework task-run snapshot. */
function buildPageTask(snapshot: TaskRunSnapshot): TaskPageSnapshot['pageTask'] {
  const { run } = snapshot;

  if (!attachedStatuses.includes(run.status)) {
    return { kind: 'idle' };
  }

  const currentStage = snapshot.stages.find(
    s => s.stageKey === run.currentStageKey && s.stageIndex === run.currentStageIndex,
  );

  return {
    kind: 'attached',
    taskRunId: run.id,
    runRevision: run.runRevision,
    taskType: run.taskType,
    taskScopeType: run.scope.type,
    taskScopeKey: run.scope.key,
    taskScopeSnapshot: run.scope.snapshot,
    status: run.status,
    supportsResume: run.supportsResume,
    currentStageKey: run.currentStageKey,
    currentStageIndex: run.currentStageIndex,
    currentResumeMode: run.currentResumeMode,
    pausedResumeMode: run.pausedResumeMode,
    progressMode: currentStage?.progressMode ?? null,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    terminalReason: run.terminalReason,
    canPause: canPauseStatus(snapshot),
    canResume: canResumeStatus(run.status),
    canCancel: canCancelStatus(run.status),
  };
}

/** Converts one framework stage state to the model TaskStage type. */
function toTaskStageModel(stage: TaskRunSnapshot['stages'][number]): TaskStage {
  return {
    stageKey: stage.stageKey,
    stageIndex: stage.stageIndex,
    label: stage.label,
    status: stage.status,
    progressMode: stage.progressMode,
    resumeMode: stage.resumeMode,
    total: stage.total,
    done: stage.done,
    startedAt: stage.startedAt,
    finishedAt: stage.finishedAt,
  };
}

/** Builds one full page snapshot from a framework task-run snapshot. */
export function buildTaskPageSnapshot(snapshot: TaskRunSnapshot): TaskPageSnapshot {
  return {
    pageTask: buildPageTask(snapshot),
    stages: snapshot.stages.map(toTaskStageModel),
  };
}
