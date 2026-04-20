import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  bytea,
  doublePrecision,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import type {
  ChangeReviewOverridePayload,
  NodeChangeDetails,
} from '#model/magic/schema/document';

import {
  changeReviewStatus as modelChangeReviewStatus,
  definitionStatus as modelDefinitionStatus,
  nodeChangeRelationSide as modelNodeChangeRelationSide,
  nodeChangeReviewStateCache as modelNodeChangeReviewStateCache,
  nodeChangeType as modelNodeChangeType,
  nodeContentStatus as modelNodeContentStatus,
  nodeKind as modelNodeKind,
  versionImportStatus as modelVersionImportStatus,
  versionLifecycleStatus as modelVersionLifecycleStatus,
} from '#model/magic/schema/document';

import { locale } from './card';
import { dataSchema, schema } from './schema';

export const definitionStatus = schema.enum('document_definition_status', modelDefinitionStatus.enum);
export const versionLifecycleStatus = schema.enum(
  'document_version_lifecycle_status',
  modelVersionLifecycleStatus.enum,
);
export const versionImportStatus = schema.enum(
  'document_version_import_status',
  modelVersionImportStatus.enum,
);
export const nodeKind = schema.enum('document_node_kind', modelNodeKind.enum);
export const nodeContentStatus = schema.enum('document_node_content_status', modelNodeContentStatus.enum);
export const nodeChangeType = schema.enum('document_node_change_type', modelNodeChangeType.enum);
export const nodeChangeReviewStateCache = schema.enum(
  'document_node_change_review_state_cache',
  modelNodeChangeReviewStateCache.enum,
);
export const nodeChangeRelationSide = schema.enum(
  'document_node_change_relation_side',
  modelNodeChangeRelationSide.enum,
);
export const changeReviewStatus = schema.enum(
  'document_change_review_status',
  modelChangeReviewStatus.enum,
);

export const DocumentDefinition = schema.table('document_definitions', {
  id:             text('id').primaryKey(),
  slug:           text('slug').notNull(),
  name:           text('name').notNull(),
  game:           text('game').notNull().default('magic'),
  sourceLocale:   locale('source_locale').notNull(),
  parserStrategy: text('parser_strategy').notNull(),
  nodeIdPattern:  text('node_id_pattern'),
  status:         definitionStatus('status').notNull().default('active'),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
}, table => [
  uniqueIndex('document_definitions_slug_uq').on(table.slug),
]);

export const DocumentVersion = schema.table('document_versions', {
  id:              text('id').primaryKey(),
  versionTag:      text('version_tag').notNull(),
  documentId:      text('document_id').notNull().references(() => DocumentDefinition.id),
  effectiveDate:   text('effective_date').notNull(),
  publishedAt:     text('published_at').notNull(),
  txtUrl:          text('txt_url'),
  pdfUrl:          text('pdf_url'),
  docxUrl:         text('docx_url'),
  totalNodes:      integer('total_nodes').notNull().default(0),
  lifecycleStatus: versionLifecycleStatus('lifecycle_status').notNull().default('active'),
}, table => [
  uniqueIndex('document_versions_document_id_version_tag_uq').on(table.documentId, table.versionTag),
  index('document_versions_document_id_lifecycle_status_idx').on(table.documentId, table.lifecycleStatus),
]);

export const DocumentVersionImport = dataSchema.table('document_version_imports', {
  versionId:                text('version_id').primaryKey().references(() => DocumentVersion.id),
  sourceFileHash:           text('source_file_hash').notNull(),
  parserVersion:            text('parser_version').notNull(),
  normalizedContentVersion: text('normalized_content_version').notNull(),
  importRunId:              text('import_run_id').notNull(),
  importedAt:               timestamp('imported_at'),
  importStatus:             versionImportStatus('import_status').notNull().default('pending'),
  importError:              text('import_error'),
  createdAt:                timestamp('created_at').defaultNow().notNull(),
  updatedAt:                timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  index('document_version_imports_import_status_idx').on(table.importStatus),
  index('document_version_imports_import_run_id_idx').on(table.importRunId),
]);

export const DocumentNodeEntity = schema.table('document_node_entities', {
  id:               text('id').primaryKey(),
  documentId:       text('document_id').notNull().references(() => DocumentDefinition.id),
  originVersionId:  text('origin_version_id').notNull().references(() => DocumentVersion.id),
  originNodeId:     text('origin_node_id').notNull(),
  currentNodeRefId: text('current_node_ref_id').references(() => DocumentNode.id),
  currentNodeId:    text('current_node_id'),
  currentVersionId: text('current_version_id').references(() => DocumentVersion.id),
  totalRevisions:   integer('total_revisions').notNull().default(1),
  createdAt:        timestamp('created_at').defaultNow().notNull(),
  updatedAt:        timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  index('doc_node_entities_doc_current_ver_idx').on(table.documentId, table.currentVersionId),
  index('doc_node_entities_doc_origin_node_idx')
    .on(table.documentId, table.originVersionId, table.originNodeId),
]);

