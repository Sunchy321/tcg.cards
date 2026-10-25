import { listTags, getTag, saveTagEdit } from '@tcg-cards/console-api/lib/hearthstone/tag-commit';
import {
  tagGetInput,
  tagListInput,
  tagListResult,
  tagProfile,
  tagUpdateInput,
} from '@tcg-cards/model/hearthstone/schema/tag';

import { getLocalDb } from '../../lib/hearthstone/hsdata-local-db';
import { os } from '../index';

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

export const tagRouter = {
  list,
  get,
  manualUpdate,
};
