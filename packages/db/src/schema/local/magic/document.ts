import {
  index,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import { versionImportStatus as modelVersionImportStatus } from '#model/magic/schema/document';

import { DocumentVersion } from '../../shared/magic/document';
import { dataSchema } from '../../shared/magic/schema';

export const versionImportStatus = dataSchema.enum(
  'document_version_import_status',
  modelVersionImportStatus.enum,
);

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