export const DocumentNode = schema.table('document_nodes', {
  id:                    text('id').primaryKey(),
  versionId:             text('version_id').notNull().references(() => DocumentVersion.id),
  documentId:            text('document_id').notNull().references(() => DocumentDefinition.id),
  nodeId:                text('node_id').notNull(),
  nodeKind:              nodeKind('node_kind').notNull(),
  path:                  text('path').notNull(),
  level:                 integer('level').notNull(),
  parentNodeId:          text('parent_node_id').references((): AnyPgColumn => DocumentNode.id),
  siblingOrder:          integer('sibling_order').notNull(),
  sourceContentHash:     text('source_content_hash'),
  sourceFingerprintHash: text('source_fingerprint_hash'),
  sourceContentRefId:    uuid('source_content_ref_id'),
  entityId:              text('entity_id').notNull().references((): AnyPgColumn => DocumentNodeEntity.id),
  createdAt:             timestamp('created_at').defaultNow().notNull(),
}, table => [
  uniqueIndex('document_nodes_version_id_node_id_uq').on(table.versionId, table.nodeId),
  index('document_nodes_document_id_entity_id_idx').on(table.documentId, table.entityId),
  index('document_nodes_version_id_path_idx').on(table.versionId, table.path),
  index('document_nodes_parent_node_id_idx').on(table.parentNodeId),
  index('document_nodes_version_id_source_fingerprint_hash_idx').on(table.versionId, table.sourceFingerprintHash),
]);

export const DocumentNodeContent = schema.table('document_node_contents', {
  id:                uuid('id').primaryKey().defaultRandom(),
  documentNodeId:    text('document_node_id').notNull().references(() => DocumentNode.id),
  locale:            locale('locale').notNull(),
  content:           bytea('content').notNull(),
  contentHash:       text('content_hash').notNull(),
  fingerprintHash:   text('fingerprint_hash').notNull(),
  size:              integer('size').notNull(),
  sourceContentHash: text('source_content_hash').notNull(),
  status:            nodeContentStatus('status').notNull(),
  createdAt:         timestamp('created_at').defaultNow().notNull(),
  updatedAt:         timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  uniqueIndex('document_node_contents_document_node_id_locale_uq').on(table.documentNodeId, table.locale),
  index('document_node_contents_content_hash_idx').on(table.contentHash),
  index('document_node_contents_source_content_hash_idx').on(table.sourceContentHash),
  index('document_node_contents_status_idx').on(table.status),
]);

export const DocumentNodeChange = schema.table('document_node_changes', {
  id:               uuid('id').primaryKey().defaultRandom(),
  documentId:       text('document_id').notNull().references(() => DocumentDefinition.id),
  fromVersionId:    text('from_version_id').notNull().references(() => DocumentVersion.id),
  toVersionId:      text('to_version_id').notNull().references(() => DocumentVersion.id),
  entityId:         text('entity_id').references(() => DocumentNodeEntity.id),
  fromNodeRefId:    text('from_node_ref_id').references(() => DocumentNode.id),
  toNodeRefId:      text('to_node_ref_id').references(() => DocumentNode.id),
  type:             nodeChangeType('type').notNull(),
  confidenceScore:  doublePrecision('confidence_score').notNull(),
  reviewStateCache: nodeChangeReviewStateCache('review_state_cache').notNull().default('unreviewed'),
  details:          jsonb('details').$type<NodeChangeDetails>().notNull().default({}),
  createdAt:        timestamp('created_at').defaultNow().notNull(),
  reviewedAt:       timestamp('reviewed_at'),
}, table => [
  index('doc_node_changes_doc_from_to_idx')
    .on(table.documentId, table.fromVersionId, table.toVersionId),
  index('doc_node_changes_doc_entity_idx').on(table.documentId, table.entityId),
  index('doc_node_changes_doc_type_idx').on(table.documentId, table.type),
  index('doc_node_changes_doc_review_conf_idx')
    .on(table.documentId, table.reviewStateCache, table.confidenceScore),
]);

export const DocumentNodeChangeRelation = schema.table('document_node_change_relations', {
  id:        uuid('id').primaryKey().defaultRandom(),
  changeId:  uuid('change_id').notNull().references(() => DocumentNodeChange.id),
  side:      nodeChangeRelationSide('side').notNull(),
  entityId:  text('entity_id').references(() => DocumentNodeEntity.id),
  nodeRefId: text('node_ref_id').references(() => DocumentNode.id),
  nodeId:    text('node_id'),
  weight:    doublePrecision('weight'),
  sortOrder: integer('sort_order').notNull(),
}, table => [
  index('document_node_change_relations_change_id_side_sort_order_idx').on(table.changeId, table.side, table.sortOrder),
]);

export const DocumentChangeReview = schema.table('document_change_reviews', {
  id:              uuid('id').primaryKey().defaultRandom(),
  changeId:        uuid('change_id').notNull().references(() => DocumentNodeChange.id),
  status:          changeReviewStatus('status').notNull(),
  revision:        integer('revision').notNull(),
  isLatest:        boolean('is_latest').notNull().default(true),
  reason:          text('reason'),
  reviewerId:      text('reviewer_id'),
  reviewedAt:      timestamp('reviewed_at'),
  overridePayload: jsonb('override_payload').$type<ChangeReviewOverridePayload>(),
  createdAt:       timestamp('created_at').defaultNow().notNull(),
}, table => [
  uniqueIndex('document_change_reviews_change_id_latest_uq')
    .on(table.changeId)
    .where(sql`${table.isLatest} = true`),
  index('document_change_reviews_change_id_is_latest_revision_idx').on(table.changeId, table.isLatest, table.revision),
]);

export const DocumentVersionPairRevision = schema.table('document_version_pair_revisions', {
  id:             text('id').primaryKey(),
  documentId:     text('document_id').notNull().references(() => DocumentDefinition.id),
  fromVersionId:  text('from_version_id').notNull().references(() => DocumentVersion.id),
  toVersionId:    text('to_version_id').notNull().references(() => DocumentVersion.id),
  reviewRevision: integer('review_revision').notNull().default(0),
  updatedAt:      timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  uniqueIndex('doc_ver_pair_rev_doc_from_to_uq')
    .on(table.documentId, table.fromVersionId, table.toVersionId),
]);
