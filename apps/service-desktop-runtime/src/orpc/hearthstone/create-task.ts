import { z } from 'zod';

import { taskPageSnapshot } from '@tcg-cards/model/src/task';
import { os } from '../index';
import { createAndRunTask, getStore } from '../task';
import { publishTaskDefinition } from '../../lib/hearthstone/task/publish/definition';
import { pinTaskDefinition } from '../../lib/hearthstone/task/pin';
import { cardImageRequirementExportInput } from '@tcg-cards/model/src/hearthstone/schema/data/image';
import {
  imageRenderTaskType,
  buildImageRenderRunInput,
} from '../../lib/hearthstone/task/image-render';
import { hsdataImportTaskDefinition } from '../../lib/hearthstone/task/import';
import { projectTaskDefinition } from '../../lib/hearthstone/task/project';
import { unpackImportTaskDefinition } from '../../lib/hearthstone/task/unpack-import';

/** If there's an active task on this scope from a previous boot, abandon it. */
async function abandonStaleTask(taskType: string, scopeType: string, scopeKey: string): Promise<void> {
  const active = await getStore().getActiveTaskRun(taskType, scopeType, scopeKey);
  if (!active) return;
  await getStore().updateTaskRun(active.id, {
    status:             'abandoned',
    terminalReason:     'abandoned_stale_run',
    finishedAt:         new Date(),
    controlRequestKind: null,
    currentStageKey:    null,
    currentStageIndex:  null,
    currentResumeMode:  null,
    pausedResumeMode:   null,
  });
}

const publish = os
  .input(z.strictObject({
    publishTarget: z.literal('hearthstone'),
    environment:   z.string().trim().min(1),
    dryRun:        z.boolean().optional(),
    force:         z.boolean().optional(),
  }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    const scope = { publishTarget: input.publishTarget, environment: input.environment, publishType: 'card_data' as const };
    const resolved = publishTaskDefinition.resolveScope(scope);
    await abandonStaleTask(publishTaskDefinition.taskType, publishTaskDefinition.scopeType, resolved.key);
    const active = await getStore().getActiveTaskRun(publishTaskDefinition.taskType, publishTaskDefinition.scopeType, resolved.key);
    if (active) throw new Error(`Publish task already exists for stream ${resolved.key}`);

    return createAndRunTask(publishTaskDefinition.taskType, {
      taskType:          publishTaskDefinition.taskType,
      definitionVersion: publishTaskDefinition.definitionVersion,
      scope:             { type: publishTaskDefinition.scopeType, key: resolved.key, snapshot: resolved.snapshot as Record<string, unknown> },
      params:            { publishType: 'card_data', dryRun: input.dryRun, operationKind: 'publish', force: input.force },
    });
  });

const pin = os
  .input(z.strictObject({
    publishTarget: z.literal('hearthstone'),
    environment:   z.string().trim().min(1),
  }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    const scope = { publishTarget: input.publishTarget, environment: input.environment };
    const resolved = pinTaskDefinition.resolveScope(scope);
    await abandonStaleTask(pinTaskDefinition.taskType, pinTaskDefinition.scopeType, resolved.key);
    const active = await getStore().getActiveTaskRun(pinTaskDefinition.taskType, pinTaskDefinition.scopeType, resolved.key);
    if (active) throw new Error(`Pin task already exists for stream ${resolved.key}`);

    return createAndRunTask(pinTaskDefinition.taskType, {
      taskType:          pinTaskDefinition.taskType,
      definitionVersion: pinTaskDefinition.definitionVersion,
      scope:             { type: pinTaskDefinition.scopeType, key: resolved.key, snapshot: resolved.snapshot as Record<string, unknown> },
      params:            { publishTarget: input.publishTarget, environment: input.environment },
    });
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
      scanAll:    input.scanAll ?? false,
      outputMode: 'download',
    }));
  });

/** Creates one single or batch hsdata import task. */
const hsdataImport = os
  .input(z.strictObject({
    sourceIds: z.array(z.string().trim().min(1)).min(1),
    dryRun:    z.boolean().optional(),
    force:     z.boolean().optional(),
    patchOnly: z.boolean().optional(),
  }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    const scope = { sourceIds: input.sourceIds };
    const resolved = hsdataImportTaskDefinition.resolveScope(scope);
    const active = await getStore().getActiveTaskRun(
      hsdataImportTaskDefinition.taskType,
      hsdataImportTaskDefinition.scopeType,
      resolved.key,
    );
    if (active) throw new Error('An hsdata import task is already active');

    return createAndRunTask(hsdataImportTaskDefinition.taskType, {
      taskType:          hsdataImportTaskDefinition.taskType,
      definitionVersion: hsdataImportTaskDefinition.definitionVersion,
      scope:             {
        type:     hsdataImportTaskDefinition.scopeType,
        key:      resolved.key,
        snapshot: resolved.snapshot as Record<string, unknown>,
      },
      params: input,
    });
  });

/** Creates one single or batch hsdata projection task. */
const hsdataProjection = os
  .input(z.strictObject({
    sourceTags:       z.array(z.number().int().nonnegative()).min(1),
    dryRun:           z.boolean().optional(),
    force:            z.boolean().optional(),
    skipLatestUpdate: z.boolean().optional(),
    sampleDiff:       z.boolean().optional(),
  }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    const scope = { sourceTags: input.sourceTags };
    const resolved = projectTaskDefinition.resolveScope(scope);
    const active = await getStore().getActiveTaskRun(
      projectTaskDefinition.taskType,
      projectTaskDefinition.scopeType,
      resolved.key,
    );
    if (active) throw new Error('An hsdata projection task is already active');

    return createAndRunTask(projectTaskDefinition.taskType, {
      taskType:          projectTaskDefinition.taskType,
      definitionVersion: projectTaskDefinition.definitionVersion,
      scope:             {
        type:     projectTaskDefinition.scopeType,
        key:      resolved.key,
        snapshot: resolved.snapshot as Record<string, unknown>,
      },
      params: input,
    });
  });

const unpackImport = os
  .input(z.strictObject({
    zipName: z.string().trim().min(1),
    dryRun:  z.boolean().optional(),
  }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    const scope = { zipName: input.zipName };
    const resolved = unpackImportTaskDefinition.resolveScope(scope);
    const active = await getStore().getActiveTaskRun(
      unpackImportTaskDefinition.taskType,
      unpackImportTaskDefinition.scopeType,
      resolved.key,
    );
    if (active) throw new Error('An unpack import task is already active');

    return createAndRunTask(unpackImportTaskDefinition.taskType, {
      taskType:          unpackImportTaskDefinition.taskType,
      definitionVersion: unpackImportTaskDefinition.definitionVersion,
      scope:             {
        type:     unpackImportTaskDefinition.scopeType,
        key:      resolved.key,
        snapshot: resolved.snapshot as Record<string, unknown>,
      },
      params: input,
    });
  });

export const createTask = { publish, pin, imageRender, imageDownload, hsdataImport, hsdataProjection, unpackImport };
