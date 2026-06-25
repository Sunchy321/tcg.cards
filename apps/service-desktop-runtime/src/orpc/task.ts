import { eventIterator } from '@orpc/server';
import { z } from 'zod';

import { taskPageEvent, taskPageSnapshot } from '@tcg-cards/model/src/task';

import { os } from './index';
import { createTaskStore, createTaskController, createTaskScheduler } from '#task/index';
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

export const taskRouter = { cancel, watch, retry };
