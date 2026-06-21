import { randomUUID } from 'node:crypto';

import type { PublishTaskCreateInput, PublishTaskParams } from '@tcg-cards/model/src/task-publish';
import type { TaskControlResult, TaskPageEvent, TaskPageSnapshot, TaskPageTask, TaskStage } from '@tcg-cards/model/src/task';

import { publishStreamKey } from '@tcg-cards/model/src/game-data-sync';

import {
  PublishJobInterruptedError,
  type PublishJobProgressEvent,
} from '../hearthstone/hsdata-publish-progress';
import {
  publishCurrentHsdataToRemote,
  publishReport,
  type PublishReport,
} from '../hearthstone/hsdata-publish';

type PublishTaskStatus =
  | 'pending'
  | 'running'
  | 'canceling'
  | 'canceled'
  | 'failed'
  | 'completed';

interface PublishTaskRecord {
  taskRunId: string;
  runRevision: number;
  status: PublishTaskStatus;
  streamKey: string;
  taskType: 'hsdata_publish';
  scope: PublishTaskCreateInput['scope'];
  params: PublishTaskParams;
  progress: PublishJobProgressEvent | null;
  report: PublishReport | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  stopRequested: boolean;
}

const publishTasksById = new Map<string, PublishTaskRecord>();
const publishTaskIdByStreamKey = new Map<string, string>();
const publishTaskSubscribers = new Set<(event: TaskPageEvent) => void>();
const publishTaskRecordSubscribers = new Set<(record: PublishTaskRecord) => void>();

/** Resolves one pending async-generator wake callback when it exists. */
function resolveWake(wake: (() => void) | null): void {
  wake?.();
}

/** Returns whether one publish task still occupies the stream execution slot. */
function isActivePublishTaskStatus(status: PublishTaskStatus): boolean {
  return status === 'pending' || status === 'running' || status === 'canceling';
}

/** Converts one publish-task record into the legacy publish progress payload. */
function toPublishTaskProgressEvent(record: PublishTaskRecord): PublishJobProgressEvent | null {
  if (record.progress != null) {
    return record.progress;
  }

  if (record.status === 'pending') {
    return null;
  }

  const finishedAt = record.finishedAt ?? new Date().toISOString();
  const message = record.errorMessage ?? (
    record.status === 'completed'
      ? 'Publish completed'
      : record.status === 'canceled'
        ? 'Publish stopped'
        : 'Publish failed'
  );
  const phase = record.status === 'completed'
    ? 'completed'
    : record.status === 'canceled'
      ? 'stopped'
      : 'failed';

  return {
    batchId: record.taskRunId,
    publishType: record.scope.publishType,
    publishTarget: `${record.scope.publishTarget}/${record.scope.environment}`,
    phase,
    message,
    startedAt: record.startedAt ?? finishedAt,
    phaseStartedAt: finishedAt,
    finishedAt,
    totalRowCount: null,
    completedRowCount: null,
    report: record.report,
  };
}

function publishTaskStage(record: PublishTaskRecord): TaskStage[] {
  const progress = record.progress;
  const stageKey = progress?.phase ?? (
    record.status === 'pending'
      ? 'pending'
      : record.status === 'completed'
        ? 'completed'
        : record.status === 'failed'
          ? 'failed'
          : 'running'
  );

  return [{
    stageKey,
    stageIndex: 0,
    label: progress?.message ?? 'Publish task',
    status: record.status === 'completed'
      ? 'completed'
      : record.status === 'failed'
        ? 'failed'
        : record.status === 'canceled'
          ? 'canceled'
          : 'running',
    progressMode: 'bounded',
    resumeMode: 'none',
    total: progress?.totalRowCount ?? null,
    done: progress?.completedRowCount ?? null,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
  }];
}

