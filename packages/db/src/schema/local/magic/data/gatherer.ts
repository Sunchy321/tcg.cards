import { integer, jsonb, text, timestamp } from 'drizzle-orm/pg-core';

import { dataSchema } from '../../../shared/magic/schema';

import type { GathererData } from '#model/magic/schema/data/gatherer/card';

/**
 * Raw Gatherer card cache. One row per multiverseId, holding the CardData
 * payload extracted from the site's Next.js App Router RSC flight data.
 * `url` is the canonical card-page URL after the multiverseId redirect.
 * `cacheDays` / `contentHash` / `updatedAt` drive the adaptive cache window:
 * stable rows escalate 7→30→60→180→365 days, changed rows reset to 7.
 */
export const Gatherer = dataSchema.table('gatherer', {
  multiverseId: integer('multiverse_id').primaryKey(),
  url:          text('url'),
  data:         jsonb('data').$type<GathererData>(),
  cacheDays:    integer('cache_days').notNull().default(7),
  contentHash:  text('content_hash'),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
  updatedAt:    timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  expiresAt: timestamp('expires_at').notNull(),
});
