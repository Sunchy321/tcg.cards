import {
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { dataSchema } from '../schema';

type JsonMap = Record<string, unknown>;

export const CardImageAsset = dataSchema.table('card_image_assets', {
  imageSpecVersion: text('image_spec_version').notNull(),
  renderHash:       text('render_hash').notNull(),
  lang:             text('lang').notNull(),
  zone:             text('zone').notNull(),
  template:         text('template').notNull(),
  premium:          text('premium').notNull(),
  r2Bucket:         text('r2_bucket').notNull(),
  r2Key:            text('r2_key').notNull(),
  contentType:      text('content_type').notNull().default('image/webp'),
  byteSize:         integer('byte_size'),
  width:            integer('width'),
  height:           integer('height'),
  sha256:           text('sha256'),
  sourceExportId:   text('source_export_id'),
  sourceImportId:   text('source_import_id'),
  status:           text('status').notNull().default('ready'),
  errorMessage:     text('error_message'),
  createdAt:        timestamp('created_at').defaultNow().notNull(),
  updatedAt:        timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  verifiedAt: timestamp('verified_at'),
}, table => [
  primaryKey({
    columns: [table.imageSpecVersion, table.renderHash, table.zone, table.template, table.premium],
  }),
  uniqueIndex('card_image_assets_r2_key_uq').on(table.r2Key),
  index('card_image_assets_render_hash_idx').on(table.renderHash),
  index('card_image_assets_lang_status_idx').on(table.lang, table.status),
  index('card_image_assets_variant_status_idx').on(table.zone, table.template, table.premium, table.status),
]);

export const CardImageExport = dataSchema.table('card_image_exports', {
  exportId:         text('export_id').primaryKey(),
  imageSpecVersion: text('image_spec_version').notNull(),
  filters:          jsonb('filters').$type<JsonMap>().notNull().default({}),
  requestCount:     integer('request_count').notNull(),
  maxRequestCount:  integer('max_request_count').notNull(),
  fileFormat:       text('file_format').notNull().default('json'),
  fileName:         text('file_name').notNull(),
  fileSha256:       text('file_sha256'),
  createdAt:        timestamp('created_at').defaultNow().notNull(),
}, table => [
  index('card_image_exports_created_at_idx').on(table.createdAt),
  index('card_image_exports_image_spec_version_idx').on(table.imageSpecVersion),
]);

export const CardImageImport = dataSchema.table('card_image_imports', {
  importId:         text('import_id').primaryKey(),
  exportId:         text('export_id').notNull(),
  imageSpecVersion: text('image_spec_version').notNull(),
  archiveFileName:  text('archive_file_name').notNull(),
  archiveSha256:    text('archive_sha256'),
  expectedCount:    integer('expected_count').notNull(),
  importedCount:    integer('imported_count').notNull(),
  uploadedCount:    integer('uploaded_count').notNull(),
  reusedCount:      integer('reused_count').notNull(),
  missingCount:     integer('missing_count').notNull(),
  rejectedCount:    integer('rejected_count').notNull(),
  status:           text('status').notNull(),
  errorMessage:     text('error_message'),
  createdAt:        timestamp('created_at').defaultNow().notNull(),
}, table => [
  index('card_image_imports_created_at_idx').on(table.createdAt),
  index('card_image_imports_export_id_idx').on(table.exportId),
  index('card_image_imports_image_spec_version_idx').on(table.imageSpecVersion),
]);
