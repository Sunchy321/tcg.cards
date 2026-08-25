import { index, jsonb, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { dataSchema } from '../../shared/magic/schema';

/** Structured entity keys stored in generic sync tables. */
type JsonMap = Record<string, unknown>;

/** Tracks each auto-source's imported version and fingerprint. */
export const SourceVersion = dataSchema.table('source_versions', {
  id:          uuid('id').primaryKey().defaultRandom(),
  sourceId:    text('source_id').notNull(),
  versionKey:  text('version_key').notNull(),
  fingerprint: text('fingerprint').notNull(),
  importedAt:  timestamp('imported_at'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  uniqueIndex('source_versions_source_version_uq').on(table.sourceId, table.versionKey),
  index('source_versions_source_id_imported_at_idx').on(table.sourceId, table.importedAt),
]);

/** Generic raw source snapshot (replaces the old import_raw_records role). */
export const RawEntitySnapshot = dataSchema.table('raw_entity_snapshots', {
  id:              uuid('id').primaryKey().defaultRandom(),
  sourceId:        text('source_id').notNull(),
  entityType:      text('entity_type').notNull(),
  entityKey:       jsonb('entity_key').$type<JsonMap>().notNull(),
  snapshotHash:    text('snapshot_hash').notNull(),
  payload:         jsonb('payload').$type<JsonMap>().notNull(),
  projectionState: text('projection_state').notNull().default('not_projected'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  uniqueIndex('raw_entity_snapshots_source_entity_hash_uq').on(table.sourceId, table.entityType, table.entityKey, table.snapshotHash),
  index('raw_entity_snapshots_source_entity_idx').on(table.sourceId, table.entityType),
  index('raw_entity_snapshots_projection_state_idx').on(table.projectionState),
]);

/** A-class base-change review reminders produced on generation advance. */
export const BaseChangeReview = dataSchema.table('base_change_review', {
  id:         uuid('id').primaryKey().defaultRandom(),
  generation: text('generation').notNull(),
  entityType: text('entity_type').notNull(),
  entityKey:  jsonb('entity_key').$type<JsonMap>().notNull(),
  fieldPath:  text('field_path').notNull(),
  oldValue:   jsonb('old_value').$type<unknown>(),
  newValue:   jsonb('new_value').$type<unknown>(),
  status:     text('status').notNull().default('pending'),
  handledAt:  timestamp('handled_at'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => [
  index('base_change_review_entity_field_status_idx').on(table.entityType, table.entityKey, table.fieldPath, table.status),
  index('base_change_review_generation_idx').on(table.generation),
]);
