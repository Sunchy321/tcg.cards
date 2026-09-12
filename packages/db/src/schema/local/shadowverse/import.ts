import {
  check,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { dataSchema } from '../../shared/shadowverse/schema';

/** Lifecycle states recorded for one Shadowverse card-data import batch. */
export const importBatchStatus = dataSchema.enum('import_batch_status', [
  'running',
  'completed',
  'completed_with_errors',
  'failed',
  'interrupted',
]);

/** One full five-language card-list download and import attempt executed by the desktop runtime. */
export const ImportBatch = dataSchema.table('import_batches', {
  id: uuid('id').primaryKey().defaultRandom(),

  source:    text('source').notNull(),
  sourceUrl: text('source_url').notNull(),

  /** Source response keys not covered by the payload model, collected for schema-drift reporting. */
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
  check('import_batches_source_record_count_nonnegative_chk', sql`${table.sourceRecordCount} >= 0`),
  check('import_batches_added_count_nonnegative_chk', sql`${table.addedCount} >= 0`),
  check('import_batches_updated_count_nonnegative_chk', sql`${table.updatedCount} >= 0`),
  check('import_batches_skipped_count_nonnegative_chk', sql`${table.skippedCount} >= 0`),
  check('import_batches_failed_count_nonnegative_chk', sql`${table.failedCount} >= 0`),
  check('import_batches_soft_deleted_count_nonnegative_chk', sql`${table.softDeletedCount} >= 0`),
]);

/** Structured validation or write failure for one source record in one language. */
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

/** Last successful import metadata retained for the structured card source. */
export const ImportState = dataSchema.table('import_states', {
  source:    text('source').primaryKey(),
  sourceUrl: text('source_url').notNull(),

  lastSuccessfulBatchId: uuid('last_successful_batch_id')
    .references(() => ImportBatch.id),

  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});
