import { z } from 'zod';

import { taskPageSnapshot } from '@tcg-cards/model/src/task';

import { os } from '../../index';
import { createTaskStore, createTaskController, createTaskScheduler, createTaskExecutor, createTaskEventPublisher, buildTaskPageSnapshot } from '#task/index';
import { getLocalDb } from '../../../lib/hearthstone/hsdata-local-db';
import { reanchorTaskType, reanchorDefinitionVersion, buildReanchorTaskRunInput, reanchorTaskDefinition, setCurrentReanchorCtx } from '../../../lib/hearthstone/task/reanchor';

const publishStreamInput = z.strictObject({
  publishTarget: z.literal('hearthstone'),
  environment: z.string().trim().min(1),
});

let _store: ReturnType<typeof createTaskStore>;
function getStore() {
  if (!_store) _store = createTaskStore(getLocalDb());
  return _store;
}
function getController() {
  const s = getStore();
  return createTaskController(s, createTaskScheduler(s));
}

const create = os
  .input(publishStreamInput)
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    const runInput = buildReanchorTaskRunInput(input);
    const controlResult = await getController().createTask(runInput, reanchorTaskDefinition);
    const snapshot = await getStore().getTaskRun(controlResult.taskRunId);
    if (!snapshot) return { pageTask: { kind: 'idle' }, stages: [] };

    setCurrentReanchorCtx(controlResult.taskRunId, getStore());

    const executor = createTaskExecutor(getStore(), createTaskEventPublisher());
    void executor.runTask(snapshot);

    return buildTaskPageSnapshot(snapshot);
  });

const snapshot = os
  .input(publishStreamInput)
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    const runInput = buildReanchorTaskRunInput(input);
    const active = await getStore().getActiveTaskRun(reanchorTaskType, runInput.scope.type, runInput.scope.key);
    if (!active) return { pageTask: { kind: 'idle' }, stages: [] };
    const snap = await getStore().getTaskRun(active.id);
    if (!snap) return { pageTask: { kind: 'idle' }, stages: [] };
    return buildTaskPageSnapshot(snap);
  });

export const reanchorRouter = { create, snapshot };
