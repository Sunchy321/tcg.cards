import { eventIterator } from '@orpc/server';
import { z } from 'zod';

import { taskPageEvent, taskPageSnapshot } from '@tcg-cards/model/src/task';

import { os } from '../../index';
import { createTaskStore, createTaskController, createTaskScheduler, createTaskExecutor, createTaskEventPublisher, buildTaskPageSnapshot, getTaskDefinition } from '#task/index';
import { getLocalDb } from '../../../lib/hearthstone/hsdata-local-db';
import {
  buildPublishTaskScopeKey,
  buildPublishTaskScope,
  publishTaskDefinitionVersion,
  publishTaskScopeType,
  publishTaskType,
  setCurrentTaskRunCtx,
} from '../../../lib/hearthstone/task/publish/definition';

let _store: ReturnType<typeof createTaskStore>;
function getStore() {
  if (!_store) _store = createTaskStore(getLocalDb());
  return _store;
}
function getController() {
  const s = getStore();
  return createTaskController(s, createTaskScheduler(s));
}
const publishStreamInput = z.strictObject({
  publishTarget: z.literal('hearthstone'),
  environment: z.string().trim().min(1),
});

const create = os
  .input(z.strictObject({
    publishTarget: z.literal('hearthstone'),
    environment: z.string().trim().min(1),
    dryRun: z.boolean().optional(),
  }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    const ctx = { publishTarget: input.publishTarget, environment: input.environment, publishType: 'card_data' as const };
    const scopeKey = buildPublishTaskScopeKey(ctx);
    const active = await getStore().getActiveTaskRun(publishTaskType, publishTaskScopeType, scopeKey);
    if (active) throw new Error(`Publish task already exists for stream ${scopeKey}`);

    const definition = getTaskDefinition(publishTaskType);
    const runInput = {
      taskType: publishTaskType,
      definitionVersion: publishTaskDefinitionVersion,
      scope: buildPublishTaskScope(ctx),
      params: { publishType: 'card_data', dryRun: input.dryRun, operationKind: 'publish' },
    };

    const stagePlans = await definition.buildStagePlan(runInput);
    const snap = await getStore().createTaskRun({ run: runInput, supportsResume: false, stages: stagePlans });

    setCurrentTaskRunCtx(snap.run.id, store);
    void createTaskExecutor(store, createTaskEventPublisher()).runTask(snap);

    return buildTaskPageSnapshot(snap);
  });

const snapshot = os
  .input(publishStreamInput)
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    const ctx = { publishTarget: input.publishTarget, environment: input.environment, publishType: 'card_data' as const };
    const scopeKey = buildPublishTaskScopeKey(ctx);
    const active = await getStore().getActiveTaskRun(publishTaskType, publishTaskScopeType, scopeKey);
    if (!active) return { pageTask: { kind: 'idle' }, stages: [] };
    const snap = await getStore().getTaskRun(active.id);
    if (!snap) return { pageTask: { kind: 'idle' }, stages: [] };
    return buildTaskPageSnapshot(snap);
  });

/** Streams real-time publish task events for one publish stream. */
const watch = os
  .input(publishStreamInput)
  .output(eventIterator(taskPageEvent))
  .handler(async function* ({ input }) {
    const ctx = { publishTarget: input.publishTarget, environment: input.environment, publishType: 'card_data' as const };
    const scopeKey = buildPublishTaskScopeKey(ctx);
    const active = await getStore().getActiveTaskRun(publishTaskType, publishTaskScopeType, scopeKey);
    if (!active) return;
    const snap = await getStore().getTaskRun(active.id);
    if (snap) yield buildTaskPageSnapshot(snap);
    yield* createTaskEventPublisher().watch(active.id);
  });

const cancel = os
  .input(z.strictObject({ taskRunId: z.uuid() }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    await getController().cancelTask(input.taskRunId);
    return { pageTask: { kind: 'idle' }, stages: [] } as const;
  });

export const publishRouter = { create, snapshot, watch, cancel };
