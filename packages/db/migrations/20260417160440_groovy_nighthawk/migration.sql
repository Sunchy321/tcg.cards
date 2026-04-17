CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TYPE "hearthstone_data"."knowledge_job_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "hearthstone_data"."knowledge_source_status" AS ENUM('pending', 'ready', 'stale', 'failed');--> statement-breakpoint
CREATE TYPE "magic_data"."knowledge_job_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "magic_data"."knowledge_source_status" AS ENUM('pending', 'ready', 'stale', 'failed');--> statement-breakpoint
CREATE TABLE "hearthstone_data"."knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"chunk_type" text DEFAULT 'text' NOT NULL,
	"content" text NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"char_count" integer DEFAULT 0 NOT NULL,
	"citation" text NOT NULL,
	"checksum" text NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."knowledge_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"chunk_id" uuid NOT NULL,
	"provider" text DEFAULT 'cloudflare' NOT NULL,
	"model" text NOT NULL,
	"model_version" text DEFAULT '' NOT NULL,
	"dimensions" integer DEFAULT 1024 NOT NULL,
	"distance" text DEFAULT 'cosine' NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."knowledge_index_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source_id" uuid NOT NULL,
	"job_type" text DEFAULT 'index' NOT NULL,
	"trigger" text NOT NULL,
	"status" "hearthstone_data"."knowledge_job_status" DEFAULT 'pending'::"hearthstone_data"."knowledge_job_status" NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"scheduled_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	"error" text,
	"payload" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."knowledge_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source_type" text NOT NULL,
	"source_key" text NOT NULL,
	"version_key" text DEFAULT '' NOT NULL,
	"locale" text DEFAULT '' NOT NULL,
	"checksum" text NOT NULL,
	"status" "hearthstone_data"."knowledge_source_status" DEFAULT 'pending'::"hearthstone_data"."knowledge_source_status" NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_indexed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."knowledge_source_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_key" text NOT NULL,
	"relation" text DEFAULT 'primary' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"chunk_type" text DEFAULT 'text' NOT NULL,
	"content" text NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"char_count" integer DEFAULT 0 NOT NULL,
	"citation" text NOT NULL,
	"checksum" text NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."knowledge_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"chunk_id" uuid NOT NULL,
	"provider" text DEFAULT 'cloudflare' NOT NULL,
	"model" text NOT NULL,
	"model_version" text DEFAULT '' NOT NULL,
	"dimensions" integer DEFAULT 1024 NOT NULL,
	"distance" text DEFAULT 'cosine' NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."knowledge_index_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source_id" uuid NOT NULL,
	"job_type" text DEFAULT 'index' NOT NULL,
	"trigger" text NOT NULL,
	"status" "magic_data"."knowledge_job_status" DEFAULT 'pending'::"magic_data"."knowledge_job_status" NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"scheduled_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	"error" text,
	"payload" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."knowledge_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source_type" text NOT NULL,
	"source_key" text NOT NULL,
	"version_key" text DEFAULT '' NOT NULL,
	"locale" text DEFAULT '' NOT NULL,
	"checksum" text NOT NULL,
	"status" "magic_data"."knowledge_source_status" DEFAULT 'pending'::"magic_data"."knowledge_source_status" NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_indexed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "magic_data"."knowledge_source_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_key" text NOT NULL,
	"relation" text DEFAULT 'primary' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_chunks_source_id_chunk_index_uq" ON "hearthstone_data"."knowledge_chunks" ("source_id","chunk_index");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_source_id_idx" ON "hearthstone_data"."knowledge_chunks" ("source_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_checksum_idx" ON "hearthstone_data"."knowledge_chunks" ("checksum");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_embeddings_chunk_id_provider_model_model_version_uq" ON "hearthstone_data"."knowledge_embeddings" ("chunk_id","provider","model","model_version");--> statement-breakpoint
CREATE INDEX "knowledge_embeddings_provider_model_dimensions_idx" ON "hearthstone_data"."knowledge_embeddings" ("provider","model","dimensions");--> statement-breakpoint
CREATE INDEX "knowledge_embeddings_embedding_hnsw_idx" ON "hearthstone_data"."knowledge_embeddings" USING hnsw ("embedding" vector_cosine_ops) WITH (m=16, ef_construction=64);--> statement-breakpoint
CREATE INDEX "knowledge_index_jobs_status_scheduled_at_idx" ON "hearthstone_data"."knowledge_index_jobs" ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "knowledge_index_jobs_source_id_status_idx" ON "hearthstone_data"."knowledge_index_jobs" ("source_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_sources_source_type_source_key_version_key_locale_uq" ON "hearthstone_data"."knowledge_sources" ("source_type","source_key","version_key","locale");--> statement-breakpoint
CREATE INDEX "knowledge_sources_status_idx" ON "hearthstone_data"."knowledge_sources" ("status");--> statement-breakpoint
CREATE INDEX "knowledge_sources_source_type_source_key_idx" ON "hearthstone_data"."knowledge_sources" ("source_type","source_key");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_source_links_source_id_target_type_target_key_relation_uq" ON "hearthstone_data"."knowledge_source_links" ("source_id","target_type","target_key","relation");--> statement-breakpoint
CREATE INDEX "knowledge_source_links_target_type_target_key_idx" ON "hearthstone_data"."knowledge_source_links" ("target_type","target_key");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_chunks_source_id_chunk_index_uq" ON "magic_data"."knowledge_chunks" ("source_id","chunk_index");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_source_id_idx" ON "magic_data"."knowledge_chunks" ("source_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_checksum_idx" ON "magic_data"."knowledge_chunks" ("checksum");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_embeddings_chunk_id_provider_model_model_version_uq" ON "magic_data"."knowledge_embeddings" ("chunk_id","provider","model","model_version");--> statement-breakpoint
CREATE INDEX "knowledge_embeddings_provider_model_dimensions_idx" ON "magic_data"."knowledge_embeddings" ("provider","model","dimensions");--> statement-breakpoint
CREATE INDEX "knowledge_embeddings_embedding_hnsw_idx" ON "magic_data"."knowledge_embeddings" USING hnsw ("embedding" vector_cosine_ops) WITH (m=16, ef_construction=64);--> statement-breakpoint
CREATE INDEX "knowledge_index_jobs_status_scheduled_at_idx" ON "magic_data"."knowledge_index_jobs" ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "knowledge_index_jobs_source_id_status_idx" ON "magic_data"."knowledge_index_jobs" ("source_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_sources_source_type_source_key_version_key_locale_uq" ON "magic_data"."knowledge_sources" ("source_type","source_key","version_key","locale");--> statement-breakpoint
CREATE INDEX "knowledge_sources_status_idx" ON "magic_data"."knowledge_sources" ("status");--> statement-breakpoint
CREATE INDEX "knowledge_sources_source_type_source_key_idx" ON "magic_data"."knowledge_sources" ("source_type","source_key");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_source_links_source_id_target_type_target_key_relation_uq" ON "magic_data"."knowledge_source_links" ("source_id","target_type","target_key","relation");--> statement-breakpoint
CREATE INDEX "knowledge_source_links_target_type_target_key_idx" ON "magic_data"."knowledge_source_links" ("target_type","target_key");--> statement-breakpoint
ALTER TABLE "hearthstone_data"."knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_source_id_knowledge_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "hearthstone_data"."knowledge_sources"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."knowledge_embeddings" ADD CONSTRAINT "knowledge_embeddings_chunk_id_knowledge_chunks_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "hearthstone_data"."knowledge_chunks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."knowledge_index_jobs" ADD CONSTRAINT "knowledge_index_jobs_source_id_knowledge_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "hearthstone_data"."knowledge_sources"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."knowledge_source_links" ADD CONSTRAINT "knowledge_source_links_source_id_knowledge_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "hearthstone_data"."knowledge_sources"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "magic_data"."knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_source_id_knowledge_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "magic_data"."knowledge_sources"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "magic_data"."knowledge_embeddings" ADD CONSTRAINT "knowledge_embeddings_chunk_id_knowledge_chunks_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "magic_data"."knowledge_chunks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "magic_data"."knowledge_index_jobs" ADD CONSTRAINT "knowledge_index_jobs_source_id_knowledge_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "magic_data"."knowledge_sources"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "magic_data"."knowledge_source_links" ADD CONSTRAINT "knowledge_source_links_source_id_knowledge_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "magic_data"."knowledge_sources"("id") ON DELETE CASCADE;
