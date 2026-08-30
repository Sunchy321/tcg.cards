import { z } from 'zod';

import { taskPageSnapshot } from '@tcg-cards/model/task';

import { os } from './index';
import { createAndRunTask } from './task';
import { listMtgchArchives, listMtgjsonFiles, listScryfallFiles } from '../lib/magic/data-dir';
import { resolvePath } from '../lib/game-paths';
import { magicScryfallImportTaskDefinition } from '../lib/magic/task/scryfall-import';
import { magicMtgchImportTaskDefinition } from '../lib/magic/task/mtgch-import';
import { magicMtgjsonImportTaskDefinition } from '../lib/magic/task/mtgjson-import';
import { magicGathererImportTaskDefinition } from '../lib/magic/task/gatherer-import';

const magicDataFile = z.strictObject({
  name: z.string(),
  path: z.string(),
});

const magicDataState = z.strictObject({
  dataDir:  z.string().nullable(),
  scryfall: z.array(magicDataFile),
  mtgch:    z.strictObject({
    archives: z.array(magicDataFile),
  }),
  mtgjson: z.strictObject({
    dir:       z.string().nullable(),
    fileCount: z.number(),
  }),
});

const getDataState = os
  .route({
    method:      'GET',
    description: 'Read the configured Magic data directory and its discovered source files',
    tags:        ['Desktop Runtime', 'Magic'],
  })
  .output(magicDataState)
  .handler(async () => {
    const dataDir = resolvePath('magic.data');
    const scryfallDir = resolvePath('magic.data.scryfall');
    const mtgchDir = resolvePath('magic.data.mtgch');
    const mtgjsonDir = resolvePath('magic.data.mtgjson');
    const mtgjson = mtgjsonDir != null ? listMtgjsonFiles(mtgjsonDir) : { dir: null, fileCount: 0 };
    return {
      dataDir,
      scryfall: scryfallDir != null ? listScryfallFiles(scryfallDir) : [],
      mtgch:    { archives: mtgchDir != null ? listMtgchArchives(mtgchDir) : [] },
      mtgjson:  { dir: mtgjson.dir, fileCount: mtgjson.fileCount },
    };
  });

const scryfallImport = os
  .input(z.strictObject({
    cards:   z.string().optional(),
    rulings: z.string().optional(),
  }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    return createAndRunTask(magicScryfallImportTaskDefinition.taskType, {
      taskType:          magicScryfallImportTaskDefinition.taskType,
      definitionVersion: magicScryfallImportTaskDefinition.definitionVersion,
      scope:             { type: magicScryfallImportTaskDefinition.scopeType, key: 'global', snapshot: {} },
      params:            { cards: input.cards, rulings: input.rulings },
    });
  });

const mtgchImport = os
  .input(z.strictObject({
    archive: z.string().min(1),
  }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    return createAndRunTask(magicMtgchImportTaskDefinition.taskType, {
      taskType:          magicMtgchImportTaskDefinition.taskType,
      definitionVersion: magicMtgchImportTaskDefinition.definitionVersion,
      scope:             { type: magicMtgchImportTaskDefinition.scopeType, key: 'global', snapshot: {} },
      params:            { archive: input.archive },
    });
  });

const mtgjsonImport = os
  .input(z.strictObject({
    dir: z.string().min(1),
  }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    return createAndRunTask(magicMtgjsonImportTaskDefinition.taskType, {
      taskType:          magicMtgjsonImportTaskDefinition.taskType,
      definitionVersion: magicMtgjsonImportTaskDefinition.definitionVersion,
      scope:             { type: magicMtgjsonImportTaskDefinition.scopeType, key: 'global', snapshot: {} },
      params:            { dir: input.dir },
    });
  });

const gathererImport = os
  .input(z.strictObject({
    level:       z.enum(['fill', 'refresh', 'refresh_all', 'force']).optional(),
    from:        z.number().int().min(1).optional(),
    to:          z.number().int().min(1).optional(),
    concurrency: z.number().int().min(1).max(16).optional(),
  }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    return createAndRunTask(magicGathererImportTaskDefinition.taskType, {
      taskType:          magicGathererImportTaskDefinition.taskType,
      definitionVersion: magicGathererImportTaskDefinition.definitionVersion,
      scope:             { type: magicGathererImportTaskDefinition.scopeType, key: 'global', snapshot: {} },
      params:            { level: input.level, from: input.from, to: input.to, concurrency: input.concurrency },
    });
  });

export const magicRouter = {
  getDataState,
  createTask: { scryfallImport, mtgchImport, mtgjsonImport, gathererImport },
};
