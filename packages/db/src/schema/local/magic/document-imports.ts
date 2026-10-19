import { index, text, timestamp } from 'drizzle-orm/pg-core';

import { dataSchema } from '../../shared/magic/schema';
import { DocumentRevision } from './documents';

// Import attempts are build metadata; serving content never depends on their status.
export const DocumentImportRun = dataSchema.table('document_import_runs', {
  id:            text('id').primaryKey(),
  documentId:    text('document_id').notNull(),
  sourceHash:    text('source_hash').notNull(),
  parserVersion: text('parser_version').notNull(),
  revisionId:    text('revision_id').references(() => DocumentRevision.id),
  status:        text('status').$type<'processing' | 'completed' | 'failed'>().notNull(),
  error:         text('error'),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
  completedAt:   timestamp('completed_at'),
}, table => [index('document_import_runs_document_created_idx').on(table.documentId, table.createdAt)]);
