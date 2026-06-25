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
    return createAndRunTask(reanchorTaskType, buildReanchorTaskRunInput(input));
  });

export const createTask = { publish, reanchor };
