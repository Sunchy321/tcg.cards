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

/**
 * Unified projection review queue. Three kinds share one model:
 *   - `slug_conflict`: multiple oracle ids normalize to one slug with no
 *     resolution yet; resolving writes `card_slug_resolutions`.
 *   - `card_inconsistency`: a card's non-localized fields disagree across its
 *     attributed rows; the card is held out of projection until resolved.
 *   - `card_field_overwrite`: writing a card field would overwrite a current
 *     value and needs confirmation (base change / unified folk overriding
 *     official).
 */
export const ProjectionReview = dataSchema.table('projection_review', {
  id:         uuid('id').primaryKey().defaultRandom(),
  kind:       text('kind').notNull(),
  subject:    jsonb('subject').$type<JsonMap>().notNull(),
  payload:    jsonb('payload').$type<JsonMap>().notNull().default({}),
  status:     text('status').notNull().default('pending'),
  resolution: jsonb('resolution').$type<JsonMap>(),
  actor:      text('actor'),
  resolvedAt: timestamp('resolved_at'),
  handledAt:  timestamp('handled_at'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  index('projection_review_kind_status_idx').on(table.kind, table.status),
  index('projection_review_subject_idx').on(table.subject),
]);

