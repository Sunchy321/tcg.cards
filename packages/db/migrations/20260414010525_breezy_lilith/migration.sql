CREATE SCHEMA "hearthstone_app";
--> statement-breakpoint
CREATE SCHEMA "hearthstone_data";
--> statement-breakpoint
CREATE TYPE "magic"."document_change_review_status" AS ENUM('pending', 'confirmed', 'rejected', 'override');--> statement-breakpoint
CREATE TYPE "magic"."document_definition_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "magic"."document_node_change_relation_side" AS ENUM('from', 'to');--> statement-breakpoint
CREATE TYPE "magic"."document_node_change_review_state_cache" AS ENUM('unreviewed', 'pending', 'confirmed', 'rejected', 'overridden');--> statement-breakpoint
CREATE TYPE "magic"."document_node_change_type" AS ENUM('added', 'removed', 'modified', 'moved', 'renamed', 'renamed_modified', 'split', 'merged');--> statement-breakpoint
CREATE TYPE "magic"."document_node_content_status" AS ENUM('source', 'draft', 'reviewed', 'published', 'stale');--> statement-breakpoint
CREATE TYPE "magic"."document_node_kind" AS ENUM('heading', 'term', 'content', 'example');--> statement-breakpoint
CREATE TYPE "magic"."document_version_import_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "magic"."document_version_lifecycle_status" AS ENUM('active', 'superseded');--> statement-breakpoint
CREATE TABLE "magic"."document_change_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"change_id" uuid NOT NULL,
	"status" "magic"."document_change_review_status" NOT NULL,
	"revision" integer NOT NULL,
	"is_latest" boolean DEFAULT true NOT NULL,
	"reason" text,
	"reviewer_id" text,
	"reviewed_at" timestamp,
	"override_payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."document_definitions" (
	"id" text PRIMARY KEY,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"game" text DEFAULT 'magic' NOT NULL,
	"source_locale" "magic"."locale" NOT NULL,
	"parser_strategy" text NOT NULL,
	"node_id_pattern" text,
	"status" "magic"."document_definition_status" DEFAULT 'active'::"magic"."document_definition_status" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."document_nodes" (
	"id" text PRIMARY KEY,
	"version_id" text NOT NULL,
	"document_id" text NOT NULL,
	"node_id" text NOT NULL,
	"node_kind" "magic"."document_node_kind" NOT NULL,
	"path" text NOT NULL,
	"level" integer NOT NULL,
	"parent_node_id" text,
	"sibling_order" integer NOT NULL,
	"source_content_hash" text,
	"source_fingerprint_hash" text,
	"source_content_ref_id" uuid,
	"entity_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."document_node_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"document_id" text NOT NULL,
	"from_version_id" text NOT NULL,
	"to_version_id" text NOT NULL,
	"entity_id" text,
	"from_node_ref_id" text,
	"to_node_ref_id" text,
	"type" "magic"."document_node_change_type" NOT NULL,
	"confidence_score" double precision NOT NULL,
	"review_state_cache" "magic"."document_node_change_review_state_cache" DEFAULT 'unreviewed'::"magic"."document_node_change_review_state_cache" NOT NULL,
	"details" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "magic"."document_node_change_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"change_id" uuid NOT NULL,
	"side" "magic"."document_node_change_relation_side" NOT NULL,
	"entity_id" text,
	"node_ref_id" text,
	"node_id" text,
	"weight" double precision,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."document_node_contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"document_node_id" text NOT NULL,
	"locale" "magic"."locale" NOT NULL,
	"content" bytea NOT NULL,
	"content_hash" text NOT NULL,
	"fingerprint_hash" text NOT NULL,
	"size" integer NOT NULL,
	"source_content_hash" text NOT NULL,
	"status" "magic"."document_node_content_status" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."document_node_entities" (
	"id" text PRIMARY KEY,
	"document_id" text NOT NULL,
	"origin_version_id" text NOT NULL,
	"origin_node_id" text NOT NULL,
	"current_node_ref_id" text,
	"current_node_id" text,
	"current_version_id" text,
	"total_revisions" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."document_versions" (
	"id" text PRIMARY KEY,
	"version_tag" text NOT NULL,
	"document_id" text NOT NULL,
	"effective_date" text NOT NULL,
	"published_at" text NOT NULL,
	"txt_url" text,
	"pdf_url" text,
	"docx_url" text,
	"total_nodes" integer DEFAULT 0 NOT NULL,
	"lifecycle_status" "magic"."document_version_lifecycle_status" DEFAULT 'active'::"magic"."document_version_lifecycle_status" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_data"."document_version_imports" (
	"version_id" text PRIMARY KEY,
	"source_file_hash" text NOT NULL,
	"parser_version" text NOT NULL,
	"normalized_content_version" text NOT NULL,
	"import_run_id" text NOT NULL,
	"imported_at" timestamp,
	"import_status" "magic"."document_version_import_status" DEFAULT 'pending'::"magic"."document_version_import_status" NOT NULL,
	"import_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic"."document_version_pair_revisions" (
	"id" text PRIMARY KEY,
	"document_id" text NOT NULL,
	"from_version_id" text NOT NULL,
	"to_version_id" text NOT NULL,
	"review_revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "magic"."rule_source" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "document_change_reviews_change_id_latest_uq" ON "magic"."document_change_reviews" ("change_id") WHERE "is_latest" = true;--> statement-breakpoint
CREATE INDEX "document_change_reviews_change_id_is_latest_revision_idx" ON "magic"."document_change_reviews" ("change_id","is_latest","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "document_definitions_slug_uq" ON "magic"."document_definitions" ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "document_nodes_version_id_node_id_uq" ON "magic"."document_nodes" ("version_id","node_id");--> statement-breakpoint
CREATE INDEX "document_nodes_document_id_entity_id_idx" ON "magic"."document_nodes" ("document_id","entity_id");--> statement-breakpoint
CREATE INDEX "document_nodes_version_id_path_idx" ON "magic"."document_nodes" ("version_id","path");--> statement-breakpoint
CREATE INDEX "document_nodes_parent_node_id_idx" ON "magic"."document_nodes" ("parent_node_id");--> statement-breakpoint
CREATE INDEX "document_nodes_version_id_source_fingerprint_hash_idx" ON "magic"."document_nodes" ("version_id","source_fingerprint_hash");--> statement-breakpoint
CREATE INDEX "document_node_changes_document_id_from_version_id_to_version_id_idx" ON "magic"."document_node_changes" ("document_id","from_version_id","to_version_id");--> statement-breakpoint
CREATE INDEX "document_node_changes_document_id_entity_id_idx" ON "magic"."document_node_changes" ("document_id","entity_id");--> statement-breakpoint
CREATE INDEX "document_node_changes_document_id_type_idx" ON "magic"."document_node_changes" ("document_id","type");--> statement-breakpoint
CREATE INDEX "document_node_changes_document_id_review_state_cache_confidence_score_idx" ON "magic"."document_node_changes" ("document_id","review_state_cache","confidence_score");--> statement-breakpoint
CREATE INDEX "document_node_change_relations_change_id_side_sort_order_idx" ON "magic"."document_node_change_relations" ("change_id","side","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "document_node_contents_document_node_id_locale_uq" ON "magic"."document_node_contents" ("document_node_id","locale");--> statement-breakpoint
CREATE INDEX "document_node_contents_content_hash_idx" ON "magic"."document_node_contents" ("content_hash");--> statement-breakpoint
CREATE INDEX "document_node_contents_source_content_hash_idx" ON "magic"."document_node_contents" ("source_content_hash");--> statement-breakpoint
CREATE INDEX "document_node_contents_status_idx" ON "magic"."document_node_contents" ("status");--> statement-breakpoint
CREATE INDEX "document_node_entities_document_id_current_version_id_idx" ON "magic"."document_node_entities" ("document_id","current_version_id");--> statement-breakpoint
CREATE INDEX "document_node_entities_document_id_origin_version_id_origin_node_id_idx" ON "magic"."document_node_entities" ("document_id","origin_version_id","origin_node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_document_id_version_tag_uq" ON "magic"."document_versions" ("document_id","version_tag");--> statement-breakpoint
CREATE INDEX "document_versions_document_id_lifecycle_status_idx" ON "magic"."document_versions" ("document_id","lifecycle_status");--> statement-breakpoint
CREATE INDEX "document_version_imports_import_status_idx" ON "magic_data"."document_version_imports" ("import_status");--> statement-breakpoint
CREATE INDEX "document_version_imports_import_run_id_idx" ON "magic_data"."document_version_imports" ("import_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_version_pair_revisions_document_id_from_version_id_to_version_id_uq" ON "magic"."document_version_pair_revisions" ("document_id","from_version_id","to_version_id");--> statement-breakpoint
ALTER TABLE "magic"."document_change_reviews" ADD CONSTRAINT "document_change_reviews_change_id_document_node_changes_id_fkey" FOREIGN KEY ("change_id") REFERENCES "magic"."document_node_changes"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_nodes" ADD CONSTRAINT "document_nodes_version_id_document_versions_id_fkey" FOREIGN KEY ("version_id") REFERENCES "magic"."document_versions"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_nodes" ADD CONSTRAINT "document_nodes_document_id_document_definitions_id_fkey" FOREIGN KEY ("document_id") REFERENCES "magic"."document_definitions"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_nodes" ADD CONSTRAINT "document_nodes_parent_node_id_document_nodes_id_fkey" FOREIGN KEY ("parent_node_id") REFERENCES "magic"."document_nodes"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_nodes" ADD CONSTRAINT "document_nodes_entity_id_document_node_entities_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "magic"."document_node_entities"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_node_changes" ADD CONSTRAINT "document_node_changes_document_id_document_definitions_id_fkey" FOREIGN KEY ("document_id") REFERENCES "magic"."document_definitions"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_node_changes" ADD CONSTRAINT "document_node_changes_from_version_id_document_versions_id_fkey" FOREIGN KEY ("from_version_id") REFERENCES "magic"."document_versions"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_node_changes" ADD CONSTRAINT "document_node_changes_to_version_id_document_versions_id_fkey" FOREIGN KEY ("to_version_id") REFERENCES "magic"."document_versions"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_node_changes" ADD CONSTRAINT "document_node_changes_entity_id_document_node_entities_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "magic"."document_node_entities"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_node_changes" ADD CONSTRAINT "document_node_changes_from_node_ref_id_document_nodes_id_fkey" FOREIGN KEY ("from_node_ref_id") REFERENCES "magic"."document_nodes"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_node_changes" ADD CONSTRAINT "document_node_changes_to_node_ref_id_document_nodes_id_fkey" FOREIGN KEY ("to_node_ref_id") REFERENCES "magic"."document_nodes"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_node_change_relations" ADD CONSTRAINT "document_node_change_relations_yM7gonFIxcTB_fkey" FOREIGN KEY ("change_id") REFERENCES "magic"."document_node_changes"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_node_change_relations" ADD CONSTRAINT "document_node_change_relations_ync0YhFTWBzc_fkey" FOREIGN KEY ("entity_id") REFERENCES "magic"."document_node_entities"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_node_change_relations" ADD CONSTRAINT "document_node_change_relations_CF04jYRUyDfk_fkey" FOREIGN KEY ("node_ref_id") REFERENCES "magic"."document_nodes"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_node_contents" ADD CONSTRAINT "document_node_contents_document_node_id_document_nodes_id_fkey" FOREIGN KEY ("document_node_id") REFERENCES "magic"."document_nodes"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_node_entities" ADD CONSTRAINT "document_node_entities_document_id_document_definitions_id_fkey" FOREIGN KEY ("document_id") REFERENCES "magic"."document_definitions"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_node_entities" ADD CONSTRAINT "document_node_entities_hBuEOyjPka2k_fkey" FOREIGN KEY ("origin_version_id") REFERENCES "magic"."document_versions"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_node_entities" ADD CONSTRAINT "document_node_entities_vkvJqXKA5fAT_fkey" FOREIGN KEY ("current_node_ref_id") REFERENCES "magic"."document_nodes"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_node_entities" ADD CONSTRAINT "document_node_entities_lddrvWyOi6xZ_fkey" FOREIGN KEY ("current_version_id") REFERENCES "magic"."document_versions"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_versions" ADD CONSTRAINT "document_versions_document_id_document_definitions_id_fkey" FOREIGN KEY ("document_id") REFERENCES "magic"."document_definitions"("id");--> statement-breakpoint
ALTER TABLE "magic_data"."document_version_imports" ADD CONSTRAINT "document_version_imports_version_id_document_versions_id_fkey" FOREIGN KEY ("version_id") REFERENCES "magic"."document_versions"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_version_pair_revisions" ADD CONSTRAINT "document_version_pair_revisions_pEvrT1bRRgYd_fkey" FOREIGN KEY ("document_id") REFERENCES "magic"."document_definitions"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_version_pair_revisions" ADD CONSTRAINT "document_version_pair_revisions_tEEzYIZzSxMU_fkey" FOREIGN KEY ("from_version_id") REFERENCES "magic"."document_versions"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_version_pair_revisions" ADD CONSTRAINT "document_version_pair_revisions_Jo1qS1zjCpEv_fkey" FOREIGN KEY ("to_version_id") REFERENCES "magic"."document_versions"("id");