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

export const announcementPublishTaskType = 'hearthstone_announcement_publish';

const input = z.object({
  dryRun: z.boolean().optional().default(false),
});

const output = z.object({
  announcementCount: z.number(),
  itemCount:         z.number(),
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
        // preserved UUIDs, so existing site references stay valid).
        await remoteDb.delete(RemoteAnnouncementItem);
        await remoteDb.delete(RemoteAnnouncement);
        if (localAnnouncements.length > 0) {
          await remoteDb.insert(RemoteAnnouncement).values(localAnnouncements);
        }
        if (localItems.length > 0) {
          await remoteDb.insert(RemoteAnnouncementItem).values(localItems);
        }
      } finally {
        await remoteDb.$client.end({ timeout: 1 });
      }
    }

    return {
      announcementCount: localAnnouncements.length,
      itemCount:         localItems.length,
      dryRun,
    };
  })
  .build();
