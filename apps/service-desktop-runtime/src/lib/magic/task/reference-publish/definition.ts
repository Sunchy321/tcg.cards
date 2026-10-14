import { z } from 'zod';

import { createDb } from '@tcg-cards/db';
import { Format as LocalFormat } from '@tcg-cards/db/schema/local/magic';
import { Format as RemoteFormat } from '@tcg-cards/db/schema/remote/magic';

import { createDefinition } from '#task/definition';
import { chunkValues } from '../../../hearthstone/hsdata-publish';
import { getLocalDb } from '../../../hearthstone/hsdata-local-db';
import { requireMagicPublishTargetByIdentity } from '../../magic-publish-target';

/** Stable task type for mirroring magic reference data. */
export const referencePublishTaskType = 'magic_reference_publish';

const input = z.object({
  dryRun: z.boolean().optional().default(false),
});

const output = z.object({
  formatCount:     z.number(),
  totalRowCount:   z.number(),
  changedRowCount: z.number(),
  dryRun:          z.boolean(),
});

const publishStreamScope = z.object({
  publishTarget: z.string(),
  environment:   z.string(),
});

/** Mirrors the local format table to the publish target as a full replace. */
export const referencePublishTaskDefinition = createDefinition(referencePublishTaskType, { version: '2026-10-15:v1' })
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
  .stage('mirror_formats', { label: 'Mirror formats to remote', progressMode: 'simple' })
  .handler(async ({ ctx }) => {
    const { target, dryRun } = ctx;
    const formats = await getLocalDb().select().from(LocalFormat);

    if (!dryRun) {
      const remoteDb = createDb(target.connectionString);
      try {
        await remoteDb.delete(RemoteFormat);
        for (const chunk of chunkValues(formats)) {
          await remoteDb.insert(RemoteFormat).values(chunk);
        }
      } finally {
        await remoteDb.$client.end({ timeout: 1 });
      }
    }

    return {
      formatCount:     formats.length,
      totalRowCount:   formats.length,
      changedRowCount: formats.length,
      dryRun,
    };
  })
  .build();
