import { z } from 'zod';

import { taskPageSnapshot } from '@tcg-cards/model/task';

import { os } from './index';
import { createAndRunTask } from './task';
import { magicScryfallImportTaskDefinition } from '../lib/magic/task/scryfall-import';

const scryfallImport = os
  .input(z.strictObject({
    cards:   z.string().optional(),
    sets:    z.string().optional(),
    rulings: z.string().optional(),
  }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    return createAndRunTask(magicScryfallImportTaskDefinition.taskType, {
      taskType:          magicScryfallImportTaskDefinition.taskType,
      definitionVersion: magicScryfallImportTaskDefinition.definitionVersion,
      scope:             { type: magicScryfallImportTaskDefinition.scopeType, key: 'global', snapshot: {} },
      params:            { cards: input.cards, sets: input.sets, rulings: input.rulings },
    });
  });

export const magicRouter = {
  createTask: { scryfallImport },
};
