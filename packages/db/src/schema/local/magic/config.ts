import { boolean, index, jsonb, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { dataSchema } from '../../shared/magic/schema';

/** JSON object payload stored in rule-set metadata. */
type JsonMap = Record<string, unknown>;

/** Per-game source catalog (replaces the old import_sources). */
export const SourceCatalog = dataSchema.table('source_catalog', {
  id:         uuid('id').primaryKey().defaultRandom(),
  sourceId:   text('source_id').notNull(),
  name:       text('name').notNull(),
  summary:    text('summary').notNull().default(''),
  role:       text('role').notNull().default(''),
  official:   boolean('official').notNull().default(false),
  url:        text('url').notNull().default(''),
  trustLevel: text('trust_level').notNull(),
  status:     text('status').notNull().default('enabled'),

  defaultStrategy:     text('default_strategy').notNull(),
  defaultDecisionMode: text('default_decision_mode').notNull(),
  majorFieldGroups:    text('major_field_groups').array().notNull().default([]),
  notes:               text('notes').array().notNull().default([]),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  uniqueIndex('source_catalog_source_id_uq').on(table.sourceId),
  index('source_catalog_status_idx').on(table.status),
  index('source_catalog_trust_level_status_idx').on(table.trustLevel, table.status),
]);

/** Per-field import policy (track, manual override, auto-source rules). */
export const FieldPolicy = dataSchema.table('field_policies', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  entityType:         text('entity_type').notNull(),
  fieldPath:          text('field_path').notNull(),
  track:              text('track').notNull().default('collaborative'),
  allowManualEdit:    boolean('allow_manual_edit').notNull().default(true),
  manualOverrideMode: text('manual_override_mode').notNull().default('manual_sticky'),
  allowedSources:     text('allowed_sources').array().notNull().default([]),
  autoAcceptSources:  text('auto_accept_sources').array().notNull().default([]),
  decisionMode:       text('decision_mode').notNull(),
  riskLevel:          text('risk_level').notNull().default('medium'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  uniqueIndex('field_policies_entity_field_uq').on(table.entityType, table.fieldPath),
  index('field_policies_track_idx').on(table.track),
  index('field_policies_decision_mode_idx').on(table.decisionMode),
]);

/** Versioned rule-set bundles. */
export const RuleSet = dataSchema.table('rule_sets', {
  id:           uuid('id').primaryKey().defaultRandom(),
  version:      text('version').notNull(),
  status:       text('status').notNull().default('draft'),
  summary:      text('summary').notNull().default(''),
  publishedAt:  timestamp('published_at'),
  snapshotHash: text('snapshot_hash').notNull().default(''),
  metadata:     jsonb('metadata').$type<JsonMap>().notNull().default({}),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  uniqueIndex('rule_sets_version_uq').on(table.version),
  index('rule_sets_status_published_at_idx').on(table.status, table.publishedAt),
]);
