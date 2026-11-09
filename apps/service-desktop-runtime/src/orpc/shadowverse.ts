import { z } from 'zod';

import { taskPageSnapshot } from '@tcg-cards/model/task';

import { os } from './index';
import { createAndRunTask } from './task';
import { cardsImportTaskDefinition } from '../lib/shadowverse/task/cards-import/definition';
import { imageImportTaskDefinition } from '../lib/shadowverse/task/image-import/definition';
import { evolveCardsImportTaskDefinition } from '../lib/shadowverse-evolve/task/cards-import/definition';
import { evolveImagesImportTaskDefinition } from '../lib/shadowverse-evolve/task/images-import/definition';

/** Creates one full five-language Shadowverse card-data import task. */
const createCardsImport = os
  .input(z.strictObject({}))
  .output(taskPageSnapshot)
  .handler(async () => {
    const resolved = cardsImportTaskDefinition.resolveScope({});

    return createAndRunTask(cardsImportTaskDefinition.taskType, {
      taskType:          cardsImportTaskDefinition.taskType,
      definitionVersion: cardsImportTaskDefinition.definitionVersion,
      scope:             {
        type:     cardsImportTaskDefinition.scopeType,
        key:      resolved.key,
        snapshot: resolved.snapshot as Record<string, unknown>,
      },
      params: {},
    });
  });

/** Creates one card-image download task covering all current localization hashes. */
const createImagesImport = os
  .input(z.strictObject({}))
  .output(taskPageSnapshot)
  .handler(async () => {
    const resolved = imageImportTaskDefinition.resolveScope({});

    return createAndRunTask(imageImportTaskDefinition.taskType, {
      taskType:          imageImportTaskDefinition.taskType,
      definitionVersion: imageImportTaskDefinition.definitionVersion,
      scope:             {
        type:     imageImportTaskDefinition.scopeType,
        key:      resolved.key,
        snapshot: resolved.snapshot as Record<string, unknown>,
      },
      params: {},
    });
  });

/** Creates one full three-source Evolve card-data import task. */
const createEvolveCardsImport = os
  .input(z.strictObject({}))
  .output(taskPageSnapshot)
  .handler(async () => {
    const resolved = evolveCardsImportTaskDefinition.resolveScope({});

    return createAndRunTask(evolveCardsImportTaskDefinition.taskType, {
      taskType:          evolveCardsImportTaskDefinition.taskType,
      definitionVersion: evolveCardsImportTaskDefinition.definitionVersion,
      scope:             {
        type:     evolveCardsImportTaskDefinition.scopeType,
        key:      resolved.key,
        snapshot: resolved.snapshot as Record<string, unknown>,
      },
      params: {},
    });
  });

/** Creates one Evolve card-image download task covering both official languages. */
const createEvolveImagesImport = os
  .input(z.strictObject({}))
  .output(taskPageSnapshot)
  .handler(async () => {
    const resolved = evolveImagesImportTaskDefinition.resolveScope({});

    return createAndRunTask(evolveImagesImportTaskDefinition.taskType, {
      taskType:          evolveImagesImportTaskDefinition.taskType,
      definitionVersion: evolveImagesImportTaskDefinition.definitionVersion,
      scope:             {
        type:     evolveImagesImportTaskDefinition.scopeType,
        key:      resolved.key,
        snapshot: resolved.snapshot as Record<string, unknown>,
      },
      params: {},
    });
  });

/** Shadowverse import procedures exposed to desktop clients. */
export const shadowverseRouter = {
  createCardsImport,
  createImagesImport,
  createEvolveCardsImport,
  createEvolveImagesImport,
};