function publishTaskPageTask(record: PublishTaskRecord): TaskPageTask {
  return {
    kind: 'attached',
    taskRunId: record.taskRunId,
    runRevision: record.runRevision,
    taskType: record.taskType,
    taskScopeType: 'publish_stream',
    taskScopeKey: record.scope.publishTarget
      + ':'
      + record.scope.environment
      + ':'
      + record.scope.publishType,
    taskScopeSnapshot: record.scope,
    status: record.status,
    currentStageKey: record.progress?.phase ?? null,
    currentStageIndex: record.progress == null ? null : 0,
    currentResumeMode: null,
    pausedResumeMode: null,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    errorCode: null,
    errorMessage: record.errorMessage,
    terminalReason: record.status === 'canceled'
      ? 'manual_cancel'
      : record.status === 'failed'
        ? 'execution_failed'
        : null,
    canPause: false,
    canResume: false,
    canCancel: record.status === 'pending' || record.status === 'running' || record.status === 'canceling',
  };
}

function publishTaskSnapshot(record: PublishTaskRecord): TaskPageSnapshot {
  return {
    pageTask: publishTaskPageTask(record),
    stages: publishTaskStage(record),
  };
}

function emitPublishTask(record: PublishTaskRecord): void {
  const snapshot = publishTaskSnapshot(record);

  for (const subscriber of publishTaskSubscribers) {
    subscriber(snapshot);
  }

  for (const subscriber of publishTaskRecordSubscribers) {
    subscriber(record);
  }
}

function updatePublishTask(
  taskRunId: string,
  patch: Partial<PublishTaskRecord>,
): PublishTaskRecord {
  const current = publishTasksById.get(taskRunId);

  if (!current) {
    throw new Error(`Publish task ${taskRunId} does not exist`);
  }

  const next = {
    ...current,
    ...patch,
    runRevision: current.runRevision + 1,
  } satisfies PublishTaskRecord;

  publishTasksById.set(taskRunId, next);
  emitPublishTask(next);

  return next;
}

/** Marks one publish task as cancel-requested before the publish coroutine observes it. */
function requestPublishTaskStop(taskRunId: string): PublishTaskRecord {
  const record = publishTasksById.get(taskRunId);

  if (!record) {
    throw new Error(`Publish task ${taskRunId} does not exist`);
  }

  if (!['pending', 'running', 'canceling'].includes(record.status)) {
    throw new Error(`Publish task ${taskRunId} is already ${record.status}`);
  }

  if (record.stopRequested) {
    return record;
  }

  return updatePublishTask(taskRunId, {
    status: 'canceling',
    stopRequested: true,
  });
}

/** Finalizes one publish task into the terminal legacy progress shape expected by the old page. */
function buildTerminalPublishProgress(
  record: PublishTaskRecord,
  input: {
    phase: 'completed' | 'stopped' | 'failed';
    message: string;
    report?: PublishReport | null;
  },
): PublishJobProgressEvent {
  const now = new Date().toISOString();

  return {
    batchId: record.progress?.batchId ?? record.taskRunId,
    publishType: record.scope.publishType,
    publishTarget: `${record.scope.publishTarget}/${record.scope.environment}`,
    phase: input.phase,
    message: input.message,
    startedAt: record.startedAt ?? now,
    phaseStartedAt: now,
    finishedAt: now,
    totalRowCount: record.progress?.totalRowCount ?? input.report?.totalRowCount ?? null,
    completedRowCount: record.progress?.completedRowCount ?? input.report?.totalRowCount ?? null,
    report: input.report ?? null,
  };
}

/** Finds the single active publish task still exposed through the legacy global publish API. */
function getSingleActivePublishTask(): PublishTaskRecord | null {
  const active = [...publishTasksById.values()]
    .filter(record => isActivePublishTaskStatus(record.status));

  if (active.length === 0) {
    return null;
  }

  if (active.length > 1) {
    throw new Error('Multiple active publish tasks exist. Use task-scoped controls instead.');
  }

  return active[0] ?? null;
}

