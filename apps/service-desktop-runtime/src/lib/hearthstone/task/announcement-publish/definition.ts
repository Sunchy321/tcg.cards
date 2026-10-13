import { z } from 'zod';

import { createDb } from '@tcg-cards/db';
import {
  Announcement as LocalAnnouncement,
  AnnouncementItem as LocalAnnouncementItem,
} from '@tcg-cards/db/schema/local/hearthstone';
import {
  Announcement as RemoteAnnouncement,
  AnnouncementItem as RemoteAnnouncementItem,
} from '@tcg-cards/db/schema/remote/hearthstone';

import { createDefinition } from '#task/definition';
import { getLocalDb } from '../../hsdata-local-db';
import { requireHearthstonePublishTargetByIdentity } from '../../hsdata-publish-target';
import { chunkValues } from '../../hsdata-publish';

export const announcementPublishTaskType = 'hearthstone_announcement_publish';

const input = z.object({
  dryRun: z.boolean().optional().default(false),
});

const output = z.object({
  announcementCount: z.number(),
  itemCount:         z.number(),
  totalRowCount:     z.number(),
  changedRowCount:   z.number(),
  dryRun:            z.boolean(),
});

const publishStreamScope = z.object({
  publishTarget: z.string(),
  environment:   z.string(),
});

/** Mirrors the local announcement tables to the publish target as a full replace. */
export const announcementPublishTaskDefinition = createDefinition(announcementPublishTaskType, { version: '2026-08-07:v1' })
  .scope(publishStreamScope, {
    type:    'publish_stream' as const,
    resolve: scope => ({
      key:      `${scope.publishTarget}:${scope.environment}:announcement_data`,
      snapshot: scope,
    }),
  })
  .input(input)
  .output(output)
  .context({
    init: (input, scope) => {
      const target = requireHearthstonePublishTargetByIdentity(scope.publishTarget, scope.environment);
      return {
        target,
        dryRun: input.dryRun ?? false,
      };
    },
  })
  .stage('mirror_announcements', { label: 'Mirror announcements to remote', progressMode: 'simple' })
  .handler(async ({ ctx }) => {
    const { target, dryRun } = ctx;
    const localDb = getLocalDb();

    const localAnnouncements = await localDb.select().from(LocalAnnouncement);
    const localItems = await localDb.select().from(LocalAnnouncementItem);

    if (!dryRun) {
      const remoteDb = createDb(target.connectionString);
      try {
        // Full mirror: replace the remote tables with the local rows (ids are
        // preserved UUIDs, so existing site references stay valid). Inserts are
        // chunked so a large item set stays under the driver's parameter limit.
        await remoteDb.delete(RemoteAnnouncementItem);
        await remoteDb.delete(RemoteAnnouncement);
        for (const chunk of chunkValues(localAnnouncements)) {
          await remoteDb.insert(RemoteAnnouncement).values(chunk);
        }
        for (const chunk of chunkValues(localItems)) {
          await remoteDb.insert(RemoteAnnouncementItem).values(chunk);
        }
      } finally {
        await remoteDb.$client.end({ timeout: 1 });
      }
    }

    const totalRowCount = localAnnouncements.length + localItems.length;
    return {
      announcementCount: localAnnouncements.length,
      itemCount:         localItems.length,
      totalRowCount,
      changedRowCount:   totalRowCount,
      dryRun,
    };
  })
  .build();
