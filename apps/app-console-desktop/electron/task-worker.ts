import { parentPort, workerData } from 'node:worker_threads';
import { eq } from 'drizzle-orm';
import { createDb } from '@tcg-cards/db';
import { TaskRun } from '@tcg-cards/db/schema/local/task';

import './task/discover';
import { getTask, TaskBoundarySignal } from './task/registry';
import type { TaskDefinition, TaskProgressUpdate, TaskStageDefinition } from './task/registry';
import { TaskStore } from './task/store';
import type { WorkerCommand } from './contract';
import { applyRuntimeOverrides } from './runtime/runtime-config';
import type { RuntimeOverrides } from './runtime/runtime-config';

/** Immutable launch data passed by the task host to one Worker. */
interface LaunchData {
  taskRunId:        string;
  taskType:         string;
  databaseUrl:      string;
  runtimeOverrides: RuntimeOverrides;
}

/** Terminal statuses a Worker must never overwrite with its own failure. */
const terminalStatuses = ['canceled', 'failed', 'completed', 'abandoned'];

const launch = workerData as LaunchData;
applyRuntimeOverrides(launch.runtimeOverrides);
const port = parentPort;
if (!port) throw new Error('Task Worker requires a parent');
const registration = getTask(launch.taskType);

/** Announces a startup phase so the host can fetch one authoritative snapshot. */
function changed(phase: 'loading' | 'running' | 'finished'): void {
  port!.postMessage({ taskRunId: launch.taskRunId, phase });
}

/** Announces that a control request settled without a startup phase change. */
function settled(): void {
  port!.postMessage({ taskRunId: launch.taskRunId, settled: true });
}

/** Outcome of one pass over the planned stages. */
type Outcome = 'done' | 'paused' | 'canceled' | 'failed' | 'stopped';

/** Latest control instruction received from the host. */
let control: 'pause' | 'cancel' | null = null;
/** Set when the host asked this Worker to stop for a deliberate shutdown. */
let stopping = false;
/** Aborts a stage only after it reaches a task-defined safe boundary. */
let controller: AbortController | null = null;
/** Resolves the paused wait when the host sends resume or cancel. */
let wake: (() => void) | undefined;
let activeDefinition: TaskDefinition | undefined;

port!.on('message', (message: WorkerCommand) => {
  if (message.taskRunId !== launch.taskRunId) return;
  if (message.control === 'resume') {
    control = null;
    wake?.();
    return;
  }
  if (message.control === 'shutdown') {
    // Preserve the latest checkpoint and let the task finish its current work unit.
    stopping = true;
    control = null;
    wake?.();
    return;
  }
  control = message.control;
  wake?.();
});

/** Waits inside the paused state until the host resumes or cancels the run. */
function waitWhilePaused(): Promise<'resume' | 'cancel'> {
  return new Promise(resolve => {
    wake = () => {
      wake = undefined;
      resolve(control === 'cancel' ? 'cancel' : 'resume');
    };
  });
}

/** Reads the persisted status of this run, null when the row disappeared. */
async function statusOf(store: TaskStore): Promise<string | null> {
  const view = await store.get(launch.taskRunId);
  return view?.status ?? null;
}

/** Stops one stage attempt after its last durable or transaction-safe operation. */
async function settleBoundary(
  store: TaskStore,
  stage: TaskStageDefinition,
  requested: 'pause' | 'cancel' | 'shutdown',
  definition: TaskDefinition,
  params: Record<string, unknown>,
): Promise<Outcome> {
  const status = await statusOf(store);
  if (status === null || terminalStatuses.includes(status)) return 'canceled';
  controller?.abort(requested);

  if (requested === 'pause') {
    await store.markPaused(launch.taskRunId, stage.key, stage.resumeMode ?? 'none');
    control = null;
    settled();
    return 'paused';
  }

  if (requested === 'shutdown') {
    if (registration.supportsResume && stage.resumeMode === 'durable') {
      await store.markInterrupted(launch.taskRunId, stage.key);
    } else {
      await store.markCanceled(launch.taskRunId);
      await definition.onCanceled?.(params, launch.taskRunId);
    }
    settled();
    return 'stopped';
  }

  await store.markCanceled(launch.taskRunId);
  await definition.onCanceled?.(params, launch.taskRunId);
  control = null;
  settled();
  return 'canceled';
}

/** Validates progress before it crosses the Worker-to-store boundary. */
function normalizeProgress(stage: TaskStageDefinition, update: number | TaskProgressUpdate): TaskProgressUpdate {
  const value = typeof update === 'number' ? { done: update } : update;
  const total = value.total === undefined ? stage.total : value.total;
  if (value.done !== null && (!Number.isSafeInteger(value.done) || value.done < 0)) {
    throw new Error('Invalid task progress');
  }
  if (total !== null && (!Number.isSafeInteger(total) || total < 0)) {
    throw new Error('Invalid task progress');
  }
  if (stage.progressMode !== 'simple' && value.done === null) {
    throw new Error('Task progress requires a completed count');
  }
  if (stage.progressMode === 'bounded' && value.done !== null && total !== null && value.done > total) {
    throw new Error('Invalid task progress');
  }
  if (value.segments?.some(segment => !Number.isSafeInteger(segment.done)
    || !Number.isSafeInteger(segment.total)
    || segment.done < 0
    || segment.total < 0
    || segment.done > segment.total)) {
    throw new Error('Invalid task progress');
  }
  return { ...value, total };
}

