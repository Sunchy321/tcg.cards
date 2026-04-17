import {
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { dataSchema } from '../schema';
import { vector } from '../../../type/vector';

type JsonMap = Record<string, unknown>;

const embedding = vector();

export const knowledgeSourceStatus = dataSchema.enum('knowledge_source_status', [
  'pending',
  'ready',
  'stale',
  'failed',
]);

export const knowledgeJobStatus = dataSchema.enum('knowledge_job_status', [
  'pending',
  'processing',
  'completed',
  'failed',
  'canceled',
]);

export const KnowledgeSource = dataSchema.table('knowledge_sources', {
  id:         uuid('id').primaryKey().defaultRandom(),
  sourceType: text('source_type').notNull(),
  sourceKey:  text('source_key').notNull(),
  versionKey: text('version_key').notNull().default(''),
  locale:     text('locale').notNull().default(''),
  checksum:   text('checksum').notNull(),
  status:     knowledgeSourceStatus('status').notNull().default('pending'),
  metadata:   jsonb('metadata').$type<JsonMap>().notNull().default({}),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
  updatedAt:  timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  lastIndexedAt: timestamp('last_indexed_at'),
}, table => [
  uniqueIndex('knowledge_sources_source_type_source_key_version_key_locale_uq')
    .on(table.sourceType, table.sourceKey, table.versionKey, table.locale),
  index('knowledge_sources_status_idx').on(table.status),
  index('knowledge_sources_source_type_source_key_idx').on(table.sourceType, table.sourceKey),
]);

export const KnowledgeChunk = dataSchema.table('knowledge_chunks', {
  id:         uuid('id').primaryKey().defaultRandom(),
  sourceId:   uuid('source_id').notNull().references(() => KnowledgeSource.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  chunkType:  text('chunk_type').notNull().default('text'),
  content:    text('content').notNull(),
  tokenCount: integer('token_count').notNull().default(0),
  charCount:  integer('char_count').notNull().default(0),
  citation:   text('citation').notNull(),
  checksum:   text('checksum').notNull(),
  metadata:   jsonb('metadata').$type<JsonMap>().notNull().default({}),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
  updatedAt:  timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  uniqueIndex('knowledge_chunks_source_id_chunk_index_uq').on(table.sourceId, table.chunkIndex),
  index('knowledge_chunks_source_id_idx').on(table.sourceId),
  index('knowledge_chunks_checksum_idx').on(table.checksum),
]);

export const KnowledgeEmbedding = dataSchema.table('knowledge_embeddings', {
  id:           uuid('id').primaryKey().defaultRandom(),
  chunkId:      uuid('chunk_id').notNull().references(() => KnowledgeChunk.id, { onDelete: 'cascade' }),
  provider:     text('provider').notNull().default('cloudflare'),
  model:        text('model').notNull(),
  modelVersion: text('model_version').notNull().default(''),
  dimensions:   integer('dimensions').notNull().default(1024),
  distance:     text('distance').notNull().default('cosine'),
  embedding:    embedding('embedding', { dimensions: 1024 }).notNull(),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
  updatedAt:    timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  uniqueIndex('knowledge_embeddings_chunk_id_provider_model_model_version_uq')
    .on(table.chunkId, table.provider, table.model, table.modelVersion),
  index('knowledge_embeddings_provider_model_dimensions_idx').on(table.provider, table.model, table.dimensions),
  index('knowledge_embeddings_embedding_hnsw_idx')
    .using('hnsw', table.embedding.op('vector_cosine_ops'))
    .with({ m: 16, ef_construction: 64 }),
]);

export const KnowledgeIndexJob = dataSchema.table('knowledge_index_jobs', {
  id:           uuid('id').primaryKey().defaultRandom(),
  sourceId:     uuid('source_id').notNull().references(() => KnowledgeSource.id, { onDelete: 'cascade' }),
  jobType:      text('job_type').notNull().default('index'),
  trigger:      text('trigger').notNull(),
  status:       knowledgeJobStatus('status').notNull().default('pending'),
  attemptCount: integer('attempt_count').notNull().default(0),
  maxAttempts:  integer('max_attempts').notNull().default(3),
  scheduledAt:  timestamp('scheduled_at').defaultNow().notNull(),
  startedAt:    timestamp('started_at'),
  finishedAt:   timestamp('finished_at'),
  error:        text('error'),
  payload:      jsonb('payload').$type<JsonMap>().notNull().default({}),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
  updatedAt:    timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  index('knowledge_index_jobs_status_scheduled_at_idx').on(table.status, table.scheduledAt),
  index('knowledge_index_jobs_source_id_status_idx').on(table.sourceId, table.status),
]);

export const KnowledgeSourceLink = dataSchema.table('knowledge_source_links', {
  id:         uuid('id').primaryKey().defaultRandom(),
  sourceId:   uuid('source_id').notNull().references(() => KnowledgeSource.id, { onDelete: 'cascade' }),
  targetType: text('target_type').notNull(),
  targetKey:  text('target_key').notNull(),
  relation:   text('relation').notNull().default('primary'),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
}, table => [
  uniqueIndex('knowledge_source_links_source_id_target_type_target_key_relation_uq')
    .on(table.sourceId, table.targetType, table.targetKey, table.relation),
  index('knowledge_source_links_target_type_target_key_idx').on(table.targetType, table.targetKey),
]);
