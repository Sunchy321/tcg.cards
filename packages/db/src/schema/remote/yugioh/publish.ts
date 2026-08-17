import {
  check,
  index,
  integer,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { dataSchema } from '../../shared/yugioh/schema';

/** Last successful desktop-led card publication accepted by one remote target. */
export const PublishLedger = dataSchema.table('publish_ledgers', {
  publishTargetId: text('publish_target_id').primaryKey(),
  environment:     text('environment').notNull(),
  targetFingerprint: text('target_fingerprint').notNull(),
  batchId: uuid('batch_id').notNull(),
  manifestHash:    text('manifest_hash').notNull(),
  totalRowCount:   integer('total_row_count').notNull(),
  changedRowCount: integer('changed_row_count').notNull().default(0),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  index('publish_ledgers_environment_idx').on(table.environment),
  index('publish_ledgers_published_at_idx').on(table.publishedAt),
  check('publish_ledgers_total_row_count_nonnegative_chk', sql`${table.totalRowCount} >= 0`),
  check('publish_ledgers_changed_row_count_nonnegative_chk', sql`${table.changedRowCount} >= 0`),
]);
