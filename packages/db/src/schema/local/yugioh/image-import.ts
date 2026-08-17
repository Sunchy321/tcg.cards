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
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { Card } from '../../shared/yugioh/card';
import { dataSchema } from '../../shared/yugioh/schema';

/** Lifecycle states recorded for one Yu-Gi-Oh! primary-image import batch. */
export const imageImportBatchStatus = dataSchema.enum('image_import_batch_status', [
  'running',
  'completed',
  'completed_with_errors',
  'failed',
  'interrupted',
]);

/** One metadata snapshot and bounded image-download attempt executed by desktop. */
export const ImageImportBatch = dataSchema.table('image_import_batches', {
  id: uuid('id').primaryKey().defaultRandom(),

  source:      text('source').notNull(),
  metadataUrl: text('metadata_url').notNull(),
  metadataHash: varchar('metadata_hash', { length: 64 }),
  etag:         text('etag'),
  lastModified: text('last_modified'),

  metadataRecordCount: integer('metadata_record_count').notNull().default(0),
  eligibleCardCount:   integer('eligible_card_count').notNull().default(0),
  unavailableCardCount: integer('unavailable_card_count').notNull().default(0),
  unmatchedSourceCount: integer('unmatched_source_count').notNull().default(0),
  addedCount:          integer('added_count').notNull().default(0),
  updatedCount:        integer('updated_count').notNull().default(0),
  skippedCount:        integer('skipped_count').notNull().default(0),
  missingCount:        integer('missing_count').notNull().default(0),
  failedCount:         integer('failed_count').notNull().default(0),
  softDeletedCount:    integer('soft_deleted_count').notNull().default(0),
  downloadedByteCount: bigint('downloaded_byte_count', { mode: 'number' }).notNull().default(0),

  status: imageImportBatchStatus('status').notNull().default('running'),
  error:  text('error'),

  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, table => [
  index('image_import_batches_source_started_at_idx').on(table.source, table.startedAt),
  index('image_import_batches_status_started_at_idx').on(table.status, table.startedAt),
  index('image_import_batches_metadata_hash_idx').on(table.metadataHash),
  check('image_import_batches_metadata_record_count_nonnegative_chk', sql`${table.metadataRecordCount} >= 0`),
  check('image_import_batches_eligible_card_count_nonnegative_chk', sql`${table.eligibleCardCount} >= 0`),
  check('image_import_batches_unavailable_card_count_nonnegative_chk', sql`${table.unavailableCardCount} >= 0`),
  check('image_import_batches_unmatched_source_count_nonnegative_chk', sql`${table.unmatchedSourceCount} >= 0`),
  check('image_import_batches_added_count_nonnegative_chk', sql`${table.addedCount} >= 0`),
  check('image_import_batches_updated_count_nonnegative_chk', sql`${table.updatedCount} >= 0`),
  check('image_import_batches_skipped_count_nonnegative_chk', sql`${table.skippedCount} >= 0`),
  check('image_import_batches_missing_count_nonnegative_chk', sql`${table.missingCount} >= 0`),
  check('image_import_batches_failed_count_nonnegative_chk', sql`${table.failedCount} >= 0`),
  check('image_import_batches_soft_deleted_count_nonnegative_chk', sql`${table.softDeletedCount} >= 0`),
  check('image_import_batches_downloaded_byte_count_nonnegative_chk', sql`${table.downloadedByteCount} >= 0`),
]);

/** Stable mapping from one CDN metadata record to one internal card image fact. */
export const CardImageSource = dataSchema.table('card_image_sources', {
  source:         text('source').notNull(),
  sourceRecordId: text('source_record_id').notNull(),
  cardId: bigint('card_id', { mode: 'number' })
    .notNull()
    .references(() => Card.id),

  sourceUrl:      text('source_url').notNull(),
  sourceMd5:      varchar('source_md5', { length: 32 }).notNull(),
  sourceByteSize: integer('source_byte_size').notNull(),
  sourceModifiedAt: timestamp('source_modified_at', { withTimezone: true }).notNull(),
  assetSha256:    varchar('asset_sha256', { length: 64 }).notNull(),
  r2Key:          text('r2_key').notNull(),

  firstSeenBatchId: uuid('first_seen_batch_id')
    .notNull()
    .references(() => ImageImportBatch.id),
  lastSeenBatchId: uuid('last_seen_batch_id')
    .notNull()
    .references(() => ImageImportBatch.id),

  retiredAt: timestamp('retired_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  primaryKey({ columns: [table.source, table.sourceRecordId] }),
  uniqueIndex('card_image_sources_source_card_id_active_uidx')
    .on(table.source, table.cardId)
    .where(sql`${table.retiredAt} is null`),
  index('card_image_sources_card_id_idx').on(table.cardId),
  index('card_image_sources_last_seen_batch_id_idx').on(table.lastSeenBatchId),
  index('card_image_sources_retired_at_idx').on(table.retiredAt),
  check('card_image_sources_source_md5_format_chk', sql`${table.sourceMd5} ~ '^[a-f0-9]{32}$'`),
  check('card_image_sources_asset_sha256_format_chk', sql`${table.assetSha256} ~ '^[a-f0-9]{64}$'`),
  check('card_image_sources_source_byte_size_positive_chk', sql`${table.sourceByteSize} > 0`),
]);

/** Structured per-image failure retained without storing response bytes. */
export const ImageImportFailure = dataSchema.table('image_import_failures', {
  batchId: uuid('batch_id')
    .notNull()
    .references(() => ImageImportBatch.id),
  sourceRecordId: text('source_record_id').notNull(),

  stage:   text('stage').notNull(),
  code:    text('code').notNull(),
  message: text('message').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  primaryKey({ columns: [table.batchId, table.sourceRecordId] }),
  index('image_import_failures_batch_id_idx').on(table.batchId),
]);

/** Last successful primary-image metadata snapshot retained for one source. */
export const ImageImportState = dataSchema.table('image_import_states', {
  source:      text('source').primaryKey(),
  metadataUrl: text('metadata_url').notNull(),
  lastSuccessfulBatchId: uuid('last_successful_batch_id')
    .references(() => ImageImportBatch.id),
  metadataHash: varchar('metadata_hash', { length: 64 }),
  etag:         text('etag'),
  lastModified: text('last_modified'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});
