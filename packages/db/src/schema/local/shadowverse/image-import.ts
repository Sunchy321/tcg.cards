import {
  bigint,
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
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { Card } from '../../shared/shadowverse/card';
import { lang } from '../../shared/shadowverse/card-set';
import { dataSchema } from '../../shared/shadowverse/schema';

/** Lifecycle states recorded for one Shadowverse card-image import batch. */
export const imageImportBatchStatus = dataSchema.enum('image_import_batch_status', [
  'running',
  'completed',
  'completed_with_errors',
  'failed',
  'interrupted',
]);

/** One bounded card-image download attempt executed by the desktop runtime. */
export const ImageImportBatch = dataSchema.table('image_import_batches', {
  id: uuid('id').primaryKey().defaultRandom(),

  source: text('source').notNull(),

  assetCount:         integer('asset_count').notNull().default(0),
  downloadedCount:    integer('downloaded_count').notNull().default(0),
  skippedCount:       integer('skipped_count').notNull().default(0),
  missingCount:       integer('missing_count').notNull().default(0),
  failedCount:        integer('failed_count').notNull().default(0),
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
  check('image_import_batches_asset_count_nonnegative_chk', sql`${table.assetCount} >= 0`),
  check('image_import_batches_downloaded_count_nonnegative_chk', sql`${table.downloadedCount} >= 0`),
  check('image_import_batches_skipped_count_nonnegative_chk', sql`${table.skippedCount} >= 0`),
  check('image_import_batches_missing_count_nonnegative_chk', sql`${table.missingCount} >= 0`),
  check('image_import_batches_failed_count_nonnegative_chk', sql`${table.failedCount} >= 0`),
  check('image_import_batches_downloaded_byte_count_nonnegative_chk', sql`${table.downloadedByteCount} >= 0`),
]);

/** Kinds of downloadable card images; the directory depends only on the art vs banner split. */
export type ImageAssetKind = 'card' | 'card_evo' | 'style_card' | 'style_evo' | 'banner' | 'banner_evo';

/** Registry of one downloaded image asset keyed by language, kind, card, and style position. */
export const ImageAsset = dataSchema.table('image_assets', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),

  lang: lang('lang').notNull(),
  kind: varchar('kind', { length: 16 }).$type<ImageAssetKind>().notNull(),
  cardId: bigint('card_id', { mode: 'number' })
    .notNull()
    .references(() => Card.cardId, { onDelete: 'cascade' }),
  /** 0 for card-level images; the source list position for style images. */
  styleIndex: integer('style_index').notNull().default(0),

  hash: varchar('hash', { length: 32 }).notNull(),
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
  uniqueIndex('image_assets_lang_kind_card_style_uidx').on(table.lang, table.kind, table.cardId, table.styleIndex),
  index('image_assets_card_id_idx').on(table.cardId),
  index('image_assets_hash_idx').on(table.hash),
  index('image_assets_retired_at_idx').on(table.retiredAt),
  check('image_assets_hash_format_chk', sql`${table.hash} ~ '^[a-f0-9]{32}$'`),
  check('image_assets_style_index_nonnegative_chk', sql`${table.styleIndex} >= 0`),
]);

/** Structured per-image failure retained without storing response bytes. */
export const ImageImportFailure = dataSchema.table('image_import_failures', {
  batchId: uuid('batch_id')
    .notNull()
    .references(() => ImageImportBatch.id),
  assetKey: text('asset_key').notNull(),

  stage:   text('stage').notNull(),
  code:    text('code').notNull(),
  message: text('message').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  primaryKey({ columns: [table.batchId, table.assetKey] }),
  index('image_import_failures_batch_id_idx').on(table.batchId),
]);
