import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { dataSchema } from '../schema';

type JsonMap = Record<string, unknown>;
type LocalizedText = Record<string, string>;

interface HsdataImportSnapshotTag {
  enumId:         number;
  rawName:        string;
  rawType:        string;
  rawPayload:     JsonMap;
  rawValue:       string | null;
  locStringValue: LocalizedText | null;
  cardRefCardId:  string | null;
  tagOrder:       number;
}

export const hsdataImportJobStatus = dataSchema.enum('hsdata_import_job_status', [
  'uploading',
  'ready_to_finalize',
  'finalizing',
  'completed',
  'failed',
]);

export const hsdataImportChunkStatus = dataSchema.enum('hsdata_import_chunk_status', [
  'pending',
  'processing',
  'completed',
  'failed',
]);

export const hsdataImportCleanupStatus = dataSchema.enum('hsdata_import_cleanup_status', [
  'not_started',
  'pending',
  'succeeded',
  'failed',
]);

export const HsdataImportJob = dataSchema.table('hsdata_import_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),

  sourceTag:    integer('source_tag').notNull(),
  sourceCommit: text('source_commit').notNull().default(''),
  sourceUri:    text('source_uri').notNull().default(''),
  build:        integer('build').notNull(),

  sourceHash:   text('source_hash').notNull(),
  manifestHash: text('manifest_hash').notNull(),

  chunkingVersion:     text('chunking_version').notNull(),
  payloadFormatVersion: text('payload_format_version').notNull(),
  payloadEncoding:      text('payload_encoding').notNull(),
  importEngineVersion:  text('import_engine_version').notNull(),
  maxBytesPerChunk:    integer('max_bytes_per_chunk').notNull(),
  maxEntitiesPerChunk: integer('max_entities_per_chunk').notNull(),

  dryRun: boolean('dry_run').notNull().default(false),
  force:  boolean('force').notNull().default(false),

  // `chunks` is the manifest truth. These totals only exist so the server can reject
  // inconsistent job creation requests before any rows are written.
  totalChunkCount:  integer('total_chunk_count').notNull(),
  totalEntityCount: integer('total_entity_count').notNull(),

  status: hsdataImportJobStatus('status').notNull().default('uploading'),
  error:  text('error'),
  report: jsonb('report').$type<JsonMap>(),

  // Cleanup status must remain separate from the job lifecycle because a job can be
  // logically completed while staging row deletion still needs a retry.
  stagingCleanupStatus: hsdataImportCleanupStatus('staging_cleanup_status').notNull().default('not_started'),
  stagingCleanupError:  text('staging_cleanup_error'),
  cleanedAt:            timestamp('cleaned_at'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  finalizedAt: timestamp('finalized_at'),
}, table => [
  index('hsdata_import_jobs_source_tag_status_idx').on(table.sourceTag, table.status),
  index('hsdata_import_jobs_status_created_at_idx').on(table.status, table.createdAt),
  index('hsdata_import_jobs_source_hash_idx').on(table.sourceHash),
  index('hsdata_import_jobs_manifest_hash_idx').on(table.manifestHash),
  index('hsdata_import_jobs_cleanup_status_idx').on(table.stagingCleanupStatus),
  check('hsdata_import_jobs_total_chunk_count_positive_chk', sql`${table.totalChunkCount} > 0`),
  check('hsdata_import_jobs_total_entity_count_positive_chk', sql`${table.totalEntityCount} > 0`),
  check('hsdata_import_jobs_max_bytes_per_chunk_positive_chk', sql`${table.maxBytesPerChunk} > 0`),
  check('hsdata_import_jobs_max_entities_per_chunk_positive_chk', sql`${table.maxEntitiesPerChunk} > 0`),
]);

export const HsdataImportJobChunk = dataSchema.table('hsdata_import_job_chunks', {
  jobId: uuid('job_id')
    .notNull()
    .references(() => HsdataImportJob.id, { onDelete: 'cascade' }),
  chunkIndex:  integer('chunk_index').notNull(),
  entityCount: integer('entity_count').notNull(),
  payloadHash: text('payload_hash').notNull(),

  status: hsdataImportChunkStatus('status').notNull().default('pending'),
  error:  text('error'),

  claimedAt:   timestamp('claimed_at'),
  completedAt: timestamp('completed_at'),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
  updatedAt:   timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  primaryKey({ columns: [table.jobId, table.chunkIndex] }),
  index('hsdata_import_job_chunks_job_id_status_idx').on(table.jobId, table.status),
  index('hsdata_import_job_chunks_job_id_payload_hash_idx').on(table.jobId, table.payloadHash),
  check('hsdata_import_job_chunks_chunk_index_nonnegative_chk', sql`${table.chunkIndex} >= 0`),
  check('hsdata_import_job_chunks_entity_count_positive_chk', sql`${table.entityCount} > 0`),
]);

export const HsdataImportJobSnapshot = dataSchema.table('hsdata_import_job_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),

  jobId: uuid('job_id')
    .notNull()
    .references(() => HsdataImportJob.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),

  cardId:           text('card_id').notNull(),
  dbfId:            integer('dbf_id').notNull(),
  entityXmlVersion: integer('entity_xml_version').notNull(),
  snapshotHash:     text('snapshot_hash').notNull(),

  // Finalize needs the normalized tag payload without reparsing chunk XML, so each
  // staged snapshot keeps its tag list inline instead of splitting it into another table.
  tags:         jsonb('tags').$type<HsdataImportSnapshotTag[]>().notNull().default([]),
  extraPayload: jsonb('extra_payload').$type<JsonMap>().notNull().default({}),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  uniqueIndex('hsdata_import_job_snapshots_job_id_card_id_uq').on(table.jobId, table.cardId),
  index('hsdata_import_job_snapshots_job_id_chunk_index_idx').on(table.jobId, table.chunkIndex),
  index('hsdata_import_job_snapshots_job_id_snapshot_hash_idx').on(table.jobId, table.snapshotHash),
  check('hsdata_import_job_snapshots_chunk_index_nonnegative_chk', sql`${table.chunkIndex} >= 0`),
]);
