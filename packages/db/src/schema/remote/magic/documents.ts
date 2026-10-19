import { sql } from 'drizzle-orm';
import { check, text, unique } from 'drizzle-orm/pg-core';

import type { DocumentOrigin, DocumentVisibility } from '#model/magic/schema/document-content';

import { documentColumns, documentTables } from '../../document-content';
import { appSchema } from '../../shared/magic/schema';
import { users } from '../auth';

export const Document = appSchema.table('documents', {
  ...documentColumns(),
  origin:     text('origin').$type<DocumentOrigin>().notNull(),
  authorId:   text('author_id').references(() => users.id),
  visibility: text('visibility').$type<DocumentVisibility>().notNull().default('private'),
}, table => [
  unique('documents_slug_uq').on(table.slug),
  unique('documents_static_key_uq').on(table.staticKey),
  check('documents_ownership_ck', sql`(${table.origin} = 'static' AND ${table.authorId} IS NULL AND ${table.staticKey} IS NOT NULL) OR (${table.origin} = 'user' AND ${table.authorId} IS NOT NULL AND ${table.staticKey} IS NULL)`),
  check('documents_visibility_ck', sql`${table.visibility} IN ('public', 'unlisted', 'private')`),
  check('documents_source_language_ck', sql`length(${table.sourceLanguage}) > 0`),
]);

export const { DocumentTranslation, DocumentRevision, DocumentRevisionNode, DocumentRelease, DocumentReleaseTranslation } = documentTables(appSchema, Document.id);
