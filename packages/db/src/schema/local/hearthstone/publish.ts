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
  'draft',
  'applying',
  'completed',
  'failed',
]);

export const publishBatchCardAction = dataSchema.enum('publish_batch_card_action', [
  'insert',
  'update',
  'delete',
  'unchanged',
]);

export const publishBatchCardStatus = dataSchema.enum('publish_batch_card_status', [
  'pending',
  'applied',
  'skipped',
  'failed',
]);

// Publish batches currently track the projected Hearthstone card family only:
// `entities`, `entity_localizations`, and `entity_relations`.
export const PublishBatch = dataSchema.table('publish_batches', {
  id: uuid('id').primaryKey().defaultRandom(),

  publishTargetId:   text('publish_target_id').notNull(),
  environment:       text('environment').notNull(),
  targetFingerprint: text('target_fingerprint').notNull(),

  sourceTagMin: integer('source_tag_min').notNull(),
  sourceTagMax: integer('source_tag_max').notNull(),
  buildMin:     integer('build_min').notNull(),
  buildMax:     integer('build_max').notNull(),

  manifestHash:         text('manifest_hash').notNull(),
  previousManifestHash: text('previous_manifest_hash'),

  cardCount:          integer('card_count').notNull(),
  changedCardCount:   integer('changed_card_count').notNull().default(0),
  insertedCardCount:  integer('inserted_card_count').notNull().default(0),
  updatedCardCount:   integer('updated_card_count').notNull().default(0),
  deletedCardCount:   integer('deleted_card_count').notNull().default(0),
  unchangedCardCount: integer('unchanged_card_count').notNull().default(0),

  status:  publishBatchStatus('status').notNull().default('draft'),
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
  check('publish_batches_card_count_nonnegative_chk', sql`${table.cardCount} >= 0`),
  check('publish_batches_changed_card_count_nonnegative_chk', sql`${table.changedCardCount} >= 0`),
  check('publish_batches_inserted_card_count_nonnegative_chk', sql`${table.insertedCardCount} >= 0`),
  check('publish_batches_updated_card_count_nonnegative_chk', sql`${table.updatedCardCount} >= 0`),
  check('publish_batches_deleted_card_count_nonnegative_chk', sql`${table.deletedCardCount} >= 0`),
  check('publish_batches_unchanged_card_count_nonnegative_chk', sql`${table.unchangedCardCount} >= 0`),
]);

// Batch cards persist the published card-family manifest, not an arbitrary table diff.
export const PublishBatchCard = dataSchema.table('publish_batch_cards', {
  batchId: uuid('batch_id')
    .notNull()
    .references(() => PublishBatch.id, { onDelete: 'cascade' }),
  cardId: text('card_id').notNull(),

  entityFamilyHash:       text('entity_family_hash').notNull(),
  localizationFamilyHash: text('localization_family_hash').notNull(),
  relationFamilyHash:     text('relation_family_hash').notNull(),
  manifestHash:           text('manifest_hash').notNull(),
  previousManifestHash:   text('previous_manifest_hash'),

  action: publishBatchCardAction('action').notNull().default('unchanged'),
  status: publishBatchCardStatus('status').notNull().default('pending'),
  error:  text('error'),

  entityRowCount:       integer('entity_row_count').notNull().default(0),
  localizationRowCount: integer('localization_row_count').notNull().default(0),
  relationRowCount:     integer('relation_row_count').notNull().default(0),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  appliedAt: timestamp('applied_at'),
}, table => [
  primaryKey({ columns: [table.batchId, table.cardId] }),
  index('publish_batch_cards_batch_action_idx').on(table.batchId, table.action),
  index('publish_batch_cards_batch_status_idx').on(table.batchId, table.status),
  index('publish_batch_cards_manifest_hash_idx').on(table.manifestHash),
  check('publish_batch_cards_entity_row_count_nonnegative_chk', sql`${table.entityRowCount} >= 0`),
  check('publish_batch_cards_localization_row_count_nonnegative_chk', sql`${table.localizationRowCount} >= 0`),
  check('publish_batch_cards_relation_row_count_nonnegative_chk', sql`${table.relationRowCount} >= 0`),
]);

// The baseline row points at the last successful batch; per-card baseline manifests live in the
// associated `publish_batch_cards` rows so future diff jobs can reuse the exact published set.
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

  manifestHash: text('manifest_hash').notNull(),
  cardCount:    integer('card_count').notNull(),

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
  check('publish_baselines_card_count_nonnegative_chk', sql`${table.cardCount} >= 0`),
]);
