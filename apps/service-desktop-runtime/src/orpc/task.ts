import { eventIterator } from '@orpc/server';
import { z } from 'zod';

import { taskPageEvent, TaskPageSnapshot, taskPageSnapshot } from '@tcg-cards/model/src/task';

import { os } from './index';
import type { TaskRunInput, TaskRunSnapshot } from '#task/index';
import { createTaskStore, createTaskController, createTaskScheduler, getTaskDefinition } from '#task/index';
import { runTaskInWorker } from '#task/worker';
import { buildTaskPageSnapshot } from '#task/snapshot';
import { getLocalDb } from '../lib/hearthstone/hsdata-local-db';

let _store: ReturnType<typeof createTaskStore>;
function getStore() {
  if (!_store) _store = createTaskStore(getLocalDb());
  return _store;
}
function getController() {
  const s = getStore();
  return createTaskController(s, createTaskScheduler(s));
}

/** Exposed for task-type-specific ORPC handlers that need store access (e.g., active checks). */
export { getStore };

/** Creates a task run and starts the executor in a Worker thread. */
export async function createAndRunTask(
  taskType: string,
  runInput: TaskRunInput,
): Promise<TaskPageSnapshot> {
  // Abandon any stale active task of the same type left from a previous boot
  const activeRuns = await getStore().listActiveTaskRuns();
  const stale = activeRuns.find(r => r.taskType === taskType);
  if (stale) {
    await getController().abandonTask(stale.id, 'abandoned_stale_run');
  }

  const definition = getTaskDefinition(taskType);
  const controlResult = await getController().createTask(runInput, definition);
  const snap = await getStore().getTaskRun(controlResult.taskRunId);
  if (!snap) throw new Error(`Task ${controlResult.taskRunId} was not created`);

  runTaskInWorker(snap.run.id);

  return buildTaskPageSnapshot(snap);
}

/** Returns the current snapshot for one task run. */
const snapshot = os
  .input(z.strictObject({ taskRunId: z.uuid() }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    const snap = await getStore().getTaskRun(input.taskRunId);
    if (!snap) return { pageTask: { kind: 'idle' as const }, stages: [] };
    return buildTaskPageSnapshot(snap);
  });

/** Cancels any active task by its run ID. */
const cancel = os
  .input(z.strictObject({ taskRunId: z.uuid() }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    await getController().cancelTask(input.taskRunId);
    return { pageTask: { kind: 'idle' as const }, stages: [] };
  });

/** Builds a compact change fingerprint of a task run snapshot (run state + stage progress). */
function snapshotFingerprint(snap: TaskRunSnapshot): string {
  const run = snap.run;
  return JSON.stringify([
    run.status,
    run.runRevision,
    run.controlRequestKind,
    run.currentStageKey,
    run.currentStageIndex,
    run.errorCode,
    run.errorMessage,
    run.startedAt,
    run.finishedAt,
    snap.stages.map(s => [s.stageKey, s.status, s.done, s.total, s.startedAt, s.finishedAt, s.segments]),
  ]);
}

/** Streams real-time task events for one task run via DB polling. */
const watch = os
  .input(z.strictObject({ taskRunId: z.uuid() }))
  .output(eventIterator(taskPageEvent))
  .handler(async function* ({ input }) {
    const taskRunId = input.taskRunId;
    const terminalStatuses = ['completed', 'failed', 'canceled', 'abandoned'];

    let lastFingerprint = '';
    while (true) {
      const snap = await getStore().getTaskRun(taskRunId);
      if (!snap) break;

      const fingerprint = snapshotFingerprint(snap);
      if (fingerprint !== lastFingerprint) {
        lastFingerprint = fingerprint;
        yield buildTaskPageSnapshot(snap);
      }

      if (terminalStatuses.includes(snap.run.status)) break;

      await new Promise(r => setTimeout(r, 500));
    }
  });

/** Retries a failed, canceled or abandoned task with the same parameters. */
const retry = os
  .input(z.strictObject({ taskRunId: z.uuid() }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    const result = await getController().retryTask(input.taskRunId);
    const snap = await getStore().getTaskRun(result.taskRunId);
    return buildTaskPageSnapshot(snap!);
  });

/** Pauses a running task. */
const pause = os
  .input(z.strictObject({ taskRunId: z.uuid() }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    await getController().pauseTask(input.taskRunId);
    const snap = await getStore().getTaskRun(input.taskRunId);
    return buildTaskPageSnapshot(snap!);
  });

/** Resumes a paused task. */
const resume = os
  .input(z.strictObject({ taskRunId: z.uuid() }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    await getController().resumeTask(input.taskRunId);
    const snap = await getStore().getTaskRun(input.taskRunId);
    return buildTaskPageSnapshot(snap!);
  });

export const taskRouter = { snapshot, cancel, watch, retry, pause, resume };
