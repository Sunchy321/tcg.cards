import {
  boolean,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { appSchema, dataSchema } from '../schema';
import { users } from '../../auth';

import type {
  ImportCoverageState,
  ImportDecisionMode,
  ImportEntityType,
  ImportFieldGroup,
  ImportFieldState,
  ImportPolicySnapshot as ImportPolicySnapshotData,
  ImportRiskLevel,
  ImportSourceId,
  ImportStrategy,
} from '#model/magic/schema/data/import';

type JsonMap = Record<string, unknown>;
type JsonValue = unknown;

type ImportRuleSetStatus = 'draft' | 'published' | 'archived';
type ImportTriggerType = 'manual' | 'scheduled' | 'webhook' | 'backfill';
type ImportRunStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'canceled';
type ImportDecisionStatus = 'pending' | 'ignored' | 'approved' | 'rejected' | 'applied' | 'rolled_back';
type ImportDecisionSource = 'system' | 'review' | 'apply' | 'rollback';
type ImportValueStorageMode = 'inline' | 'compressed_inline' | 'object_storage_ref';
type ImportApplyAction = 'apply' | 'rollback';
type ImportReviewScopeType = 'change_set' | 'field_change' | 'batch';
type ImportReviewAction = 'approve' | 'reject' | 'ignore' | 'override';
type ImportTrustLevel = 'high' | 'medium';
type ImportFallbackAction = 'ignore' | 'manual_review';
type ImportSourceStatus = 'enabled' | 'candidate' | 'reconcile_only';

export const importSourceStatus = dataSchema.enum('import_source_status', [
  'enabled',
  'candidate',
  'reconcile_only',
]);

export const importTrustLevel = dataSchema.enum('import_trust_level', [
  'high',
  'medium',
]);

export const importEntityType = dataSchema.enum('import_entity_type', [
  'card',
  'cardLocalization',
  'cardPart',
  'cardPartLocalization',
  'print',
  'printPart',
]);

export const importFieldGroup = dataSchema.enum('import_field_group', [
  'structure',
  'oracle',
  'gameplay',
  'localization',
  'print_display',
  'print_metadata',
  'classification',
  'legality',
  'image',
  'external_id',
  'art',
]);

export const importCoverageState = dataSchema.enum('import_coverage_state', [
  'supported',
  'conditional',
  'unsupported',
]);

export const importStrategy = dataSchema.enum('import_strategy', [
  'overwrite',
  'ignore',
  'overwrite_when_matched',
  'approval_required',
]);

export const importDecisionMode = dataSchema.enum('import_decision_mode', [
  'auto_apply',
  'batch_review',
  'manual_review',
]);

export const importRiskLevel = dataSchema.enum('import_risk_level', [
  'low',
  'medium',
  'high',
]);

export const importFallbackAction = dataSchema.enum('import_fallback_action', [
  'ignore',
  'manual_review',
]);

export const importRuleSetStatus = dataSchema.enum('import_rule_set_status', [
  'draft',
  'published',
  'archived',
]);

export const importTriggerType = dataSchema.enum('import_trigger_type', [
  'manual',
  'scheduled',
  'webhook',
  'backfill',
]);

export const importRunStatus = dataSchema.enum('import_run_status', [
  'pending',
  'processing',
  'completed',
  'failed',
  'canceled',
]);

export const importFieldState = dataSchema.enum('import_field_state', [
  'provided',
  'explicit_null',
  'not_provided',
  'not_applicable',
  'parse_failed',
]);

export const importDecisionStatus = dataSchema.enum('import_change_decision_status', [
  'pending',
  'ignored',
  'approved',
  'rejected',
  'applied',
  'rolled_back',
]);

export const importDecisionSource = dataSchema.enum('import_change_decision_source', [
  'system',
  'review',
  'apply',
  'rollback',
]);

export const importValueStorageMode = dataSchema.enum('import_value_storage_mode', [
  'inline',
  'compressed_inline',
  'object_storage_ref',
]);

export const importApplyAction = dataSchema.enum('import_apply_action', [
  'apply',
  'rollback',
]);

export const importReviewScopeType = appSchema.enum('import_review_scope_type', [
  'change_set',
  'field_change',
  'batch',
]);

export const importReviewAction = appSchema.enum('import_review_action', [
  'approve',
  'reject',
  'ignore',
  'override',
]);

export const ImportSource = dataSchema.table('import_sources', {
  sourceId: text('source_id').$type<ImportSourceId>().primaryKey(),
  name:     text('name').notNull(),
  summary:  text('summary').notNull().default(''),
  role:     text('role').notNull().default(''),
  official: boolean('official').notNull().default(false),
  url:      text('url').notNull().default(''),

  trustLevel: importTrustLevel('trust_level').$type<ImportTrustLevel>().notNull(),
  status:     importSourceStatus('status').$type<ImportSourceStatus>().notNull().default('enabled'),

  defaultStrategy:     importStrategy('default_strategy').$type<ImportStrategy>().notNull(),
  defaultDecisionMode: importDecisionMode('default_decision_mode').$type<ImportDecisionMode>().notNull(),

  majorFieldGroups: text('major_field_groups').array().$type<ImportFieldGroup[]>().notNull().default([]),
  notes:            text('notes').array().notNull().default([]),
  config:           jsonb('config').$type<JsonMap>().notNull().default({}),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  index('import_sources_status_idx').on(table.status),
  index('import_sources_trust_level_status_idx').on(table.trustLevel, table.status),
]);

export const ImportRuleSet = dataSchema.table('import_rule_sets', {
  id:      uuid('id').primaryKey().defaultRandom(),
  version: text('version').notNull(),
  status:  importRuleSetStatus('status').$type<ImportRuleSetStatus>().notNull().default('draft'),

  summary:      text('summary').notNull().default(''),
  publishedAt:  timestamp('published_at'),
  publishedBy:  text('published_by').notNull().default(''),
  source:       text('source').notNull().default(''),
  snapshotHash: text('snapshot_hash').notNull().default(''),
  metadata:     jsonb('metadata').$type<JsonMap>().notNull().default({}),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  uniqueIndex('import_rule_sets_version_uq').on(table.version),
  index('import_rule_sets_status_published_at_idx').on(table.status, table.publishedAt),
]);

export const ImportFieldRule = dataSchema.table('import_field_rules', {
  id:        uuid('id').primaryKey().defaultRandom(),
  ruleSetId: uuid('rule_set_id').notNull().references(() => ImportRuleSet.id, { onDelete: 'cascade' }),
  sourceId:  text('source_id').$type<ImportSourceId>().notNull().references(() => ImportSource.sourceId),

  entityType: importEntityType('entity_type').$type<ImportEntityType>().notNull(),
  fieldPath:  text('field_path').notNull(),
  label:      text('label').notNull().default(''),
  group:      importFieldGroup('field_group').$type<ImportFieldGroup>().notNull(),

  coverage:          importCoverageState('coverage').$type<ImportCoverageState>().notNull(),
  coverageNote:      text('coverage_note').notNull().default(''),
  coverageCondition: text('coverage_condition'),

  strategy:       importStrategy('strategy').$type<ImportStrategy>().notNull(),
  decisionMode:   importDecisionMode('decision_mode').$type<ImportDecisionMode>().notNull(),
  riskLevel:      importRiskLevel('risk_level').$type<ImportRiskLevel>().notNull(),
  matcherSummary: text('matcher_summary'),
  fallbackAction: importFallbackAction('fallback_action').$type<ImportFallbackAction>(),

  batchGroupBy:      text('batch_group_by').array().notNull().default([]),
  reasonCode:        text('reason_code').notNull().default(''),
  allowExplicitNull: boolean('allow_explicit_null').notNull().default(false),
  lockedPathAware:   boolean('locked_path_aware').notNull().default(true),
  priority:          integer('priority').notNull().default(0),
  enabled:           boolean('enabled').notNull().default(true),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  uniqueIndex('import_field_rules_scope_path_reason_uq')
    .on(table.ruleSetId, table.sourceId, table.fieldPath, table.reasonCode),
  index('import_field_rules_source_entity_idx').on(table.sourceId, table.entityType),
  index('import_field_rules_rule_set_mode_idx').on(table.ruleSetId, table.decisionMode),
  index('import_field_rules_group_risk_idx').on(table.group, table.riskLevel),
]);

export const ImportPolicySnapshot = dataSchema.table('import_policy_snapshots', {
  id:        uuid('id').primaryKey().defaultRandom(),
  ruleSetId: uuid('rule_set_id').notNull().references(() => ImportRuleSet.id),
  version:   text('version').notNull(),

  publishedAt: timestamp('published_at').notNull(),
  contentHash: text('content_hash').notNull(),
  snapshot:    jsonb('snapshot').$type<ImportPolicySnapshotData>().notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => [
  uniqueIndex('import_policy_snapshots_version_uq').on(table.version),
  uniqueIndex('import_policy_snapshots_content_hash_uq').on(table.contentHash),
  index('import_policy_snapshots_rule_set_id_published_at_idx').on(table.ruleSetId, table.publishedAt),
]);

export const ImportRun = dataSchema.table('import_runs', {
  id:       uuid('id').primaryKey().defaultRandom(),
  sourceId: text('source_id').$type<ImportSourceId>().notNull().references(() => ImportSource.sourceId),

  triggerType: importTriggerType('trigger_type').$type<ImportTriggerType>().notNull().default('manual'),
  status:      importRunStatus('status').$type<ImportRunStatus>().notNull().default('pending'),
  ruleSetId:   uuid('rule_set_id').notNull().references(() => ImportRuleSet.id),

  snapshotVersion: text('snapshot_version').notNull().default(''),
  startedAt:       timestamp('started_at').defaultNow().notNull(),
  completedAt:     timestamp('completed_at'),
  diagnostics:     jsonb('diagnostics').$type<JsonMap>().notNull().default({}),
  fieldStateStats: jsonb('field_state_stats').$type<JsonMap>().notNull().default({}),
  error:           text('error'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  index('import_runs_source_id_status_started_at_idx').on(table.sourceId, table.status, table.startedAt),
  index('import_runs_rule_set_id_status_idx').on(table.ruleSetId, table.status),
]);

export const ImportRawRecord = dataSchema.table('import_raw_records', {
  id:          uuid('id').primaryKey().defaultRandom(),
  importRunId: uuid('import_run_id').notNull().references(() => ImportRun.id, { onDelete: 'cascade' }),
  sourceId:    text('source_id').$type<ImportSourceId>().notNull().references(() => ImportSource.sourceId),

  sourceRecordKey:  text('source_record_key').notNull(),
  targetEntityType: importEntityType('target_entity_type').$type<ImportEntityType>(),
  targetKey:        jsonb('target_key').$type<JsonMap>(),
  matchKey:         jsonb('match_key').$type<JsonMap>(),

  payload:     jsonb('payload').$type<JsonMap>().notNull(),
  payloadHash: text('payload_hash').notNull(),
  normalized:  jsonb('normalized').$type<JsonMap>().notNull().default({}),
  diagnostics: jsonb('diagnostics').$type<JsonMap>().notNull().default({}),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => [
  uniqueIndex('import_raw_records_import_run_id_source_record_key_uq').on(table.importRunId, table.sourceRecordKey),
  index('import_raw_records_import_run_id_idx').on(table.importRunId),
  index('import_raw_records_source_id_target_entity_type_idx').on(table.sourceId, table.targetEntityType),
  index('import_raw_records_payload_hash_idx').on(table.payloadHash),
]);

export const ImportChangeSet = dataSchema.table('import_change_sets', {
  id:          uuid('id').primaryKey().defaultRandom(),
  importRunId: uuid('import_run_id').notNull().references(() => ImportRun.id, { onDelete: 'cascade' }),
  sourceId:    text('source_id').$type<ImportSourceId>().notNull().references(() => ImportSource.sourceId),
  ruleSetId:   uuid('rule_set_id').notNull().references(() => ImportRuleSet.id),

  targetEntityType: importEntityType('target_entity_type').$type<ImportEntityType>().notNull(),
  targetKey:        jsonb('target_key').$type<JsonMap>().notNull(),
  matchKey:         jsonb('match_key').$type<JsonMap>().notNull().default({}),

  decisionMode:   importDecisionMode('decision_mode').$type<ImportDecisionMode>().notNull(),
  decisionStatus: importDecisionStatus('decision_status').$type<ImportDecisionStatus>().notNull().default('pending'),
  decisionSource: importDecisionSource('decision_source').$type<ImportDecisionSource>().notNull().default('system'),
  reasonCode:     text('reason_code').notNull().default(''),

  lockedPathCount:  integer('locked_path_count').notNull().default(0),
  fieldChangeCount: integer('field_change_count').notNull().default(0),
  appliedAt:        timestamp('applied_at'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  index('import_change_sets_import_run_id_target_entity_type_idx').on(table.importRunId, table.targetEntityType),
  index('import_change_sets_decision_status_decision_mode_idx').on(table.decisionStatus, table.decisionMode),
  index('import_change_sets_source_id_rule_set_id_idx').on(table.sourceId, table.ruleSetId),
]);

export const ImportFieldChange = dataSchema.table('import_field_changes', {
  id:          uuid('id').primaryKey().defaultRandom(),
  changeSetId: uuid('change_set_id').notNull().references(() => ImportChangeSet.id, { onDelete: 'cascade' }),

  fieldPath:  text('field_path').notNull(),
  fieldState: importFieldState('field_state').$type<ImportFieldState>().notNull(),

  strategy:       importStrategy('strategy').$type<ImportStrategy>().notNull(),
  decisionMode:   importDecisionMode('decision_mode').$type<ImportDecisionMode>().notNull(),
  decisionStatus: importDecisionStatus('decision_status').$type<ImportDecisionStatus>().notNull().default('pending'),
  decisionSource: importDecisionSource('decision_source').$type<ImportDecisionSource>().notNull().default('system'),
  riskLevel:      importRiskLevel('risk_level').$type<ImportRiskLevel>().notNull(),
  reasonCode:     text('reason_code').notNull().default(''),
  matcherSummary: text('matcher_summary'),
  batchKey:       text('batch_key').notNull().default(''),

  beforeValue: jsonb('before_value').$type<JsonValue>(),
  afterValue:  jsonb('after_value').$type<JsonValue>(),

  beforeValueStorageMode: importValueStorageMode('before_value_storage_mode')
    .$type<ImportValueStorageMode>()
    .notNull()
    .default('inline'),
  afterValueStorageMode: importValueStorageMode('after_value_storage_mode')
    .$type<ImportValueStorageMode>()
    .notNull()
    .default('inline'),
  beforeValueHash: text('before_value_hash').notNull().default(''),
  afterValueHash:  text('after_value_hash').notNull().default(''),
  beforeValueRef:  text('before_value_ref'),
  afterValueRef:   text('after_value_ref'),

  appliedAt: timestamp('applied_at'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  uniqueIndex('import_field_changes_change_set_id_field_path_uq').on(table.changeSetId, table.fieldPath),
  index('import_field_changes_decision_status_decision_mode_idx').on(table.decisionStatus, table.decisionMode),
  index('import_field_changes_batch_key_idx').on(table.batchKey),
  index('import_field_changes_applied_at_idx').on(table.appliedAt),
]);

export const ImportApplyLog = dataSchema.table('import_apply_logs', {
  id:            uuid('id').primaryKey().defaultRandom(),
  fieldChangeId: uuid('field_change_id').notNull().references(() => ImportFieldChange.id, { onDelete: 'cascade' }),
  changeSetId:   uuid('change_set_id').notNull().references(() => ImportChangeSet.id, { onDelete: 'cascade' }),

  action:       importApplyAction('action').$type<ImportApplyAction>().notNull().default('apply'),
  targetSchema: text('target_schema').notNull(),
  targetTable:  text('target_table').notNull(),
  targetKey:    jsonb('target_key').$type<JsonMap>().notNull(),
  fieldPath:    text('field_path').notNull(),

  beforeValue: jsonb('before_value').$type<JsonValue>(),
  afterValue:  jsonb('after_value').$type<JsonValue>(),

  beforeValueStorageMode: importValueStorageMode('before_value_storage_mode')
    .$type<ImportValueStorageMode>()
    .notNull()
    .default('inline'),
  afterValueStorageMode: importValueStorageMode('after_value_storage_mode')
    .$type<ImportValueStorageMode>()
    .notNull()
    .default('inline'),
  beforeValueHash: text('before_value_hash').notNull().default(''),
  afterValueHash:  text('after_value_hash').notNull().default(''),
  beforeValueRef:  text('before_value_ref'),
  afterValueRef:   text('after_value_ref'),

  appliedAt: timestamp('applied_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => [
  index('import_apply_logs_field_change_id_action_idx').on(table.fieldChangeId, table.action),
  index('import_apply_logs_change_set_id_applied_at_idx').on(table.changeSetId, table.appliedAt),
]);

export const ImportReviewAction = appSchema.table('import_review_actions', {
  id:            uuid('id').primaryKey().defaultRandom(),
  changeSetId:   uuid('change_set_id').references(() => ImportChangeSet.id, { onDelete: 'cascade' }),
  fieldChangeId: uuid('field_change_id').references(() => ImportFieldChange.id, { onDelete: 'cascade' }),

  scopeType: importReviewScopeType('scope_type').$type<ImportReviewScopeType>().notNull(),
  scopeKey:  text('scope_key').notNull(),
  action:    importReviewAction('action').$type<ImportReviewAction>().notNull(),

  reviewerId:    text('reviewer_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reason:        text('reason'),
  overrideValue: jsonb('override_value').$type<JsonValue>(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => [
  index('import_review_actions_change_set_id_created_at_idx').on(table.changeSetId, table.createdAt),
  index('import_review_actions_field_change_id_created_at_idx').on(table.fieldChangeId, table.createdAt),
  index('import_review_actions_scope_type_scope_key_idx').on(table.scopeType, table.scopeKey),
  index('import_review_actions_reviewer_id_created_at_idx').on(table.reviewerId, table.createdAt),
]);
