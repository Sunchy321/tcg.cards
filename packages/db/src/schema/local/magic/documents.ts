import { documentRelationTables } from '../../document-relations';
import { check, text, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { documentColumns, documentTables } from '../../document-content';
import { dataSchema, schema } from '../../shared/magic/schema';

// Local build content has no user fields or references to application tables.
export const Document = schema.table('documents', {
  ...documentColumns(),
  staticKey: text('static_key').notNull(),
}, table => [
  unique('documents_slug_uq').on(table.slug),
  unique('documents_static_key_uq').on(table.staticKey),
  check('documents_source_language_ck', sql`length(${table.sourceLanguage}) > 0`),
]);

export const { DocumentTranslation, DocumentRevision, DocumentRevisionNode, DocumentRelease, DocumentReleaseTranslation } = documentTables(schema, Document.id);

export const { DocumentAdjacency, DocumentNodeRelation } = documentRelationTables(dataSchema, Document.id, DocumentRelease.id, DocumentRevision.id);
