import { eventIterator } from '@orpc/server';
import { z } from 'zod';

import { taskPageEvent, taskPageSnapshot } from '@tcg-cards/model/src/task';

import { os } from './index';
import type { TaskRunInput } from '#task/index';
import { createTaskStore, createTaskController, createTaskScheduler, createTaskExecutor, createTaskEventPublisher, getTaskDefinition } from '#task/index';
import { buildTaskPageSnapshot } from '#task/snapshot';
import { createTaskEventPublisher } from '#task/events';
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

/** Creates a task run and starts the executor. Shared by all task-type-specific handlers. */
export async function createAndRunTask(
  taskType: string,
  runInput: TaskRunInput,
): Promise<TaskPageSnapshot> {
  const definition = getTaskDefinition(taskType);
  const controlResult = await getController().createTask(runInput, definition);
  const snap = await getStore().getTaskRun(controlResult.taskRunId);
  if (!snap) throw new Error(`Task ${controlResult.taskRunId} was not created`);
  const executor = createTaskExecutor(getStore(), createTaskEventPublisher());
  void executor.runTask(snap);
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

/** Streams real-time task events for one task run. */
const watch = os
  .input(z.strictObject({ taskRunId: z.uuid() }))
  .output(eventIterator(taskPageEvent))
  .handler(async function* ({ input }) {
    const snap = await getStore().getTaskRun(input.taskRunId);
    if (snap) yield buildTaskPageSnapshot(snap);
    yield* createTaskEventPublisher().watch(input.taskRunId);
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