/** Runs one pass over the planned stages; controls settle only at safe boundaries. */
async function runOnce(
  store: TaskStore,
  definition: TaskDefinition,
  stages: TaskStageDefinition[],
  params: Record<string, unknown>,
): Promise<Outcome> {
  controller = new AbortController();
  let result = await store.resultOf(launch.taskRunId) ?? {};
  let snapshot = await store.get(launch.taskRunId);
  if (!snapshot) return 'failed';
  if (terminalStatuses.includes(snapshot.status)) return 'canceled';

  for (const [index, stage] of stages.entries()) {
    if (snapshot.stages[index]?.status === 'completed') continue;
    const stageResumeState = await store.resumeState(launch.taskRunId, stage.key);
    if (!(await store.beginStage(launch.taskRunId, stage.key, index, stage.resumeMode ?? 'none'))) {
      const status = await statusOf(store);
      if (status === 'pausing') {
        await store.markPaused(launch.taskRunId, stage.key, stage.resumeMode ?? 'none');
        settled();
        return 'paused';
      }
      if (status === 'canceling') {
        await store.markCanceled(launch.taskRunId);
        await definition.onCanceled?.(params, launch.taskRunId);
        settled();
      }
      return 'canceled';
    }
    changed('running');
    const priorStatus = snapshot.stages[index]?.status;
    const resume = priorStatus === 'paused' || priorStatus === 'running'
      ? stageResumeState ?? { done: 0, token: null }
      : undefined;
    try {
      await stage.run({
        taskRunId: launch.taskRunId,
        params,
        signal:    controller.signal,
        resume,
        async progress(input) {
          const update = normalizeProgress(stage, input);
          await store.progress(launch.taskRunId, stage.key, update);
          changed('running');
        },
        async checkpoint(token, input) {
          const update = input ? normalizeProgress(stage, input) : undefined;
          await store.checkpoint(launch.taskRunId, stage.key, token, update);
          changed('running');
          const requested = stopping
            ? 'shutdown'
            : control === 'cancel'
              ? 'cancel'
              : control === 'pause' && stage.resumeMode === 'durable'
                ? 'pause'
                : null;
          if (requested) {
            controller?.abort(requested);
            throw new TaskBoundarySignal(requested);
          }
        },
        async saveResult(value) {
          result = value;
          await store.saveResult(launch.taskRunId, value);
        },
      });
    } catch (error) {
      if (error instanceof TaskBoundarySignal) {
        return settleBoundary(store, stage, error.control, definition, params);
      }
      if (terminalStatuses.includes((await statusOf(store)) ?? '')) return 'canceled';
      await store.fail(launch.taskRunId, error instanceof Error ? error.message : 'Task failed');
      changed('finished');
      return 'failed';
    }

    await store.completeStage(launch.taskRunId, stage.key);
    changed('running');
    const requested = stopping ? 'shutdown' : control;
    const nextStage = stages.slice(index + 1).find(candidate => {
      const current = snapshot!.stages.find(item => item.key === candidate.key);
      return current?.status !== 'completed';
    });
    if (requested && nextStage) {
      if (requested === 'pause') {
        await store.markPaused(launch.taskRunId, nextStage.key, nextStage.resumeMode ?? 'none');
        control = null;
        settled();
        return 'paused';
      }
      if (requested === 'shutdown') {
        if (registration.supportsResume && nextStage.resumeMode === 'durable') {
          await store.markInterrupted(launch.taskRunId, nextStage.key);
        } else {
          await store.markCanceled(launch.taskRunId);
          await definition.onCanceled?.(params, launch.taskRunId);
        }
        settled();
        return 'stopped';
      }
      await store.markCanceled(launch.taskRunId);
      await definition.onCanceled?.(params, launch.taskRunId);
      control = null;
      settled();
      return 'canceled';
    }

    snapshot = await store.get(launch.taskRunId);
    if (!snapshot) return 'failed';
  }

  result = await store.resultOf(launch.taskRunId) ?? definition.result?.(params, launch.taskRunId) ?? result;
  await store.complete(launch.taskRunId, result);
  changed('finished');
  return 'done';
}

/** Loads one Electron-native task definition and runs its planned stages. */
async function execute(): Promise<void> {
  const store = new TaskStore(launch.databaseUrl);
  try {
    changed('loading');
    if (!registration.load) throw new Error('Task definition is unavailable');
    const { default: definition } = await registration.load();
    activeDefinition = definition;
    const [record] = await createDb(launch.databaseUrl).select({ params: TaskRun.params })
      .from(TaskRun).where(eq(TaskRun.id, launch.taskRunId)).limit(1);
    if (!record) throw new Error('Task parameters were not found');
    const params = record.params;
    const stages = await definition.stages(params);
    const snapshot = await store.get(launch.taskRunId);
    if (!snapshot) throw new Error('Task record was not found');
    if (snapshot.stages.length === 0) await store.plan(launch.taskRunId, stages);
    changed('running');
    for (;;) {
      if (stopping) {
        settled();
        return;
      }
      const outcome = await runOnce(store, definition, stages, params);
      if (outcome !== 'paused') return;
      if (await waitWhilePaused() === 'cancel') return;
      if (stopping) return;
    }
  } catch (error) {
    if (terminalStatuses.includes((await statusOf(store)) ?? '')) return;
    await store.fail(launch.taskRunId, error instanceof Error ? error.message : 'Task failed');
    changed('finished');
  }
}

void execute().finally(() => {
  activeDefinition?.cleanup?.(launch.taskRunId);
  // Quiet exits still flush their last messages; nothing may resume this Worker afterwards.
  port!.unref();
});
