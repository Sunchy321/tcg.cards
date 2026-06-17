import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Remote stream registration defines which publish streams may be advanced by
// the ordinary publish flow, which target fingerprint they must match, and
// the short-lived ordinary publish lease state for equivalent local writers.
export const PublishStreamRegistration = pgTable('publish_stream_registrations', {
  publishTarget: text('publish_target').notNull(),
  environment:   text('environment').notNull(),
  publishType:   text('publish_type').notNull().default('card_data'),

  targetFingerprint:    text('target_fingerprint').notNull(),
  normalPublishEnabled: boolean('normal_publish_enabled').notNull().default(false),
  leaseHolderId:        text('lease_holder_id'),
  leaseExpiresAt:       timestamp('lease_expires_at'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  primaryKey({ columns: [table.publishTarget, table.environment, table.publishType] }),
  index('publish_stream_registrations_stream_idx').on(
    table.publishTarget,
    table.environment,
    table.publishType,
  ),
  index('publish_stream_registrations_publish_enabled_idx').on(table.normalPublishEnabled),
  index('publish_stream_registrations_lease_expires_at_idx').on(table.leaseExpiresAt),
]);

// Remote publish ledger keeps the last successful batch per publish stream so serving-side
// environments can be reconciled without treating the remote database as a build authority.
export const PublishLedger = pgTable('publish_ledgers', {
  publishTarget: text('publish_target').notNull(),
  environment:   text('environment').notNull(),
  publishType:   text('publish_type').notNull().default('card_data'),

  targetFingerprint: text('target_fingerprint').notNull(),
  batchId:           uuid('batch_id').notNull(),

  sourceTagMin: integer('source_tag_min').notNull(),
  sourceTagMax: integer('source_tag_max').notNull(),
  buildMin:     integer('build_min').notNull(),
  buildMax:     integer('build_max').notNull(),

  generationFingerprint: text('generation_fingerprint').notNull().default('card-data-projector/v1'),
  generationOrder:       integer('generation_order').notNull().default(1),
  manifestHash:          text('manifest_hash').notNull(),
  totalRowCount:         integer('total_row_count').notNull(),
  changedRowCount:       integer('changed_row_count').notNull().default(0),
  publishedAt:           timestamp('published_at').notNull(),

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
  check('publish_ledgers_generation_order_positive_chk', sql`${table.generationOrder} > 0`),
  check('publish_ledgers_total_row_count_nonnegative_chk', sql`${table.totalRowCount} >= 0`),
  check('publish_ledgers_changed_row_count_nonnegative_chk', sql`${table.changedRowCount} >= 0`),
]);
