import type { PublishTaskCreateInput, PublishTaskParams } from '@tcg-cards/model/src/task-publish';
import type {
  TaskControlResult,
  TaskPageEvent,
  TaskPageSnapshot,
  TaskRunStatus,
} from '@tcg-cards/model/src/task';

import { PublishJobInterruptedError } from '../../hsdata-publish-progress';
import {
  publishCurrentHsdataToRemote,
  type PublishReport,
} from '../../hsdata-publish';
import { getLocalDb } from '../../hsdata-local-db';
import { buildTaskPageSnapshot } from '#task/index';
import { createTaskStore } from '#task/store';
import type { TaskStore } from '#task/store';
import { createTaskExecutor } from '#task/executor';
import { getTaskDefinition } from '#task/registry';
import type { TaskRunInput } from '#task/definition';
import {
  buildPublishTaskScopeKey,
  buildPublishTaskScope,
  buildPublishTaskStagePlan,
  publishTaskDefinitionVersion,
  publishTaskScopeType,
  publishTaskType,
} from './definition';

/** Legacy progress event shape kept for orpc/hsdata.ts backward compat. */
interface LegacyPublishProgressEvent {
  batchId: string;
  publishType: string;
  publishTarget: string;
  phase: string;
  message: string;
  startedAt: string;
  phaseStartedAt: string;
  finishedAt: string | null;
  totalRowCount: number | null;
  completedRowCount: number | null;
  segments?: { name: string; done: number; total: number }[];
  report: PublishReport | null;
}

/** Resolves one pending async-generator wake callback when it exists. */
function resolveWake(wake: (() => void) | null): void {
  wake?.();
}

/** Lazily initialized generic task store for the publish bridge. */
let publishStore: TaskStore;

/** Tracks task run IDs for which a cooperative stop has been requested in-memory. */
const stopRequestedIds = new Set<string>();

/** Latest per-table progress data keyed by task run ID, tagged with the stage key. */
const segmentProgressByRun = new Map<string, { stageKey: string; segments: { name: string; done: number; total: number }[] }>();

/** Maps stream keys to their active task run IDs (for legacy getPublishTaskSnapshot). */
const publishTaskIdByStreamKey = new Map<string, string>();

/** Legacy snapshot event subscribers. */
const publishTaskSubscribers = new Set<(event: TaskPageEvent) => void>();

interface LegacyRecordSnapshot {
  status: TaskRunStatus;
  taskRunId: string;
  runRevision: number;
  errorMessage: string | null;
  report: PublishReport | null;
  startedAt: string | null;
  finishedAt: string | null;
}

/** Legacy progress event subscriber. */
type LegacyRecordSubscriber = (record: LegacyRecordSnapshot) => void;

/** Legacy progress event subscribers. */
const publishTaskRecordSubscribers = new Set<LegacyRecordSubscriber>();

/** Lazily initialized generic task store for the publish bridge. */
function getPublishStore(): TaskStore {
  if (!publishStore) {
    publishStore = createTaskStore(getLocalDb());
  }
  return publishStore;
}

/** Builds the TaskRunInput from a PublishTaskCreateInput for the generic framework. */
function buildTaskRunInput(input: PublishTaskCreateInput): TaskRunInput {
  return {
    taskType: publishTaskType,
    definitionVersion: publishTaskDefinitionVersion,
    scope: buildPublishTaskScope(input.scope),
    params: input.params as unknown as Record<string, unknown>,
  };
}

/** Emits a snapshot event to all legacy subscribers. */
function emitSnapshotEvent(taskRunId: string): void {
  getPublishStore().getTaskRun(taskRunId).then(snapshot => {
    if (!snapshot) return;

    const pageSnapshot = buildTaskPageSnapshot(snapshot);

    for (const subscriber of publishTaskSubscribers) {
      subscriber(pageSnapshot);
    }

    for (const subscriber of publishTaskRecordSubscribers) {
      subscriber({
        status: snapshot.run.status,
        taskRunId: snapshot.run.id,
        runRevision: snapshot.run.runRevision,
        errorMessage: snapshot.run.errorMessage,
        report: null,
        startedAt: snapshot.run.startedAt,
        finishedAt: snapshot.run.finishedAt,
      });
    }
  }).catch(() => {
    // Ignore read errors during event emission.
  });
}

