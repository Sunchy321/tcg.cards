import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { Card } from '../../shared/yugioh/card';
import { dataSchema } from '../../shared/yugioh/schema';

/** Lifecycle states recorded for one Yu-Gi-Oh! source import batch. */
export const importBatchStatus = dataSchema.enum('import_batch_status', [
  'running',
  'completed',
  'completed_with_errors',
  'failed',
  'interrupted',
]);

/** One download and import attempt executed by the desktop runtime. */
export const ImportBatch = dataSchema.table('import_batches', {
  id: uuid('id').primaryKey().defaultRandom(),

  source:    text('source').notNull(),
  sourceUrl: text('source_url').notNull(),

  archiveHash: text('archive_hash'),
  etag:        text('etag'),
  lastModified: text('last_modified'),
  unknownFields: text('unknown_fields').array().notNull().default([]),

  sourceRecordCount: integer('source_record_count').notNull().default(0),
  addedCount:        integer('added_count').notNull().default(0),
  updatedCount:      integer('updated_count').notNull().default(0),
  skippedCount:      integer('skipped_count').notNull().default(0),
  failedCount:       integer('failed_count').notNull().default(0),
  softDeletedCount:  integer('soft_deleted_count').notNull().default(0),

  status: importBatchStatus('status').notNull().default('running'),
  error:  text('error'),

  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, table => [
  index('import_batches_source_started_at_idx').on(table.source, table.startedAt),
  index('import_batches_status_started_at_idx').on(table.status, table.startedAt),
  index('import_batches_archive_hash_idx').on(table.archiveHash),
  check('import_batches_source_record_count_nonnegative_chk', sql`${table.sourceRecordCount} >= 0`),
  check('import_batches_added_count_nonnegative_chk', sql`${table.addedCount} >= 0`),
  check('import_batches_updated_count_nonnegative_chk', sql`${table.updatedCount} >= 0`),
  check('import_batches_skipped_count_nonnegative_chk', sql`${table.skippedCount} >= 0`),
  check('import_batches_failed_count_nonnegative_chk', sql`${table.failedCount} >= 0`),
  check('import_batches_soft_deleted_count_nonnegative_chk', sql`${table.softDeletedCount} >= 0`),
]);

/** Stable mapping from one source record to one internal Yu-Gi-Oh! card. */
export const CardSource = dataSchema.table('card_sources', {
  source:         text('source').notNull(),
  sourceRecordId: text('source_record_id').notNull(),
  cardId:         bigint('card_id', { mode: 'number' })
    .notNull()
    .references(() => Card.id),
  sourceHash: text('source_hash').notNull(),

  firstSeenBatchId: uuid('first_seen_batch_id')
    .notNull()
    .references(() => ImportBatch.id),
  lastSeenBatchId: uuid('last_seen_batch_id')
    .notNull()
    .references(() => ImportBatch.id),

  retiredAt: timestamp('retired_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  primaryKey({ columns: [table.source, table.sourceRecordId] }),
  uniqueIndex('card_sources_source_card_id_uidx').on(table.source, table.cardId),
  index('card_sources_card_id_idx').on(table.cardId),
  index('card_sources_last_seen_batch_id_idx').on(table.lastSeenBatchId),
  index('card_sources_retired_at_idx').on(table.retiredAt),
]);

/** Structured validation or write failure for one source record in one batch. */
export const ImportFailure = dataSchema.table('import_failures', {
  batchId: uuid('batch_id')
    .notNull()
    .references(() => ImportBatch.id),
  sourceRecordId: text('source_record_id').notNull(),

  stage:   text('stage').notNull(),
  code:    text('code').notNull(),
  message: text('message').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  primaryKey({ columns: [table.batchId, table.sourceRecordId] }),
  index('import_failures_batch_id_idx').on(table.batchId),
]);

/** Last successful import metadata retained for one structured source. */
export const ImportState = dataSchema.table('import_states', {
  source:    text('source').primaryKey(),
  sourceUrl: text('source_url').notNull(),

  lastSuccessfulBatchId: uuid('last_successful_batch_id')
    .references(() => ImportBatch.id),
  archiveHash: text('archive_hash'),
  etag:        text('etag'),
  lastModified: text('last_modified'),

  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});
