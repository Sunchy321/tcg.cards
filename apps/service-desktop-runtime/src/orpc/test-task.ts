import { ORPCError } from '@orpc/server';
import { z } from 'zod';

import { taskPageSnapshot } from '@tcg-cards/model/src/task';

import { os } from './index';
import { createTaskStore } from '#task/store';
import { buildTaskPageSnapshot } from '#task/snapshot';
import { createTaskEventPublisher } from '#task/events';
import { createTaskController } from '#task/control';
import { createTaskScheduler } from '#task/scheduler';
import {
  testWorkTaskDefinition,
  testWorkTaskType,
  testWorkDefinitionVersion,
} from '../lib/task/test-definition';
import { getLocalDb } from '../lib/hearthstone/hsdata-local-db';
import { createTaskExecutor } from '../lib/task/executor';

let store: ReturnType<typeof createTaskStore>;
function getStore() {
  if (!store) store = createTaskStore(getLocalDb());
  return store;
}

function getController() {
  return createTaskController(getStore(), createTaskScheduler(getStore()));
}

const testWorkInput = z.strictObject({
  workload: z.number().int().positive().default(20),
});

/** Creates a test heavy-work task and starts execution through the generic executor. */
const create = os
  .input(testWorkInput)
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    const runInput = {
      taskType: testWorkTaskType,
      definitionVersion: testWorkDefinitionVersion,
      scope: { type: 'test_work', key: `workload:${input.workload}` },
      params: { workload: input.workload },
    };

    const controlResult = await getController().createTask(runInput, testWorkTaskDefinition);
    const snapshot = await getStore().getTaskRun(controlResult.taskRunId);
    if (!snapshot) throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'Task was not created' });

    const executor = createTaskExecutor(getStore(), createTaskEventPublisher());

    // Run the task in background via the generic executor
    void executor.runTask(snapshot);

    return buildTaskPageSnapshot(snapshot);
  });

/** Returns the current snapshot for one test-work task. */
const snapshot = os
  .input(z.strictObject({
    taskRunId: z.uuid(),
  }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    const snap = await getStore().getTaskRun(input.taskRunId);
    if (!snap) return { pageTask: { kind: 'idle' }, stages: [] };
    return buildTaskPageSnapshot(snap);
  });

/** Pauses one running test-work task. */
const pause = os
  .input(z.strictObject({ taskRunId: z.uuid() }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    await getController().pauseTask(input.taskRunId);
    const updated = await getStore().getTaskRun(input.taskRunId);
    return buildTaskPageSnapshot(updated!);
  });

/** Resumes one paused test-work task. */
const resume = os
  .input(z.strictObject({ taskRunId: z.uuid() }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    await getController().resumeTask(input.taskRunId);
    const updated = await getStore().getTaskRun(input.taskRunId);
    return buildTaskPageSnapshot(updated!);
  });

/** Cancels one test-work task through the generic executor's control mechanism. */
const cancel = os
  .input(z.strictObject({ taskRunId: z.uuid() }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    await getController().cancelTask(input.taskRunId);
    const updated = await getStore().getTaskRun(input.taskRunId);
    return buildTaskPageSnapshot(updated!);
  });

/** Groups the test-task procedures under one router namespace. */
export const testRouter = {
  create,
  snapshot,
  pause,
  resume,
  cancel,
};
