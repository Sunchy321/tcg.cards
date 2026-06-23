import { ORPCError, eventIterator } from '@orpc/server';
import { z } from 'zod';

import { taskPageEvent, taskPageSnapshot } from '@tcg-cards/model/src/task';

import { os } from './index';
import { createTaskStore } from '#task/store';
import { buildTaskPageSnapshot } from '#task/snapshot';
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
  .route({
    method:      'POST',
    description: 'Create a test heavy-task and start execution',
    tags:        ['Desktop Runtime', 'Test'],
  })
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

    const executor = createTaskExecutor(getStore());

    // Run the task in background via the generic executor
    void executor.runTask(snapshot);

    return buildTaskPageSnapshot(snapshot);
  });

/** Returns the current snapshot for one test-work task. */
const snapshot = os
  .route({
    method:      'GET',
    description: 'Read the current test-work task snapshot',
    tags:        ['Desktop Runtime', 'Test'],
  })
  .input(z.strictObject({
    taskRunId: z.string().uuid(),
  }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    const snap = await getStore().getTaskRun(input.taskRunId);
    if (!snap) return { pageTask: { kind: 'idle' }, stages: [] };
    return buildTaskPageSnapshot(snap);
  });

/** Streams test-work task snapshot changes. */
const watch = os
  .route({
    method:      'GET',
    description: 'Stream test-work task snapshot changes',
    tags:        ['Desktop Runtime', 'Test'],
  })
  .output(eventIterator(taskPageEvent))
  .handler(async function* () {
    // The watch endpoint is a polling placeholder.
    // Real-time event streaming will be added with the generic event publisher.
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  });

/** Pauses one running test-work task. */
const pause = os
  .route({
    method:      'POST',
    description: 'Pause one running test-work task',
    tags:        ['Desktop Runtime', 'Test'],
  })
  .input(z.strictObject({ taskRunId: z.string().uuid() }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    const snap = await getStore().getTaskRun(input.taskRunId);
    if (!snap) throw new ORPCError('NOT_FOUND', { message: 'Task not found' });

    await getStore().updateTaskRun(input.taskRunId, { controlRequestKind: 'pause' });

    const updated = await getStore().getTaskRun(input.taskRunId);
    return buildTaskPageSnapshot(updated!);
  });

/** Resumes one paused test-work task. */
const resume = os
  .route({
    method:      'POST',
    description: 'Resume one paused test-work task',
    tags:        ['Desktop Runtime', 'Test'],
  })
  .input(z.strictObject({ taskRunId: z.string().uuid() }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    const snap = await getStore().getTaskRun(input.taskRunId);
    if (!snap) throw new ORPCError('NOT_FOUND', { message: 'Task not found' });

    await getStore().updateTaskRun(input.taskRunId, { controlRequestKind: 'resume' });

    const updated = await getStore().getTaskRun(input.taskRunId);
    return buildTaskPageSnapshot(updated!);
  });

/** Cancels one test-work task through the generic executor's control mechanism. */
const cancel = os
  .route({
    method:      'POST',
    description: 'Cancel one running test-work task',
    tags:        ['Desktop Runtime', 'Test'],
  })
  .input(z.strictObject({ taskRunId: z.string().uuid() }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    await getStore().updateTaskRun(input.taskRunId, {
      controlRequestKind: 'cancel',
    });

    const updated = await getStore().getTaskRun(input.taskRunId);
    return buildTaskPageSnapshot(updated!);
  });

/** Groups the test-task procedures under one router namespace. */
export const testRouter = {
  create,
  snapshot,
  watch,
  pause,
  resume,
  cancel,
};
