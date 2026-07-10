import { z } from 'zod';

import { taskPageSnapshot } from '@tcg-cards/model/src/task';
import { os } from '../index';
import { createAndRunTask, getStore } from '../task';
import { publishTaskDefinition } from '../../lib/hearthstone/task/publish/definition';
import {
  reanchorTaskType,
  reanchorDefinitionVersion,
  buildReanchorTaskRunInput,
} from '../../lib/hearthstone/task/reanchor';
import { cardImageRequirementExportInput } from '@tcg-cards/model/src/hearthstone/schema/data/image';
import {
  imageRenderTaskType,
  buildImageRenderRunInput,
} from '../../lib/hearthstone/task/image-render';

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
    const scope = { publishTarget: input.publishTarget, environment: input.environment, publishType: 'card_data' as const };
    const resolved = publishTaskDefinition.resolveScope(scope);
    await abandonStaleTask(publishTaskDefinition.taskType, publishTaskDefinition.scopeType, resolved.key);
    const active = await getStore().getActiveTaskRun(publishTaskDefinition.taskType, publishTaskDefinition.scopeType, resolved.key);
    if (active) throw new Error(`Publish task already exists for stream ${resolved.key}`);

    return createAndRunTask(publishTaskDefinition.taskType, {
      taskType: publishTaskDefinition.taskType,
      definitionVersion: publishTaskDefinition.definitionVersion,
      scope: { type: publishTaskDefinition.scopeType, key: resolved.key, snapshot: resolved.snapshot as Record<string, unknown> },
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
    await abandonStaleTask(reanchorTaskType, publishTaskDefinition.scopeType, `${input.publishTarget}:${input.environment}:reanchor`);
    return createAndRunTask(reanchorTaskType, buildReanchorTaskRunInput(input));
  });

const imageRender = os
  .input(cardImageRequirementExportInput)
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    await abandonStaleTask(imageRenderTaskType, 'image_render', `hearthstone:${input.lang ?? 'all'}`);
    return createAndRunTask(imageRenderTaskType, buildImageRenderRunInput({
      ...input,
      scanAll: input.scanAll ?? false,
    }));
  });

const imageDownload = os
  .input(cardImageRequirementExportInput)
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    await abandonStaleTask(imageRenderTaskType, 'image_render', `hearthstone:${input.lang ?? 'all'}`);
    return createAndRunTask(imageRenderTaskType, buildImageRenderRunInput({
      ...input,
      scanAll: input.scanAll ?? false,
      outputMode: 'download',
    }));
  });

export const createTask = { publish, reanchor, imageRender, imageDownload };
