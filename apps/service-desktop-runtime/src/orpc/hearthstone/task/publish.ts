import { z } from 'zod';

import { taskPageSnapshot } from '@tcg-cards/model/src/task';

import { os } from '../../index';
import { createTaskStore, buildTaskPageSnapshot, getTaskDefinition } from '#task/index';
import { getLocalDb } from '../../../lib/hearthstone/hsdata-local-db';
import {
  buildPublishTaskScopeKey,
  buildPublishTaskScope,
  publishTaskDefinitionVersion,
  publishTaskScopeType,
  publishTaskType,
} from '../../../lib/hearthstone/task/publish/definition';

const store = createTaskStore(getLocalDb());
const publishStreamInput = z.strictObject({
  publishTarget: z.literal('hearthstone'),
  environment: z.string().trim().min(1),
});

const create = os
  .route({
    method:      'POST',
    description: 'Create a publish task and return the initial snapshot',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Task'],
  })
  .input(z.strictObject({
    publishTarget: z.literal('hearthstone'),
    environment: z.string().trim().min(1),
    dryRun: z.boolean().optional(),
  }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    const ctx = { publishTarget: input.publishTarget, environment: input.environment, publishType: 'card_data' as const };
    const scopeKey = buildPublishTaskScopeKey(ctx);
    const active = await store.getActiveTaskRun(publishTaskType, publishTaskScopeType, scopeKey);
    if (active) throw new Error(`Publish task already exists for stream ${scopeKey}`);

    const definition = getTaskDefinition(publishTaskType);
    const runInput = {
      taskType: publishTaskType,
      definitionVersion: publishTaskDefinitionVersion,
      scope: buildPublishTaskScope(ctx),
      params: { publishType: 'card_data', dryRun: input.dryRun, operationKind: 'publish' },
    };

    const stagePlans = await definition.buildStagePlan(runInput);
    const snap = await store.createTaskRun({ run: runInput, supportsResume: false, stages: stagePlans });

    const { createTaskExecutor } = await import('#task/executor');
    const { setCurrentTaskRunCtx } = await import('../../../lib/hearthstone/task/publish/definition');
    setCurrentTaskRunCtx(snap.run.id, store);
    void createTaskExecutor(store).runTask(snap);

    return buildTaskPageSnapshot(snap);
  });

const snapshot = os
  .route({
    method:      'GET',
    description: 'Read the current publish task snapshot',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Task'],
  })
  .input(publishStreamInput)
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    const ctx = { publishTarget: input.publishTarget, environment: input.environment, publishType: 'card_data' as const };
    const scopeKey = buildPublishTaskScopeKey(ctx);
    const active = await store.getActiveTaskRun(publishTaskType, publishTaskScopeType, scopeKey);
    if (!active) return { pageTask: { kind: 'idle' }, stages: [] };
    const snap = await store.getTaskRun(active.id);
    if (!snap) return { pageTask: { kind: 'idle' }, stages: [] };
    return buildTaskPageSnapshot(snap);
  });

const cancel = os
  .route({
    method:      'POST',
    description: 'Cancel one active publish task',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Task'],
  })
  .input(z.strictObject({ taskRunId: z.string().uuid() }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    const snap = await store.getTaskRun(input.taskRunId);
    if (!snap) throw new Error(`Task run ${input.taskRunId} does not exist`);

    const cancelable: readonly string[] = ['pending', 'running', 'pausing', 'paused', 'resuming'];
    if (!cancelable.includes(snap.run.status)) {
      throw new Error(`Task run ${input.taskRunId} is in status "${snap.run.status}" and cannot be canceled`);
    }

    await store.updateTaskRun(input.taskRunId, { status: 'canceling', controlRequestKind: 'cancel' });
    return { pageTask: { kind: 'idle' }, stages: [] } as const;
  });

export const publishRouter = { create, snapshot, cancel };
