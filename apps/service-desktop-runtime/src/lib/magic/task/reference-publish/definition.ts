import { z } from 'zod';

import { createDb } from '@tcg-cards/db';

import { createDefinition } from '../../../task/definition';
import { getLocalDb } from '../../../hearthstone/hsdata-local-db';
import { requireMagicPublishTargetByIdentity } from '../../magic-publish-target';
import { publishReferences, referenceStore } from '../../set-import/publish';

/** Stable task type for mirroring magic reference data. */
export const referencePublishTaskType = 'magic_reference_publish';

const input = z.object({
  dryRun: z.boolean().optional().default(false),
});

const output = z.object({
  formatCount:       z.number(),
  setCount:          z.number(), localizationCount: z.number(), boosterCount:      z.number(),
  sheetCount:        z.number(), sheetCardCount:    z.number(), packCount:         z.number(), packContentCount:  z.number(),
  totalRowCount:     z.number(),
  changedRowCount:   z.number(),
  dryRun:            z.boolean(),
});

const publishStreamScope = z.object({
  publishTarget: z.string(),
  environment:   z.string(),
});

/** Publishes formats, series, translated names and complete boosters as one remote transaction. */
export const referencePublishTaskDefinition = createDefinition(referencePublishTaskType, { version: '2026-10-17:v1' })
  .scope(publishStreamScope, {
    type:    'publish_stream' as const,
    resolve: scope => ({
      key:      `${scope.publishTarget}:${scope.environment}:reference_data`,
      snapshot: scope,
    }),
  })
  .input(input)
  .output(output)
  .context({
    init: (input, scope) => ({
      target: requireMagicPublishTargetByIdentity(scope.publishTarget, scope.environment),
      dryRun: input.dryRun ?? false,
    }),
  })
  .stage('mirror_references', { label: '发布赛制、系列与补充包', progressMode: 'simple' })
  .handler(async ({ ctx }) => {
    const { target, dryRun } = ctx;
    const remoteDb = createDb(target.connectionString);
    try {
      return await publishReferences(referenceStore(getLocalDb(), remoteDb), dryRun);
    } finally {
      await remoteDb.$client.end({ timeout: 1 });
    }
  })
  .build();
