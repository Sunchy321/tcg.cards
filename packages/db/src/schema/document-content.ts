import { sql } from 'drizzle-orm';
import { type AnyPgColumn, type PgSchema, check, foreignKey, index, integer, jsonb, primaryKey, text, timestamp, unique } from 'drizzle-orm/pg-core';

import type { DocumentMeta, DocumentSettings, ReviewStatus, SourceFile, TextMarker, TranslationMethod } from '#model/magic/schema/document-content';
import type { NodeKind } from '#model/magic/schema/document';

/** Share content columns without pulling remote users into local schemas. */
export function documentColumns() {
  return {
    id:             text('id').primaryKey(),
    slug:           text('slug').notNull(),
    title:          text('title').notNull(),
    sourceLanguage: text('source_language').notNull(),
    staticKey:      text('static_key'),
    settings:       jsonb('settings').$type<DocumentSettings>().notNull().default({ outline: false, compare: false, historyPublic: false, copyable: false }),
    createdAt:      timestamp('created_at').notNull().defaultNow(),
    updatedAt:      timestamp('updated_at').notNull().defaultNow(),
    deletedAt:      timestamp('deleted_at'),
  };
}

/** Build referenced content tables in the deployment's owning namespace. */
export function documentTables(schema: PgSchema, documentId: AnyPgColumn) {
  const DocumentTranslation = schema.table('document_translations', {
    id:         text('id').primaryKey(),
    documentId: text('document_id').notNull().references(() => documentId),
    language:   text('language').notNull(),
    createdAt:  timestamp('created_at').notNull().defaultNow(),
  }, table => [
    unique('document_translations_document_language_uq').on(table.documentId, table.language),
    unique('document_translations_id_document_uq').on(table.id, table.documentId),
    unique('document_translations_id_language_uq').on(table.id, table.documentId, table.language),
    check('document_translations_language_ck', sql`length(${table.language}) > 0`),
  ]);

  const DocumentRevision = schema.table('document_revisions', {
    id:               text('id').primaryKey(),
    documentId:       text('document_id').notNull().references(() => documentId),
    translationId:    text('translation_id'),
    sourceRevisionId: text('source_revision_id'),
    title:            text('title').notNull(),
    language:         text('language').notNull(),
    contentHash:      text('content_hash'),
    meta:             jsonb('meta').$type<DocumentMeta>().notNull().default({}),
    createdAt:        timestamp('created_at').notNull().defaultNow(),
    deletedAt:        timestamp('deleted_at'),
  }, table => [
    unique('document_revisions_id_document_uq').on(table.id, table.documentId),
    unique('document_revisions_id_source_uq').on(table.id, table.sourceRevisionId),
    unique('document_revisions_translation_source_uq').on(table.id, table.documentId, table.translationId, table.sourceRevisionId),
    foreignKey({ columns: [table.translationId, table.documentId, table.language], foreignColumns: [DocumentTranslation.id, DocumentTranslation.documentId, DocumentTranslation.language] }),
    foreignKey({ columns: [table.sourceRevisionId, table.documentId], foreignColumns: [table.id, table.documentId] }),
    check('document_revisions_translation_source_ck', sql`(${table.translationId} IS NULL) = (${table.sourceRevisionId} IS NULL)`),
    check('document_revisions_not_self_source_ck', sql`${table.sourceRevisionId} IS NULL OR ${table.sourceRevisionId} <> ${table.id}`),
    index('document_revisions_document_created_idx').on(table.documentId, table.createdAt),
    index('document_revisions_title_idx').using('gin', sql`to_tsvector('simple', ${table.title})`),
  ]);

  const DocumentRevisionNode = schema.table('document_revision_nodes', {
    id:                text('id').primaryKey(),
    revisionId:        text('revision_id').notNull().references(() => DocumentRevision.id),
    nodeKey:           text('node_key').notNull(),
    kind:              text('kind').$type<NodeKind>().notNull(),
    anchor:            text('anchor'),
    path:              text('path').notNull(),
    level:             integer('level').notNull(),
    parentId:          text('parent_id'),
    siblingOrder:      integer('sibling_order').notNull(),
    rawText:           text('raw_text').notNull(),
    markers:           jsonb('markers').$type<TextMarker[]>().notNull().default([]),
    sourceRevisionId:  text('source_revision_id'),
    sourceNodeId:      text('source_node_id'),
    translationMethod: text('translation_method').$type<TranslationMethod>(),
    reviewStatus:      text('review_status').$type<ReviewStatus>(),
  }, table => [
    unique('document_revision_nodes_revision_key_uq').on(table.revisionId, table.nodeKey),
    unique('document_revision_nodes_id_revision_uq').on(table.id, table.revisionId),
    unique('document_revision_nodes_translation_source_uq').on(table.revisionId, table.sourceNodeId),
    foreignKey({ columns: [table.parentId, table.revisionId], foreignColumns: [table.id, table.revisionId] }),
    foreignKey({ columns: [table.sourceNodeId, table.sourceRevisionId], foreignColumns: [table.id, table.revisionId] }),
    foreignKey({ columns: [table.revisionId, table.sourceRevisionId], foreignColumns: [DocumentRevision.id, DocumentRevision.sourceRevisionId] }),
    check('document_revision_nodes_source_pair_ck', sql`(${table.sourceNodeId} IS NULL) = (${table.sourceRevisionId} IS NULL)`),
    check('document_revision_nodes_not_self_parent_ck', sql`${table.parentId} IS NULL OR ${table.parentId} <> ${table.id}`),
    check('document_revision_nodes_markers_array_ck', sql`jsonb_typeof(${table.markers}) = 'array'`),
    check('document_revision_nodes_kind_ck', sql`${table.kind} IN ('heading', 'implicit_heading', 'content', 'example')`),
    check('document_revision_nodes_order_ck', sql`${table.level} >= 0 AND ${table.siblingOrder} >= 0`),
    check('document_revision_nodes_translation_method_ck', sql`${table.translationMethod} IS NULL OR ${table.translationMethod} IN ('human', 'machine', 'machine_edited')`),
    check('document_revision_nodes_review_status_ck', sql`${table.reviewStatus} IS NULL OR ${table.reviewStatus} IN ('unreviewed', 'reviewed')`),
    index('document_revision_nodes_revision_path_idx').on(table.revisionId, table.path),
    // Derived search data keeps literal symbols and readable text authoritative.
    index('document_revision_nodes_text_idx').using('gin', sql`to_tsvector('simple', ${table.rawText})`),
  ]);

  const DocumentRelease = schema.table('document_releases', {
    id:               text('id').primaryKey(),
    documentId:       text('document_id').notNull().references(() => documentId),
    versionTag:       text('version_tag').notNull(),
    sourceRevisionId: text('source_revision_id').notNull(),
    publishedAt:      timestamp('published_at').notNull(),
    effectiveDate:    text('effective_date'),
    files:            jsonb('files').$type<SourceFile[]>().notNull().default([]),
    deletedAt:        timestamp('deleted_at'),
  }, table => [
    unique('document_releases_document_version_uq').on(table.documentId, table.versionTag),
    unique('document_releases_id_source_uq').on(table.id, table.documentId, table.sourceRevisionId),
    foreignKey({ columns: [table.sourceRevisionId, table.documentId], foreignColumns: [DocumentRevision.id, DocumentRevision.documentId] }),
    index('document_releases_document_published_idx').on(table.documentId, table.publishedAt),
  ]);

  const DocumentReleaseTranslation = schema.table('document_release_translations', {
    releaseId:        text('release_id').notNull(),
    documentId:       text('document_id').notNull(),
    translationId:    text('translation_id').notNull(),
    sourceRevisionId: text('source_revision_id').notNull(),
    revisionId:       text('revision_id').notNull(),
  }, table => [
    primaryKey({ columns: [table.releaseId, table.translationId] }),
    foreignKey({ columns: [table.releaseId, table.documentId, table.sourceRevisionId], foreignColumns: [DocumentRelease.id, DocumentRelease.documentId, DocumentRelease.sourceRevisionId] }),
    foreignKey({ columns: [table.revisionId, table.documentId, table.translationId, table.sourceRevisionId], foreignColumns: [DocumentRevision.id, DocumentRevision.documentId, DocumentRevision.translationId, DocumentRevision.sourceRevisionId] }),
  ]);

  return { DocumentTranslation, DocumentRevision, DocumentRevisionNode, DocumentRelease, DocumentReleaseTranslation };
}
