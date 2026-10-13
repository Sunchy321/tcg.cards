import {
  bigserial,
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

import { EvolveCard } from '../../shared/shadowverse/evolve-card';
import { dataSchema } from '../../shared/shadowverse/schema';

/** Lifecycle states recorded for one Evolve card-data import batch. */
export const evolveImportBatchStatus = dataSchema.enum('evolve_import_batch_status', [
  'running',
  'completed',
  'completed_with_errors',
  'failed',
  'interrupted',
]);

/** One full Evolve card download and import attempt executed by the desktop runtime. */
export const EvolveImportBatch = dataSchema.table('evolve_import_batches', {
  id: uuid('id').primaryKey().defaultRandom(),

  source:    text('source').notNull(),
  sourceUrl: text('source_url').notNull(),

  sourceRecordCount: integer('source_record_count').notNull().default(0),
  addedCount:        integer('added_count').notNull().default(0),
  updatedCount:      integer('updated_count').notNull().default(0),
  skippedCount:      integer('skipped_count').notNull().default(0),
  failedCount:       integer('failed_count').notNull().default(0),
  softDeletedCount:  integer('soft_deleted_count').notNull().default(0),

  status: evolveImportBatchStatus('status').notNull().default('running'),
  error:  text('error'),

  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, table => [
  index('evolve_import_batches_source_started_at_idx').on(table.source, table.startedAt),
  index('evolve_import_batches_status_started_at_idx').on(table.status, table.startedAt),
  check('evolve_import_batches_source_record_count_nonnegative_chk', sql`${table.sourceRecordCount} >= 0`),
  check('evolve_import_batches_added_count_nonnegative_chk', sql`${table.addedCount} >= 0`),
  check('evolve_import_batches_updated_count_nonnegative_chk', sql`${table.updatedCount} >= 0`),
  check('evolve_import_batches_skipped_count_nonnegative_chk', sql`${table.skippedCount} >= 0`),
  check('evolve_import_batches_failed_count_nonnegative_chk', sql`${table.failedCount} >= 0`),
  check('evolve_import_batches_soft_deleted_count_nonnegative_chk', sql`${table.softDeletedCount} >= 0`),
]);

/** Structured validation or write failure for one source record in one batch. */
export const EvolveImportFailure = dataSchema.table('evolve_import_failures', {
  batchId: uuid('batch_id')
    .notNull()
    .references(() => EvolveImportBatch.id),
  sourceRecordId: text('source_record_id').notNull(),

  stage:   text('stage').notNull(),
  code:    text('code').notNull(),
  message: text('message').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  primaryKey({ columns: [table.batchId, table.sourceRecordId] }),
  index('evolve_import_failures_batch_id_idx').on(table.batchId),
]);

/** Last successful import metadata retained per structured Evolve source. */
export const EvolveImportState = dataSchema.table('evolve_import_states', {
  source:    text('source').primaryKey(),
  sourceUrl: text('source_url').notNull(),

  lastSuccessfulBatchId: uuid('last_successful_batch_id')
    .references(() => EvolveImportBatch.id),

  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

/** Lifecycle states recorded for one Evolve card-image import batch. */
export const evolveImageImportBatchStatus = dataSchema.enum('evolve_image_import_batch_status', [
  'running',
  'completed',
  'completed_with_errors',
  'failed',
  'interrupted',
]);

/** One bounded Evolve card-image download attempt executed by the desktop runtime. */
export const EvolveImageImportBatch = dataSchema.table('evolve_image_import_batches', {
  id: uuid('id').primaryKey().defaultRandom(),

  source: text('source').notNull(),

  assetCount:          integer('asset_count').notNull().default(0),
  downloadedCount:     integer('downloaded_count').notNull().default(0),
  skippedCount:        integer('skipped_count').notNull().default(0),
  missingCount:        integer('missing_count').notNull().default(0),
  failedCount:         integer('failed_count').notNull().default(0),
  downloadedByteCount: integer('downloaded_byte_count').notNull().default(0),

  status: evolveImageImportBatchStatus('status').notNull().default('running'),
  error:  text('error'),

  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, table => [
  index('evolve_image_import_batches_source_started_at_idx').on(table.source, table.startedAt),
  check('evolve_image_import_batches_asset_count_nonnegative_chk', sql`${table.assetCount} >= 0`),
  check('evolve_image_import_batches_downloaded_count_nonnegative_chk', sql`${table.downloadedCount} >= 0`),
  check('evolve_image_import_batches_skipped_count_nonnegative_chk', sql`${table.skippedCount} >= 0`),
  check('evolve_image_import_batches_missing_count_nonnegative_chk', sql`${table.missingCount} >= 0`),
  check('evolve_image_import_batches_failed_count_nonnegative_chk', sql`${table.failedCount} >= 0`),
  check('evolve_image_import_batches_downloaded_byte_count_nonnegative_chk', sql`${table.downloadedByteCount} >= 0`),
]);

/** Registry of one downloaded Evolve card image keyed by language and card number. */
export const EvolveImageAsset = dataSchema.table('evolve_image_assets', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),

  lang: text('lang').notNull(),
  cardNo: text('card_no')
    .notNull()
    .references(() => EvolveCard.cardNo, { onDelete: 'cascade' }),

  filePath: text('file_path').notNull(),
  byteSize: integer('byte_size'),
  downloadedAt: timestamp('downloaded_at', { withTimezone: true }),

  retiredAt: timestamp('retired_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  uniqueIndex('evolve_image_assets_lang_card_no_uidx').on(table.lang, table.cardNo),
  index('evolve_image_assets_card_no_idx').on(table.cardNo),
  index('evolve_image_assets_retired_at_idx').on(table.retiredAt),
  check('evolve_image_assets_lang_chk', sql`${table.lang} in ('ja', 'en')`),
]);

/** Structured per-image failure retained without storing response bytes. */
export const EvolveImageImportFailure = dataSchema.table('evolve_image_import_failures', {
  batchId: uuid('batch_id')
    .notNull()
    .references(() => EvolveImageImportBatch.id),
  assetKey: text('asset_key').notNull(),

  stage:   text('stage').notNull(),
  code:    text('code').notNull(),
  message: text('message').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  primaryKey({ columns: [table.batchId, table.assetKey] }),
  index('evolve_image_import_failures_batch_id_idx').on(table.batchId),
]);
