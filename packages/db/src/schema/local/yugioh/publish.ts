import {
  bigint,
  check,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { dataSchema } from '../../shared/yugioh/schema';

/** Lifecycle states recorded while one Yu-Gi-Oh! publish batch is applied. */
export const publishBatchStatus = dataSchema.enum('publish_batch_status', [
  'planning',
  'applying',
  'completed',
  'failed',
]);

/** Row actions supported by the soft-delete-only Yu-Gi-Oh! publisher. */
export const publishBatchRowAction = dataSchema.enum('publish_batch_row_action', [
  'insert',
  'update',
  'unchanged',
]);

/** Per-row execution states retained for resumable remote publication. */
export const publishBatchRowStatus = dataSchema.enum('publish_batch_row_status', [
  'pending',
  'applied',
  'skipped',
  'failed',
]);

/** One local publish plan bound to one verified remote target. */
export const PublishBatch = dataSchema.table('publish_batches', {
  id: uuid('id').primaryKey().defaultRandom(),

  publishTargetId:   text('publish_target_id').notNull(),
  environment:       text('environment').notNull(),
  targetFingerprint: text('target_fingerprint').notNull(),
  manifestHash:      text('manifest_hash').notNull(),
  previousManifestHash: text('previous_manifest_hash'),

  totalRowCount:     integer('total_row_count').notNull().default(0),
  changedRowCount:   integer('changed_row_count').notNull().default(0),
  insertedRowCount:  integer('inserted_row_count').notNull().default(0),
  updatedRowCount:   integer('updated_row_count').notNull().default(0),
  unchangedRowCount: integer('unchanged_row_count').notNull().default(0),

  status: publishBatchStatus('status').notNull().default('planning'),
  error:  text('error'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  startedAt:   timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, table => [
  index('publish_batches_target_status_idx').on(table.publishTargetId, table.status),
  index('publish_batches_created_at_idx').on(table.createdAt),
  index('publish_batches_manifest_hash_idx').on(table.manifestHash),
  check('publish_batches_total_row_count_nonnegative_chk', sql`${table.totalRowCount} >= 0`),
  check('publish_batches_changed_row_count_nonnegative_chk', sql`${table.changedRowCount} >= 0`),
  check('publish_batches_inserted_row_count_nonnegative_chk', sql`${table.insertedRowCount} >= 0`),
  check('publish_batches_updated_row_count_nonnegative_chk', sql`${table.updatedRowCount} >= 0`),
  check('publish_batches_unchanged_row_count_nonnegative_chk', sql`${table.unchangedRowCount} >= 0`),
]);

/** One deterministic card-row action retained for publish recovery. */
export const PublishBatchRow = dataSchema.table('publish_batch_rows', {
  batchId: uuid('batch_id')
    .notNull()
    .references(() => PublishBatch.id),
  cardId: bigint('card_id', { mode: 'number' }).notNull(),

  rowHash:         text('row_hash').notNull(),
  previousRowHash: text('previous_row_hash'),
  action:          publishBatchRowAction('action').notNull(),
  status:          publishBatchRowStatus('status').notNull().default('pending'),
  error:           text('error'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  appliedAt: timestamp('applied_at', { withTimezone: true }),
}, table => [
  primaryKey({ columns: [table.batchId, table.cardId] }),
  index('publish_batch_rows_batch_status_idx').on(table.batchId, table.status),
  index('publish_batch_rows_batch_action_idx').on(table.batchId, table.action),
]);

/** Last successful local manifest retained for one remote target. */
export const PublishBaseline = dataSchema.table('publish_baselines', {
  publishTargetId: text('publish_target_id').primaryKey(),
  environment:     text('environment').notNull(),
  targetFingerprint: text('target_fingerprint').notNull(),
  batchId: uuid('batch_id')
    .notNull()
    .references(() => PublishBatch.id),
  manifestHash:  text('manifest_hash').notNull(),
  totalRowCount: integer('total_row_count').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  index('publish_baselines_batch_id_idx').on(table.batchId),
  check('publish_baselines_total_row_count_nonnegative_chk', sql`${table.totalRowCount} >= 0`),
]);
