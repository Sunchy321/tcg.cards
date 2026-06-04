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

import { dataSchema } from '../../shared/hearthstone/schema';

export const publishBatchStatus = dataSchema.enum('publish_batch_status', [
  'planning',
  'applying',
  'completed',
  'failed',
]);

export const publishBatchRowAction = dataSchema.enum('publish_batch_row_action', [
  'insert',
  'update',
  'delete',
  'unchanged',
]);

export const publishBatchRowStatus = dataSchema.enum('publish_batch_row_status', [
  'pending',
  'applied',
  'skipped',
  'failed',
]);

export const PublishBatch = dataSchema.table('publish_batches', {
  id: uuid('id').primaryKey().defaultRandom(),

  publishTargetId:   text('publish_target_id').notNull(),
  environment:       text('environment').notNull(),
  targetFingerprint: text('target_fingerprint').notNull(),
  publishType:       text('publish_type').notNull().default('card_data'),

  sourceTagMin: integer('source_tag_min').notNull(),
  sourceTagMax: integer('source_tag_max').notNull(),
  buildMin:     integer('build_min').notNull(),
  buildMax:     integer('build_max').notNull(),

  manifestHash:         text('manifest_hash').notNull(),
  previousManifestHash: text('previous_manifest_hash'),

  totalRowCount:     integer('total_row_count').notNull().default(0),
  changedRowCount:   integer('changed_row_count').notNull().default(0),
  insertedRowCount:  integer('inserted_row_count').notNull().default(0),
  updatedRowCount:   integer('updated_row_count').notNull().default(0),
  deletedRowCount:   integer('deleted_row_count').notNull().default(0),
  unchangedRowCount: integer('unchanged_row_count').notNull().default(0),

  cardRowCount:         integer('card_row_count').notNull().default(0),
  entityRowCount:       integer('entity_row_count').notNull().default(0),
  localizationRowCount: integer('localization_row_count').notNull().default(0),
  relationRowCount:     integer('relation_row_count').notNull().default(0),

  status:  publishBatchStatus('status').notNull().default('planning'),
  error:   text('error'),
  summary: jsonb('summary').$type<Record<string, unknown>>(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  startedAt:   timestamp('started_at'),
  completedAt: timestamp('completed_at'),
}, table => [
  index('publish_batches_target_status_idx').on(table.publishTargetId, table.status),
  index('publish_batches_created_at_idx').on(table.createdAt),
  index('publish_batches_manifest_hash_idx').on(table.manifestHash),
  check('publish_batches_source_tag_range_chk', sql`${table.sourceTagMin} <= ${table.sourceTagMax}`),
  check('publish_batches_build_range_chk', sql`${table.buildMin} <= ${table.buildMax}`),
  check('publish_batches_source_tag_min_positive_chk', sql`${table.sourceTagMin} > 0`),
  check('publish_batches_build_min_positive_chk', sql`${table.buildMin} > 0`),
  check('publish_batches_total_row_count_nonnegative_chk', sql`${table.totalRowCount} >= 0`),
  check('publish_batches_changed_row_count_nonnegative_chk', sql`${table.changedRowCount} >= 0`),
  check('publish_batches_inserted_row_count_nonnegative_chk', sql`${table.insertedRowCount} >= 0`),
  check('publish_batches_updated_row_count_nonnegative_chk', sql`${table.updatedRowCount} >= 0`),
  check('publish_batches_deleted_row_count_nonnegative_chk', sql`${table.deletedRowCount} >= 0`),
  check('publish_batches_unchanged_row_count_nonnegative_chk', sql`${table.unchangedRowCount} >= 0`),
  check('publish_batches_card_row_count_nonnegative_chk', sql`${table.cardRowCount} >= 0`),
  check('publish_batches_entity_row_count_nonnegative_chk', sql`${table.entityRowCount} >= 0`),
  check('publish_batches_localization_row_count_nonnegative_chk', sql`${table.localizationRowCount} >= 0`),
  check('publish_batches_relation_row_count_nonnegative_chk', sql`${table.relationRowCount} >= 0`),
]);

export const PublishBatchRow = dataSchema.table('publish_batch_rows', {
  batchId: uuid('batch_id')
    .notNull()
    .references(() => PublishBatch.id, { onDelete: 'cascade' }),

  tableName:       text('table_name').notNull(),
  rowPk:           text('row_pk').notNull(),
  rowHash:         text('row_hash').notNull(),
  previousRowHash: text('previous_row_hash'),

  action: publishBatchRowAction('action').notNull(),
  status: publishBatchRowStatus('status').notNull().default('pending'),
  error:  text('error'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  appliedAt: timestamp('applied_at'),
}, table => [
  primaryKey({ columns: [table.batchId, table.tableName, table.rowPk] }),
  index('publish_batch_rows_batch_action_idx').on(table.batchId, table.action),
  index('publish_batch_rows_batch_status_idx').on(table.batchId, table.status),
  index('publish_batch_rows_batch_table_idx').on(table.batchId, table.tableName),
]);

export const PublishBaseline = dataSchema.table('publish_baselines', {
  publishTargetId: text('publish_target_id').primaryKey(),
  environment:     text('environment').notNull(),

  targetFingerprint: text('target_fingerprint').notNull(),
  batchId:           uuid('batch_id')
    .notNull()
    .references(() => PublishBatch.id),

  sourceTagMin: integer('source_tag_min').notNull(),
  sourceTagMax: integer('source_tag_max').notNull(),
  buildMin:     integer('build_min').notNull(),
  buildMax:     integer('build_max').notNull(),

  manifestHash:  text('manifest_hash').notNull(),
  totalRowCount: integer('total_row_count').notNull(),

  publishedAt: timestamp('published_at').notNull(),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
  updatedAt:   timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  index('publish_baselines_batch_id_idx').on(table.batchId),
  check('publish_baselines_source_tag_range_chk', sql`${table.sourceTagMin} <= ${table.sourceTagMax}`),
  check('publish_baselines_build_range_chk', sql`${table.buildMin} <= ${table.buildMax}`),
  check('publish_baselines_source_tag_min_positive_chk', sql`${table.sourceTagMin} > 0`),
  check('publish_baselines_build_min_positive_chk', sql`${table.buildMin} > 0`),
  check('publish_baselines_total_row_count_nonnegative_chk', sql`${table.totalRowCount} >= 0`),
]);