function startPublishTaskExecution(record: PublishTaskRecord): void {
  void (async () => {
    updatePublishTask(record.taskRunId, {
      status: 'running',
      startedAt: new Date().toISOString(),
    });

    try {
      const report = await publishCurrentHsdataToRemote({
        publishType: record.scope.publishType,
        publishTarget: record.scope.publishTarget,
        environment: record.scope.environment,
        dryRun: record.params.dryRun,
        signal: {
          get aborted() {
            return publishTasksById.get(record.taskRunId)?.stopRequested ?? false;
          },
        },
        onProgress(event) {
          updatePublishTask(record.taskRunId, {
            progress: {
              batchId: record.taskRunId,
              publishType: record.scope.publishType,
              publishTarget: `${record.scope.publishTarget}/${record.scope.environment}`,
              phase: event.phase,
              message: event.message,
              startedAt: record.startedAt ?? new Date().toISOString(),
              phaseStartedAt: new Date().toISOString(),
              finishedAt: null,
              totalRowCount: event.totalRowCount ?? null,
              completedRowCount: event.completedRowCount ?? null,
              report: null,
            },
          });
        },
      });

      updatePublishTask(record.taskRunId, {
        status: 'completed',
        report,
        progress: buildTerminalPublishProgress(record, {
          phase: 'completed',
          message: 'Publish completed',
          report,
        }),
        finishedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (error instanceof PublishJobInterruptedError) {
        updatePublishTask(record.taskRunId, {
          status: 'canceled',
          errorMessage: error.message,
          progress: buildTerminalPublishProgress(record, {
            phase: 'stopped',
            message: error.message,
          }),
          finishedAt: new Date().toISOString(),
        });
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      updatePublishTask(record.taskRunId, {
        status: 'failed',
        errorMessage: message,
        progress: buildTerminalPublishProgress(record, {
          phase: 'failed',
          message,
        }),
        finishedAt: new Date().toISOString(),
      });
    }
  })();
}

/** Creates one publish task through the task-framework bridge and starts it immediately. */
export async function createPublishTask(input: PublishTaskCreateInput): Promise<TaskControlResult> {
  const streamKey = publishStreamKey(input.scope);
  const activeTaskRunId = publishTaskIdByStreamKey.get(streamKey);

  if (activeTaskRunId) {
    const active = publishTasksById.get(activeTaskRunId);

    if (active && isActivePublishTaskStatus(active.status)) {
      throw new Error(`Publish task already exists for stream ${streamKey}`);
    }
  }

  const taskRunId = randomUUID();
  const record: PublishTaskRecord = {
    taskRunId,
    runRevision: 0,
    status: 'pending',
    streamKey,
    taskType: 'hsdata_publish',
    scope: input.scope,
    params: input.params,
    progress: null,
    report: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    stopRequested: false,
  };

  publishTasksById.set(taskRunId, record);
  publishTaskIdByStreamKey.set(streamKey, taskRunId);
  emitPublishTask(record);
  startPublishTaskExecution(record);

  return {
    taskRunId,
    runRevision: 0,
    status: 'pending',
  };
}

/** Returns the current publish task snapshot for one stream, or idle when none exists. */
export function getPublishTaskSnapshot(
  scope: PublishTaskCreateInput['scope'],
): TaskPageSnapshot {
  const taskRunId = publishTaskIdByStreamKey.get(publishStreamKey(scope));

  if (!taskRunId) {
    return {
      pageTask: { kind: 'idle' },
      stages: [],
    };
  }

  const record = publishTasksById.get(taskRunId);

  if (!record) {
    return {
      pageTask: { kind: 'idle' },
      stages: [],
    };
  }

  return publishTaskSnapshot(record);
}

/** Cancels one active publish task and returns the current task-level control result. */
export async function cancelPublishTask(taskRunId: string): Promise<TaskControlResult> {
  const record = requestPublishTaskStop(taskRunId);

  return {
    taskRunId: record.taskRunId,
    runRevision: record.runRevision,
    status: record.status,
  };
}

/** Cancels the single active publish task still exposed through the legacy global API. */
export async function stopActivePublishTask(): Promise<{ batchId: string }> {
  const record = getSingleActivePublishTask();

  if (!record) {
    throw new Error('No active publish task exists');
  }

  await cancelPublishTask(record.taskRunId);

  return {
    batchId: record.progress?.batchId ?? record.taskRunId,
  };
}

/** Waits until one publish task reaches a terminal state and returns its final report. */
export async function waitForPublishTask(taskRunId: string): Promise<PublishReport> {
  const current = publishTasksById.get(taskRunId);

  if (!current) {
    throw new Error(`Publish task ${taskRunId} does not exist`);
  }

  if (current.status === 'completed' && current.report != null) {
    return current.report;
  }

  if (current.status === 'canceled' || current.status === 'failed') {
    throw new Error(current.errorMessage ?? `Publish task ${taskRunId} did not complete successfully`);
  }

  return await new Promise<PublishReport>((resolve, reject) => {
    const subscriber = (record: PublishTaskRecord) => {
      if (record.taskRunId !== taskRunId) {
        return;
      }

      if (record.status === 'completed' && record.report != null) {
        publishTaskRecordSubscribers.delete(subscriber);
        resolve(record.report);
        return;
      }

      if (record.status === 'canceled' || record.status === 'failed') {
        publishTaskRecordSubscribers.delete(subscriber);
        reject(new Error(record.errorMessage ?? `Publish task ${taskRunId} did not complete successfully`));
      }
    };

    publishTaskRecordSubscribers.add(subscriber);
  });
}

/** Streams legacy publish progress events mapped from the generic publish task bridge. */
export async function* watchPublishTaskProgressEvents(): AsyncGenerator<PublishJobProgressEvent> {
  const queue: PublishJobProgressEvent[] = [];
  let wake: (() => void) | null = null;
  let stopped = false;

  const subscriber = (record: PublishTaskRecord) => {
    if (stopped) {
      return;
    }

    const event = toPublishTaskProgressEvent(record);

    if (event == null) {
      return;
    }

    queue.push(event);

    if (wake) {
      const resolve = wake;
      wake = null;
      resolve();
    }
  };

  publishTaskRecordSubscribers.add(subscriber);

  const current = getSingleActivePublishTask();
  if (current != null) {
    subscriber(current);
  }

  try {
    while (!stopped) {
      if (queue.length === 0) {
        await new Promise<void>(resolve => {
          wake = resolve;
        });
      }

      while (queue.length > 0) {
        const event = queue.shift()!;
        yield event;

        if (event.phase === 'completed' || event.phase === 'failed' || event.phase === 'stopped') {
          return;
        }
      }
    }
  } finally {
    stopped = true;
    publishTaskRecordSubscribers.delete(subscriber);

    const currentWake = wake;
    wake = null;
    resolveWake(currentWake);
  }
}

/** Streams publish-task snapshots for runtime subscribers. */
export async function* watchPublishTaskEvents(): AsyncGenerator<TaskPageEvent> {
  const queue: TaskPageEvent[] = [];
  let wake: (() => void) | null = null;
  let stopped = false;

  const subscriber = (event: TaskPageEvent) => {
    if (stopped) {
      return;
    }

    queue.push(event);

    if (wake) {
      const resolve = wake;
      wake = null;
      resolve();
    }
  };

  publishTaskSubscribers.add(subscriber);

  try {
    while (!stopped) {
      if (queue.length === 0) {
        await new Promise<void>(resolve => {
          wake = resolve;
        });
      }

      while (queue.length > 0) {
        yield queue.shift()!;
      }
    }
  } finally {
    stopped = true;
    publishTaskSubscribers.delete(subscriber);

    const currentWake = wake;
    wake = null;
    resolveWake(currentWake);
  }
}