function startPublishTaskExecution(
  taskRunId: string,
  scope: PublishTaskCreateInput['scope'],
  params: PublishTaskParams,
): void {
  void (async () => {
    const store = getPublishStore();
    const snapshot = await store.getTaskRun(taskRunId);
    if (!snapshot) return;

    const { setCurrentTaskRunCtx } = await import('./definition');
    setCurrentTaskRunCtx(taskRunId, store);

    const { createTaskExecutor } = await import('../../../task/executor');
    const executor = createTaskExecutor(store);

    try {
      await executor.runTask(snapshot);
      stopRequestedIds.delete(taskRunId);
      emitSnapshotEvent(taskRunId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await store.updateTaskRun(taskRunId, {
        status: 'failed', terminalReason: 'execution_failed', errorMessage: msg,
        finishedAt: new Date(), currentStageKey: null, currentStageIndex: null, currentResumeMode: null,
      });
      stopRequestedIds.delete(taskRunId);
      emitSnapshotEvent(taskRunId);
    }
  })();
}

export async function createPublishTask(input: PublishTaskCreateInput): Promise<TaskControlResult> {
  const scopeKey = buildPublishTaskScopeKey(input.scope);

  const active = await getPublishStore().getActiveTaskRun(
    publishTaskType,
    publishTaskScopeType,
    scopeKey,
  );

  if (active) {
    throw new Error(`Publish task already exists for stream ${scopeKey}`);
  }

  const definition = getTaskDefinition(publishTaskType);
  const runInput = buildTaskRunInput(input);
  const stagePlans = await definition.buildStagePlan(runInput);

  const snapshot = await getPublishStore().createTaskRun({
    run: runInput,
    supportsResume: false,
    stages: stagePlans,
  });

  publishTaskIdByStreamKey.set(scopeKey, snapshot.run.id);
  emitSnapshotEvent(snapshot.run.id);
  startPublishTaskExecution(snapshot.run.id, input.scope, input.params);

  return {
    taskRunId: snapshot.run.id,
    runRevision: snapshot.run.runRevision,
    status: snapshot.run.status,
  };
}

/** Returns the current publish task snapshot for one stream, or idle when none exists. */
export async function getPublishTaskSnapshot(
  scope: PublishTaskCreateInput['scope'],
): Promise<TaskPageSnapshot> {
  const taskRunId = publishTaskIdByStreamKey.get(buildPublishTaskScopeKey(scope));

  if (!taskRunId) {
    return { pageTask: { kind: 'idle' }, stages: [] };
  }

  const snapshot = await getPublishStore().getTaskRun(taskRunId);

  if (!snapshot) {
    return { pageTask: { kind: 'idle' }, stages: [] };
  }

  return buildTaskPageSnapshot(snapshot);
}

/** Cancels one active publish task through the generic task store. */
export async function cancelPublishTask(taskRunId: string): Promise<TaskControlResult> {
  const snapshot = await getPublishStore().getTaskRun(taskRunId);

  if (!snapshot) {
    throw new Error(`Publish task ${taskRunId} does not exist`);
  }

  const cancelable: readonly TaskRunStatus[] = [
    'pending', 'running', 'pausing', 'paused', 'resuming',
  ];

  if (!cancelable.includes(snapshot.run.status)) {
    throw new Error(`Publish task ${taskRunId} is already ${snapshot.run.status}`);
  }

  stopRequestedIds.add(taskRunId);

  const updated = await getPublishStore().updateTaskRun(taskRunId, {
    status: 'canceling',
    controlRequestKind: 'cancel',
  });

  return {
    taskRunId: updated.id,
    runRevision: updated.runRevision,
    status: updated.status,
  };
}

/** Cancels the single active publish task still exposed through the legacy global API. */
export async function stopActivePublishTask(): Promise<{ batchId: string }> {
  const activeRuns = await getPublishStore().listActiveTaskRuns();
  const publishRun = activeRuns.find(r => r.taskType === publishTaskType);

  if (!publishRun) {
    throw new Error('No active publish task exists');
  }

  const result = await cancelPublishTask(publishRun.id);

  return { batchId: result.taskRunId };
}

/** Waits until one publish task reaches a terminal state and returns its final report. */
export async function waitForPublishTask(taskRunId: string): Promise<PublishReport> {
  const current = await getPublishStore().getTaskRun(taskRunId);

  if (!current) {
    throw new Error(`Publish task ${taskRunId} does not exist`);
  }

  if (current.run.status === 'completed') {
    // Report will be null in the generic task - the bridge does not persist reports.
    // The caller receives the task-level confirmation only.
    return {} as PublishReport;
  }

  if (current.run.status === 'canceled' || current.run.status === 'failed') {
    throw new Error(
      current.run.errorMessage ?? `Publish task ${taskRunId} did not complete successfully`,
    );
  }

  // Poll the store until terminal (legacy subscribers no longer drive this).
  const terminal: readonly TaskRunStatus[] = ['completed', 'canceled', 'failed', 'abandoned'];

  while (true) {
    await new Promise(resolve => setTimeout(resolve, 500));

    const snapshot = await getPublishStore().getTaskRun(taskRunId);

    if (!snapshot) {
      throw new Error(`Publish task ${taskRunId} disappeared`);
    }

    if (terminal.includes(snapshot.run.status)) {
      if (snapshot.run.status === 'completed') {
        return {} as PublishReport;
      }

      throw new Error(
        snapshot.run.errorMessage ?? `Publish task ${taskRunId} did not complete successfully`,
      );
    }
  }
}

/** Streams legacy publish progress events mapped from the generic publish task bridge. */
export async function* watchPublishTaskProgressEvents(): AsyncGenerator<LegacyPublishProgressEvent> {
  const queue: LegacyPublishProgressEvent[] = [];
  let wake: (() => void) | null = null;
  let stopped = false;

  const subscriber = (record: {
    status: TaskRunStatus;
    taskRunId: string;
    errorMessage: string | null;
  }) => {
    if (stopped) return;

    const terminal = record.status === 'completed' || record.status === 'failed' || record.status === 'canceled';
    const startedAt = new Date().toISOString();
    const finishedAt = startedAt;

    const event: LegacyPublishProgressEvent = {
      batchId: record.taskRunId,
      publishType: 'card_data',
      publishTarget: 'hearthstone/default',
      phase: record.status === 'completed'
        ? 'completed'
        : record.status === 'canceled'
          ? 'stopped'
          : record.status === 'failed'
            ? 'failed'
            : 'running',
      message: record.errorMessage ?? (
        record.status === 'completed' ? 'Publish completed'
          : record.status === 'canceled' ? 'Publish stopped'
            : 'Publish running'
      ),
      startedAt,
      phaseStartedAt: finishedAt,
      finishedAt: terminal ? finishedAt : null,
      totalRowCount: null,
      completedRowCount: null,
      report: null,
      segments: segmentProgressByRun.get(record.taskRunId)?.segments,
    };

    queue.push(event);

    if (wake) {
      const resolve = wake;
      wake = null;
      resolve();
    }
  };

  publishTaskRecordSubscribers.add(subscriber);

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
    if (stopped) return;

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
