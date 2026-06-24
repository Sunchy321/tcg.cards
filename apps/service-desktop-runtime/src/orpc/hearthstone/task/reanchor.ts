import { z } from 'zod';

import { taskPageSnapshot } from '@tcg-cards/model/src/task';

import { os } from '../../index';
import { createTaskStore, createTaskController, createTaskScheduler, buildTaskPageSnapshot } from '#task/index';
import { getLocalDb } from '../../../lib/hearthstone/hsdata-local-db';
import { reanchorTaskType, reanchorDefinitionVersion, buildReanchorTaskRunInput, reanchorTaskDefinition } from '../../../lib/hearthstone/task/reanchor';

const publishStreamInput = z.strictObject({
  publishTarget: z.literal('hearthstone'),
  environment: z.string().trim().min(1),
});

const store = createTaskStore(getLocalDb());
const controller = createTaskController(store, createTaskScheduler(store));

const create = os
  .route({
    method:      'POST',
    description: 'Create a reanchor task and return the initial snapshot',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Task'],
  })
  .input(publishStreamInput)
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    const runInput = buildReanchorTaskRunInput(input);
    const controlResult = await controller.createTask(runInput, reanchorTaskDefinition);
    const snapshot = await store.getTaskRun(controlResult.taskRunId);
    if (!snapshot) return { pageTask: { kind: 'idle' }, stages: [] };

    const { createTaskExecutor } = await import('#task/executor');
    const { executeReanchorStageBlock } = await import('../../../lib/hearthstone/task/reanchor/definition');

    const def = await import('#task/registry').then(m => m.getTaskDefinition(reanchorTaskType));
    def.buildBlocks = ({ stage }) => [{ blockKey: `${stage.stageKey}:run`, effectModel: 'atomic', payload: { stageKey: stage.stageKey } }];
    def.executeBlock = async (input: any) => {
      await executeReanchorStageBlock(input, store, controlResult.taskRunId);
    };

    const executor = createTaskExecutor(store);
    void executor.runTask(snapshot);

    return buildTaskPageSnapshot(snapshot);
  });

const snapshot = os
  .route({
    method:      'GET',
    description: 'Read the current reanchor task snapshot',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Task'],
  })
  .input(publishStreamInput)
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    const runInput = buildReanchorTaskRunInput(input);
    const active = await store.getActiveTaskRun(reanchorTaskType, runInput.scope.type, runInput.scope.key);
    if (!active) return { pageTask: { kind: 'idle' }, stages: [] };
    const snap = await store.getTaskRun(active.id);
    if (!snap) return { pageTask: { kind: 'idle' }, stages: [] };
    return buildTaskPageSnapshot(snap);
  });

export const reanchorRouter = { create, snapshot };
