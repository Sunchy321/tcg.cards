import { parentPort, workerData } from 'node:worker_threads';
import { eq } from 'drizzle-orm';
import { createDb } from '@tcg-cards/db';
import { TaskRun } from '@tcg-cards/db/schema/local/task';

import './task/discover';
import { getTask } from './task/registry';
import type { TaskDefinition, TaskStageDefinition } from './task/registry';
import { TaskStore } from './task/store';
import type { WorkerCommand } from './contract';

/** Immutable launch data passed by the task host to one Worker. */
interface LaunchData {
  taskRunId:   string;
  taskType:    string;
  databaseUrl: string;
}

/** Terminal statuses a Worker must never overwrite with its own failure. */
const terminalStatuses = ['canceled', 'failed', 'completed', 'abandoned'];

const launch = workerData as LaunchData;
const port = parentPort;
if (!port) throw new Error('Task Worker requires a parent');

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
/** Aborts the currently running stage attempt. */
let controller: AbortController | null = null;
/** Resolves the paused wait when the host sends resume or cancel. */
let wake: (() => void) | undefined;

port!.on('message', (message: WorkerCommand) => {
  if (message.taskRunId !== launch.taskRunId) return;
  if (message.control === 'resume') {
    control = null;
    wake?.();
    return;
  }
  if (message.control === 'shutdown') {
    // Stop at the current safe boundary without deciding the run's final state.
    stopping = true;
    control = null;
    if (controller) controller.abort('shutdown');
    wake?.();
    return;
  }
  control = message.control;
  // A stale controller from a finished stage attempt must not swallow the wake.
  if (controller) controller.abort(message.control);
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

/** Stops one stage attempt at its safe boundary and reports the settled outcome. */
async function settleInterrupted(store: TaskStore, stage: TaskStageDefinition): Promise<Outcome> {
  const status = await statusOf(store);
  if (status === null || terminalStatuses.includes(status)) return 'canceled';
  if (stopping) {
    // A deliberate shutdown leaves the persisted checkpoint untouched for the host to classify.
    settled();
    return 'stopped';
  }
  if (control === 'pause') {
    await store.markPaused(launch.taskRunId, stage.key, stage.resumeMode ?? 'none');
    control = null;
    settled();
    return 'paused';
  }
  await store.markCanceled(launch.taskRunId);
  settled();
  return 'canceled';
}

/** Runs one pass over the planned stages; paused stops at the current safe boundary. */
async function runOnce(
  store: TaskStore,
  definition: TaskDefinition,
  stages: TaskStageDefinition[],
  params: Record<string, unknown>,
  resumed: boolean,
): Promise<Outcome> {
  controller = new AbortController();
  const snapshot = await store.get(launch.taskRunId);
  if (!snapshot) return 'failed';
  if (terminalStatuses.includes(snapshot.status)) return 'canceled';
  for (const [index, stage] of stages.entries()) {
    if (snapshot.stages[index]?.status === 'completed') continue;
    if (!(await store.beginStage(launch.taskRunId, stage.key, index))) {
      const status = await statusOf(store);
      if (status === 'pausing') {
        await store.markPaused(launch.taskRunId, stage.key, stage.resumeMode ?? 'none');
        settled();
        return 'paused';
      }
      if (status === 'canceling') {
        await store.markCanceled(launch.taskRunId);
        settled();
      }
      return 'canceled';
    }
    changed('running');
    const resume = resumed ? { done: snapshot.stages[index]?.done ?? 0 } : undefined;
    try {
      await stage.run({
        params,
        signal: controller.signal,
        resume,
        async progress(done: number) {
          if (!Number.isSafeInteger(done) || done < 0 || done > stage.total) {
            throw new Error('Invalid task progress');
          }
          await store.progress(launch.taskRunId, stage.key, done);
          changed('running');
        },
      });
    } catch (error) {
      if (controller.signal.aborted) return settleInterrupted(store, stage);
      if (terminalStatuses.includes((await statusOf(store)) ?? '')) return 'canceled';
      await store.fail(launch.taskRunId, error instanceof Error ? error.message : 'Task failed');
      changed('finished');
      return 'failed';
    }
    await store.completeStage(launch.taskRunId, stage.key);
    changed('running');
  }
  await store.complete(launch.taskRunId, definition.result?.(params) ?? {});
  changed('finished');
  return 'done';
}

/** Loads one task definition and runs its planned stages in this Worker. */
async function execute(): Promise<void> {
  const store = new TaskStore(launch.databaseUrl);
  try {
    changed('loading');
    const registration = getTask(launch.taskType);
    const { default: definition } = await registration.load();
    const [record] = await createDb(launch.databaseUrl).select({ params: TaskRun.params })
      .from(TaskRun).where(eq(TaskRun.id, launch.taskRunId)).limit(1);
    if (!record) throw new Error('Task parameters were not found');
    const params = record.params;
    const stages = await definition.stages(params);
    const snapshot = await store.get(launch.taskRunId);
    if (!snapshot) throw new Error('Task record was not found');
    // A run that already persisted its stage skeleton is a continuation: its
    // current stage re-enters with the persisted progress as the resume point.
    if (snapshot.stages.length === 0) await store.plan(launch.taskRunId, stages);
    changed('running');
    let resumed = snapshot.stages.length > 0;
    for (;;) {
      // A shutdown may have arrived while the definition was still loading.
      if (stopping) {
        settled();
        return;
      }
      const outcome = await runOnce(store, definition, stages, params, resumed);
      if (outcome !== 'paused') return;
      if (await waitWhilePaused() === 'cancel') return;
      if (stopping) return;
      resumed = true;
    }
  } catch (error) {
    if (terminalStatuses.includes((await statusOf(store)) ?? '')) return;
    await store.fail(launch.taskRunId, error instanceof Error ? error.message : 'Task failed');
    changed('finished');
  }
}

void execute().finally(() => {
  // Quiet exits still flush their last messages; nothing may resume this Worker afterwards.
  port!.unref();
});
