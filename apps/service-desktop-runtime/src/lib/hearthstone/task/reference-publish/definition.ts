import { z } from 'zod';

import { createDb } from '@tcg-cards/db';
import {
  Set as LocalSet,
  Format as LocalFormat,
  Patch as LocalPatch,
  Tag as LocalTag,
} from '@tcg-cards/db/schema/local/hearthstone';
import {
  Set as RemoteSet,
  Format as RemoteFormat,
  Patch as RemotePatch,
  Tag as RemoteTag,
} from '@tcg-cards/db/schema/remote/hearthstone';

import { createDefinition } from '#task/definition';
import { getLocalDb } from '../../hsdata-local-db';
import { requireHearthstonePublishTargetByIdentity } from '../../hsdata-publish-target';
import { chunkValues } from '../../hsdata-publish';

export const referencePublishTaskType = 'hearthstone_reference_publish';

const input = z.object({
  dryRun: z.boolean().optional().default(false),
});

const output = z.object({
  setsCount:       z.number(),
  formatsCount:    z.number(),
  patchesCount:    z.number(),
  tagsCount:       z.number(),
  totalRowCount:   z.number(),
  changedRowCount: z.number(),
  dryRun:          z.boolean(),
});

const publishStreamScope = z.object({
  publishTarget: z.string(),
  environment:   z.string(),
});

/** Mirrors the local small reference tables (sets/formats/patches/tags) to the publish target as a full replace. */
export const referencePublishTaskDefinition = createDefinition(referencePublishTaskType, { version: '2026-08-25:v1' })
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
    init: (input, scope) => {
      const target = requireHearthstonePublishTargetByIdentity(scope.publishTarget, scope.environment);
      return { target, dryRun: input.dryRun ?? false };
    },
  })
  .stage('mirror_reference', { label: 'Mirror reference tables to remote', progressMode: 'simple' })
  .handler(async ({ ctx }) => {
    const { target, dryRun } = ctx;
    const localDb = getLocalDb();

    const [sets, formats, patches, tags] = await Promise.all([
      localDb.select().from(LocalSet),
      localDb.select().from(LocalFormat),
      localDb.select().from(LocalPatch),
      localDb.select().from(LocalTag),
    ]);

    if (!dryRun) {
      const remoteDb = createDb(target.connectionString);
      try {
        // Full replace: these tables have no FK constraints, so delete-all first
        // is safe and keeps the remote set an exact mirror of local.
        await remoteDb.delete(RemoteSet);
        await remoteDb.delete(RemoteFormat);
        await remoteDb.delete(RemotePatch);
        await remoteDb.delete(RemoteTag);
        for (const chunk of chunkValues(sets)) {
          await remoteDb.insert(RemoteSet).values(chunk);
        }
        for (const chunk of chunkValues(formats)) {
          await remoteDb.insert(RemoteFormat).values(chunk);
        }
        for (const chunk of chunkValues(patches)) {
          await remoteDb.insert(RemotePatch).values(chunk);
        }
        for (const chunk of chunkValues(tags)) {
          await remoteDb.insert(RemoteTag).values(chunk);
        }
      } finally {
        await remoteDb.$client.end({ timeout: 1 });
      }
    }

    const totalRowCount = sets.length + formats.length + patches.length + tags.length;
    return {
      setsCount:       sets.length,
      formatsCount:    formats.length,
      patchesCount:    patches.length,
      tagsCount:       tags.length,
      totalRowCount,
      changedRowCount: totalRowCount,
      dryRun,
    };
  })
  .build();
