import { z } from 'zod';

import { taskPageSnapshot } from '@tcg-cards/model/src/task';
import { os } from '../index';
import { createAndRunTask, getStore } from '../task';
import {
  buildPublishTaskScopeKey,
  buildPublishTaskScope,
  publishTaskDefinitionVersion,
  publishTaskScopeType,
  publishTaskType,
} from '../../lib/hearthstone/task/publish/definition';
import {
  reanchorTaskType,
  reanchorDefinitionVersion,
  buildReanchorTaskRunInput,
} from '../../lib/hearthstone/task/reanchor';

/** If there's an active task on this scope from a previous boot, abandon it. */
async function abandonStaleTask(taskType: string, scopeType: string, scopeKey: string): Promise<void> {
  const active = await getStore().getActiveTaskRun(taskType, scopeType, scopeKey);
  if (!active) return;
  await getStore().updateTaskRun(active.id, {
    status: 'abandoned',
    terminalReason: 'abandoned_stale_run',
    finishedAt: new Date(),
    controlRequestKind: null,
    currentStageKey: null,
    currentStageIndex: null,
    currentResumeMode: null,
    pausedResumeMode: null,
  });
}

const publish = os
  .input(z.strictObject({
    publishTarget: z.literal('hearthstone'),
    environment: z.string().trim().min(1),
    dryRun: z.boolean().optional(),
  }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    const ctx = { publishTarget: input.publishTarget, environment: input.environment, publishType: 'card_data' as const };
    const scopeKey = buildPublishTaskScopeKey(ctx);
    await abandonStaleTask(publishTaskType, publishTaskScopeType, scopeKey);
    const active = await getStore().getActiveTaskRun(publishTaskType, publishTaskScopeType, scopeKey);
    if (active) throw new Error(`Publish task already exists for stream ${scopeKey}`);

    return createAndRunTask(publishTaskType, {
      taskType: publishTaskType,
      definitionVersion: publishTaskDefinitionVersion,
      scope: buildPublishTaskScope(ctx),
      params: { publishType: 'card_data', dryRun: input.dryRun, operationKind: 'publish' },
    });
  });

const reanchor = os
  .input(z.strictObject({
    publishTarget: z.literal('hearthstone'),
    environment: z.string().trim().min(1),
  }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    await abandonStaleTask(reanchorTaskType, publishTaskScopeType, `${input.publishTarget}:${input.environment}:reanchor`);
    return createAndRunTask(reanchorTaskType, buildReanchorTaskRunInput(input));
  });

export const createTask = { publish, reanchor };
