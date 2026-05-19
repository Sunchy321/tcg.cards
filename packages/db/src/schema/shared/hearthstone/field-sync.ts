import {
  bigserial,
  index,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { dataSchema } from './schema';

/** Structured entity keys stored in generic field-sync tables. */
type JsonMap = Record<string, unknown>;

export const FieldCommit = dataSchema.table('field_commits', {
  id:       uuid('id').primaryKey().defaultRandom(),
  sequence: bigserial('sequence', { mode: 'number' }).notNull(),

  entityType: text('entity_type').notNull(),
  entityKey:  jsonb('entity_key').$type<JsonMap>().notNull(),
  fieldPath:  text('field_path').notNull(),

  value: jsonb('value').$type<unknown>(),

  operation:  text('operation').notNull(),
  commitKind: text('commit_kind').notNull(),

  clientMutationId:       text('client_mutation_id').notNull(),
  editorRuntime:          text('editor_runtime').notNull(),
  editorIdentity:         text('editor_identity'),
  expectedRowRevision:    text('expected_row_revision').notNull(),
  expectedWinnerRevision: text('expected_winner_revision'),
  baseRevision:           text('base_revision').notNull(),

  reviewStatus: text('review_status').notNull(),
  reviewedBy:   text('reviewed_by'),
  reviewedAt:   timestamp('reviewed_at'),
  reviewReason: text('review_reason'),

  projectionStatus: text('projection_status').notNull(),
  syncStatus:       text('sync_status').notNull(),

  createdAt:   timestamp('created_at').defaultNow().notNull(),
  projectedAt: timestamp('projected_at'),
}, table => [
  uniqueIndex('field_commits_client_mutation_id_uq').on(table.clientMutationId),
  index('field_commits_sequence_idx').on(table.sequence),
  index('field_commits_entity_field_sequence_idx').on(table.entityType, table.entityKey, table.fieldPath, table.sequence),
  index('field_commits_review_projection_created_at_idx').on(table.reviewStatus, table.projectionStatus, table.createdAt),
]);

/** Conflict rows persisted by both local replay and remote/local apply flows. */
export const FieldConflict = dataSchema.table('field_conflicts', {
  id: uuid('id').primaryKey().defaultRandom(),

  processingSide:  text('processing_side').notNull(),
  processingStage: text('processing_stage').notNull(),
  conflictKind:    text('conflict_kind').notNull(),
  entityType:      text('entity_type').notNull(),
  entityKey:       jsonb('entity_key').$type<JsonMap>().notNull(),
  fieldPath:       text('field_path').notNull(),

  sourceSummary:      jsonb('source_summary').$type<JsonMap>().notNull(),
  candidateBaseValue: jsonb('candidate_base_value').$type<unknown>(),
  localValue:         jsonb('local_value').$type<unknown>(),
  incomingValue:      jsonb('incoming_value').$type<unknown>(),
  effectiveValue:     jsonb('effective_value').$type<unknown>(),
  winnerValue:        jsonb('winner_value').$type<unknown>(),
  baseRevision:       text('base_revision').notNull(),
  status:             text('status').notNull(),
  reason:             text('reason'),
  resolution:         text('resolution'),
  createdAt:          timestamp('created_at').defaultNow().notNull(),
  resolvedAt:         timestamp('resolved_at'),
}, table => [
  index('field_conflicts_side_stage_status_created_at_idx').on(table.processingSide, table.processingStage, table.status, table.createdAt),
  index('field_conflicts_entity_field_status_idx').on(table.entityType, table.entityKey, table.fieldPath, table.status),
]);

export const FieldWinner = dataSchema.table('field_winners', {
  id: uuid('id').primaryKey().defaultRandom(),

  entityType: text('entity_type').notNull(),
  entityKey:  jsonb('entity_key').$type<JsonMap>().notNull(),
  fieldPath:  text('field_path').notNull(),

  winnerValue:  jsonb('winner_value').$type<unknown>(),
  winnerSource: text('winner_source'),
  status:       text('status').notNull().default('active'),

  sourceRuntime: text('source_runtime').notNull(),
  updatedBy:     text('updated_by'),
  baseRevision:  text('base_revision').notNull(),

  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  clearedAt: timestamp('cleared_at'),
}, table => [
  uniqueIndex('field_winners_active_entity_field_uq')
    .on(table.entityType, table.entityKey, table.fieldPath)
    .where(sql`${table.status} = 'active'`),
  index('field_winners_entity_field_idx').on(table.entityType, table.entityKey, table.fieldPath),
  index('field_winners_entity_status_idx').on(table.entityType, table.entityKey, table.status),
  index('field_winners_field_status_idx').on(table.entityType, table.fieldPath, table.status),
  index('field_winners_updated_at_idx').on(table.updatedAt),
]);
