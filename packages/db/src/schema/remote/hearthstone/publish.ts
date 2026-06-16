import {
  check,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { dataSchema } from '../../shared/hearthstone/schema';

// Remote publish ledger keeps the last successful batch per publish stream so serving-side
// environments can be reconciled without treating the remote database as a build authority.
export const PublishLedger = dataSchema.table('publish_ledgers', {
  publishTarget: text('publish_target').notNull(),
  environment:     text('environment').notNull(),
  publishType:     text('publish_type').notNull().default('card_data'),

  targetFingerprint: text('target_fingerprint').notNull(),
  batchId:           uuid('batch_id').notNull(),

  sourceTagMin: integer('source_tag_min').notNull(),
  sourceTagMax: integer('source_tag_max').notNull(),
  buildMin:     integer('build_min').notNull(),
  buildMax:     integer('build_max').notNull(),

  manifestHash:    text('manifest_hash').notNull(),
  totalRowCount:   integer('total_row_count').notNull(),
  changedRowCount: integer('changed_row_count').notNull().default(0),
  publishedAt:     timestamp('published_at').notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  primaryKey({ columns: [table.publishTarget, table.environment, table.publishType] }),
  index('publish_ledgers_environment_idx').on(table.environment),
  index('publish_ledgers_stream_idx').on(table.publishTarget, table.environment, table.publishType),
  index('publish_ledgers_published_at_idx').on(table.publishedAt),
  check('publish_ledgers_source_tag_range_chk', sql`${table.sourceTagMin} <= ${table.sourceTagMax}`),
  check('publish_ledgers_build_range_chk', sql`${table.buildMin} <= ${table.buildMax}`),
  check('publish_ledgers_source_tag_min_positive_chk', sql`${table.sourceTagMin} > 0`),
  check('publish_ledgers_build_min_positive_chk', sql`${table.buildMin} > 0`),
  check('publish_ledgers_total_row_count_nonnegative_chk', sql`${table.totalRowCount} >= 0`),
  check('publish_ledgers_changed_row_count_nonnegative_chk', sql`${table.changedRowCount} >= 0`),
]);
