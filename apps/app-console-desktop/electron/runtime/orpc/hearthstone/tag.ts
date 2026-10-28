import { listTags, getTag, saveTagEdit } from '@tcg-cards/console-api/lib/hearthstone/tag-commit';
import {
  tagGetInput,
  tagListInput,
  tagListResult,
  tagProfile,
  tagUpdateInput,
} from '@tcg-cards/model/hearthstone/schema/tag';

import { getLocalDb } from '../../lib/hearthstone/hsdata-local-db';
import { getIncompletePushBatch, listPushBatches } from '../../lib/hearthstone/tag-push-progress';
import { os } from '../index';
import { z } from 'zod';

const list = os
  .route({
    method:      'GET',
    description: 'List local Hearthstone tag configurations',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Tag'],
  })
  .input(tagListInput)
  .output(tagListResult)
  .handler(async ({ input }) => await listTags(getLocalDb(), input));

const get = os
  .route({
    method:      'GET',
    description: 'Get one local Hearthstone tag configuration',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Tag'],
  })
  .input(tagGetInput)
  .output(tagProfile)
  .handler(async ({ input }) => await getTag(getLocalDb(), input.enumId));

const manualUpdate = os
  .route({
    method:      'PUT',
    description: 'Save one local Hearthstone tag edit',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Tag'],
  })
  .input(tagUpdateInput)
  .output(tagProfile)
  .handler(async ({ input }) => await getLocalDb().transaction(async tx => await saveTagEdit(tx, input, {
    syncStatus:     'pending_push',
    editorRuntime:  'desktop',
    editorIdentity: 'unknown',
    editorSource:   'manual',
    conflictTarget: { processingSide: 'local', processingStage: 'apply' },
  })));

const pushBatchProfile = z.strictObject({
  id:              z.string(),
  stream:          z.string(),
  consumer:        z.string(),
  status:          z.string(),
  pushedCount:     z.number(),
  duplicateCount:  z.number(),
  blockedReason:   z.string().nullable(),
  blockedMessage:  z.string().nullable(),
  blockedSequence: z.number().nullable(),
  startedAt:       z.string(),
  completedAt:     z.string().nullable(),
  createdAt:       z.string(),
});

/** Reads the latest saved push batch that did not reach a terminal state. */
const incompletePushBatch = os
  .route({
    method:      'GET',
    description: 'Read the latest incomplete local tag push batch',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Tag'],
  })
  .output(z.object({ id: z.string(), stream: z.string(), startedAt: z.string() }).nullable())
  .handler(async () => await getIncompletePushBatch());

/** Lists recent local push batches without opening a remote connection. */
const pushHistory = os
  .route({
    method:      'GET',
    description: 'List recent local tag push batches',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Tag'],
  })
  .output(z.array(pushBatchProfile))
  .handler(async () => {
    const rows = await listPushBatches(20);
    return rows.map(row => ({
      id:              row.id,
      stream:          row.stream,
      consumer:        row.consumer,
      status:          row.status,
      pushedCount:     row.pushedCount,
      duplicateCount:  row.duplicateCount,
      blockedReason:   row.blockedReason ?? null,
      blockedMessage:  row.blockedMessage ?? null,
      blockedSequence: row.blockedSequence ?? null,
      startedAt:       row.startedAt instanceof Date ? row.startedAt.toISOString() : String(row.startedAt),
      completedAt:     row.completedAt == null ? null : row.completedAt instanceof Date ? row.completedAt.toISOString() : String(row.completedAt),
      createdAt:       row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    }));
  });

export const tagRouter = {
  list,
  get,
  manualUpdate,
  getIncompletePushBatch: incompletePushBatch,
  listPushBatches:        pushHistory,
};
