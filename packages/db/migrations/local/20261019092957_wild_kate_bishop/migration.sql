CREATE TABLE "magic"."documents" (
	"id" text PRIMARY KEY,
	"slug" text NOT NULL CONSTRAINT "documents_slug_uq" UNIQUE,
	"title" text NOT NULL,
	"source_language" text NOT NULL,
	"static_key" text NOT NULL CONSTRAINT "documents_static_key_uq" UNIQUE,
	"settings" jsonb DEFAULT '{"outline":false,"compare":false,"historyPublic":false,"copyable":false}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "documents_source_language_ck" CHECK (length("source_language") > 0)
);
--> statement-breakpoint
CREATE TABLE "magic"."document_releases" (
	"id" text PRIMARY KEY,
	"document_id" text NOT NULL,
	"version_tag" text NOT NULL,
	"source_revision_id" text NOT NULL,
	"published_at" timestamp NOT NULL,
	"effective_date" text,
	"files" jsonb DEFAULT '[]' NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "document_releases_document_version_uq" UNIQUE("document_id","version_tag"),
	CONSTRAINT "document_releases_id_source_uq" UNIQUE("id","document_id","source_revision_id")
);
--> statement-breakpoint
CREATE TABLE "magic"."document_release_translations" (
	"release_id" text,
	"document_id" text NOT NULL,
	"translation_id" text,
	"source_revision_id" text NOT NULL,
	"revision_id" text NOT NULL,
	CONSTRAINT "document_release_translations_pkey" PRIMARY KEY("release_id","translation_id")
);
--> statement-breakpoint
CREATE TABLE "magic"."document_revisions" (
	"id" text PRIMARY KEY,
	"document_id" text NOT NULL,
	"translation_id" text,
	"source_revision_id" text,
	"title" text NOT NULL,
	"language" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "document_revisions_id_document_uq" UNIQUE("id","document_id"),
	CONSTRAINT "document_revisions_id_source_uq" UNIQUE("id","source_revision_id"),
	CONSTRAINT "document_revisions_translation_source_uq" UNIQUE("id","document_id","translation_id","source_revision_id"),
	CONSTRAINT "document_revisions_translation_source_ck" CHECK (("translation_id" IS NULL) = ("source_revision_id" IS NULL)),
	CONSTRAINT "document_revisions_not_self_source_ck" CHECK ("source_revision_id" IS NULL OR "source_revision_id" <> "id")
);
--> statement-breakpoint
CREATE TABLE "magic"."document_revision_nodes" (
	"id" text PRIMARY KEY,
	"revision_id" text NOT NULL,
	"node_key" text NOT NULL,
	"kind" text NOT NULL,
	"anchor" text,
	"path" text NOT NULL,
	"level" integer NOT NULL,
	"parent_id" text,
	"sibling_order" integer NOT NULL,
	"raw_text" text NOT NULL,
	"markers" jsonb DEFAULT '[]' NOT NULL,
	"source_revision_id" text,
	"source_node_id" text,
	"translation_method" text,
	"review_status" text,
	CONSTRAINT "document_revision_nodes_revision_key_uq" UNIQUE("revision_id","node_key"),
	CONSTRAINT "document_revision_nodes_id_revision_uq" UNIQUE("id","revision_id"),
	CONSTRAINT "document_revision_nodes_translation_source_uq" UNIQUE("revision_id","source_node_id"),
	CONSTRAINT "document_revision_nodes_source_pair_ck" CHECK (("source_node_id" IS NULL) = ("source_revision_id" IS NULL)),
	CONSTRAINT "document_revision_nodes_not_self_parent_ck" CHECK ("parent_id" IS NULL OR "parent_id" <> "id"),
	CONSTRAINT "document_revision_nodes_markers_array_ck" CHECK (jsonb_typeof("markers") = 'array'),
	CONSTRAINT "document_revision_nodes_kind_ck" CHECK ("kind" IN ('heading', 'implicit_heading', 'content', 'example')),
	CONSTRAINT "document_revision_nodes_order_ck" CHECK ("level" >= 0 AND "sibling_order" >= 0),
	CONSTRAINT "document_revision_nodes_translation_method_ck" CHECK ("translation_method" IS NULL OR "translation_method" IN ('human', 'machine', 'machine_edited')),
	CONSTRAINT "document_revision_nodes_review_status_ck" CHECK ("review_status" IS NULL OR "review_status" IN ('unreviewed', 'reviewed'))
);
--> statement-breakpoint
CREATE TABLE "magic"."document_translations" (
	"id" text PRIMARY KEY,
	"document_id" text NOT NULL,
	"language" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_translations_document_language_uq" UNIQUE("document_id","language"),
	CONSTRAINT "document_translations_id_document_uq" UNIQUE("id","document_id"),
	CONSTRAINT "document_translations_id_language_uq" UNIQUE("id","document_id","language"),
	CONSTRAINT "document_translations_language_ck" CHECK (length("language") > 0)
);
--> statement-breakpoint
CREATE TABLE "magic_data"."document_import_runs" (
	"id" text PRIMARY KEY,
	"document_id" text NOT NULL,
	"source_hash" text NOT NULL,
	"parser_version" text NOT NULL,
	"revision_id" text,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
DROP VIEW "magic"."rule_view";--> statement-breakpoint
ALTER TABLE "magic"."document_nodes" DROP CONSTRAINT "document_nodes_version_id_document_versions_id_fkey";--> statement-breakpoint
ALTER TABLE "magic"."document_nodes" DROP CONSTRAINT "document_nodes_document_id_document_definitions_id_fkey";--> statement-breakpoint
ALTER TABLE "magic"."document_nodes" DROP CONSTRAINT "document_nodes_entity_id_document_node_entities_id_fkey";--> statement-breakpoint
ALTER TABLE "magic"."document_node_changes" DROP CONSTRAINT "document_node_changes_document_id_document_definitions_id_fkey";--> statement-breakpoint
ALTER TABLE "magic"."document_node_changes" DROP CONSTRAINT "document_node_changes_from_version_id_document_versions_id_fkey";--> statement-breakpoint
ALTER TABLE "magic"."document_node_changes" DROP CONSTRAINT "document_node_changes_to_version_id_document_versions_id_fkey";--> statement-breakpoint
ALTER TABLE "magic"."document_node_changes" DROP CONSTRAINT "document_node_changes_entity_id_document_node_entities_id_fkey";--> statement-breakpoint
ALTER TABLE "magic"."document_node_changes" DROP CONSTRAINT "document_node_changes_from_node_ref_id_document_nodes_id_fkey";--> statement-breakpoint
ALTER TABLE "magic"."document_node_changes" DROP CONSTRAINT "document_node_changes_to_node_ref_id_document_nodes_id_fkey";--> statement-breakpoint
ALTER TABLE "magic"."document_node_change_relations" DROP CONSTRAINT "document_node_change_relations_yM7gonFIxcTB_fkey";--> statement-breakpoint
ALTER TABLE "magic"."document_node_change_relations" DROP CONSTRAINT "document_node_change_relations_ync0YhFTWBzc_fkey";--> statement-breakpoint
ALTER TABLE "magic"."document_node_change_relations" DROP CONSTRAINT "document_node_change_relations_CF04jYRUyDfk_fkey";--> statement-breakpoint
ALTER TABLE "magic"."document_node_contents" DROP CONSTRAINT "document_node_contents_document_node_id_document_nodes_id_fkey";--> statement-breakpoint
ALTER TABLE "magic"."document_node_entities" DROP CONSTRAINT "document_node_entities_document_id_document_definitions_id_fkey";--> statement-breakpoint
ALTER TABLE "magic"."document_node_entities" DROP CONSTRAINT "document_node_entities_hBuEOyjPka2k_fkey";--> statement-breakpoint
ALTER TABLE "magic"."document_node_entities" DROP CONSTRAINT "document_node_entities_vkvJqXKA5fAT_fkey";--> statement-breakpoint
ALTER TABLE "magic"."document_node_entities" DROP CONSTRAINT "document_node_entities_lddrvWyOi6xZ_fkey";--> statement-breakpoint
ALTER TABLE "magic"."document_versions" DROP CONSTRAINT "document_versions_document_id_document_definitions_id_fkey";--> statement-breakpoint
ALTER TABLE "magic"."rule_change" DROP CONSTRAINT "rule_change_from_source_id_rule_source_id_fkey";--> statement-breakpoint
ALTER TABLE "magic"."rule_change" DROP CONSTRAINT "rule_change_to_source_id_rule_source_id_fkey";--> statement-breakpoint
ALTER TABLE "magic"."rule_change" DROP CONSTRAINT "rule_change_entity_id_rule_entity_id_fkey";--> statement-breakpoint
ALTER TABLE "magic"."rule_change" DROP CONSTRAINT "rule_change_from_node_id_rule_node_id_fkey";--> statement-breakpoint
ALTER TABLE "magic"."rule_change" DROP CONSTRAINT "rule_change_to_node_id_rule_node_id_fkey";--> statement-breakpoint
ALTER TABLE "magic"."rule_node" DROP CONSTRAINT "rule_node_source_id_rule_source_id_fkey";--> statement-breakpoint
ALTER TABLE "magic"."rule_node" DROP CONSTRAINT "rule_node_content_hash_rule_content_hash_fkey";--> statement-breakpoint
ALTER TABLE "magic"."rule_node" DROP CONSTRAINT "rule_node_entity_id_rule_entity_id_fkey";--> statement-breakpoint
ALTER TABLE "magic_data"."document_version_imports" DROP CONSTRAINT "document_version_imports_version_id_document_versions_id_fkey";--> statement-breakpoint
DROP TABLE "magic"."document_definitions";--> statement-breakpoint
DROP TABLE "magic"."document_nodes";--> statement-breakpoint
DROP TABLE "magic"."document_node_changes";--> statement-breakpoint
DROP TABLE "magic"."document_node_change_relations";--> statement-breakpoint
DROP TABLE "magic"."document_node_contents";--> statement-breakpoint
DROP TABLE "magic"."document_node_entities";--> statement-breakpoint
DROP TABLE "magic"."document_versions";--> statement-breakpoint
DROP TABLE "magic"."rules";--> statement-breakpoint
DROP TABLE "magic"."rule_change";--> statement-breakpoint
DROP TABLE "magic"."rule_content";--> statement-breakpoint
DROP TABLE "magic"."rule_entity";--> statement-breakpoint
DROP TABLE "magic"."rule_items";--> statement-breakpoint
DROP TABLE "magic"."rule_node";--> statement-breakpoint
DROP TABLE "magic"."rule_source";--> statement-breakpoint
DROP TABLE "magic_data"."document_version_imports";--> statement-breakpoint
CREATE INDEX "document_releases_document_published_idx" ON "magic"."document_releases" ("document_id","published_at");--> statement-breakpoint
CREATE INDEX "document_revisions_document_created_idx" ON "magic"."document_revisions" ("document_id","created_at");--> statement-breakpoint
CREATE INDEX "document_revisions_title_idx" ON "magic"."document_revisions" USING gin (to_tsvector('simple', "title"));--> statement-breakpoint
CREATE INDEX "document_revision_nodes_revision_path_idx" ON "magic"."document_revision_nodes" ("revision_id","path");--> statement-breakpoint
CREATE INDEX "document_revision_nodes_text_idx" ON "magic"."document_revision_nodes" USING gin (to_tsvector('simple', "raw_text"));--> statement-breakpoint
CREATE INDEX "document_import_runs_document_created_idx" ON "magic_data"."document_import_runs" ("document_id","created_at");--> statement-breakpoint
ALTER TABLE "magic"."document_releases" ADD CONSTRAINT "document_releases_document_id_documents_id_fkey" FOREIGN KEY ("document_id") REFERENCES "magic"."documents"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_releases" ADD CONSTRAINT "document_releases_K66uI8IVnLM1_fkey" FOREIGN KEY ("source_revision_id","document_id") REFERENCES "magic"."document_revisions"("id","document_id");--> statement-breakpoint
ALTER TABLE "magic"."document_release_translations" ADD CONSTRAINT "document_release_translations_1uywgLCq6xqv_fkey" FOREIGN KEY ("release_id","document_id","source_revision_id") REFERENCES "magic"."document_releases"("id","document_id","source_revision_id");--> statement-breakpoint
ALTER TABLE "magic"."document_release_translations" ADD CONSTRAINT "document_release_translations_cRuH8zCXzjJ1_fkey" FOREIGN KEY ("revision_id","document_id","translation_id","source_revision_id") REFERENCES "magic"."document_revisions"("id","document_id","translation_id","source_revision_id");--> statement-breakpoint
ALTER TABLE "magic"."document_revisions" ADD CONSTRAINT "document_revisions_document_id_documents_id_fkey" FOREIGN KEY ("document_id") REFERENCES "magic"."documents"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_revisions" ADD CONSTRAINT "document_revisions_Da3oKWJJfSRv_fkey" FOREIGN KEY ("translation_id","document_id","language") REFERENCES "magic"."document_translations"("id","document_id","language");--> statement-breakpoint
ALTER TABLE "magic"."document_revisions" ADD CONSTRAINT "document_revisions_gIH5gP2jgwXp_fkey" FOREIGN KEY ("source_revision_id","document_id") REFERENCES "magic"."document_revisions"("id","document_id");--> statement-breakpoint
ALTER TABLE "magic"."document_revision_nodes" ADD CONSTRAINT "document_revision_nodes_revision_id_document_revisions_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "magic"."document_revisions"("id");--> statement-breakpoint
ALTER TABLE "magic"."document_revision_nodes" ADD CONSTRAINT "document_revision_nodes_kaKqYtoYKIl2_fkey" FOREIGN KEY ("parent_id","revision_id") REFERENCES "magic"."document_revision_nodes"("id","revision_id");--> statement-breakpoint
ALTER TABLE "magic"."document_revision_nodes" ADD CONSTRAINT "document_revision_nodes_aqMZZ2zoVwe4_fkey" FOREIGN KEY ("source_node_id","source_revision_id") REFERENCES "magic"."document_revision_nodes"("id","revision_id");--> statement-breakpoint
ALTER TABLE "magic"."document_revision_nodes" ADD CONSTRAINT "document_revision_nodes_P9zIINbJzT5S_fkey" FOREIGN KEY ("revision_id","source_revision_id") REFERENCES "magic"."document_revisions"("id","source_revision_id");--> statement-breakpoint
ALTER TABLE "magic"."document_translations" ADD CONSTRAINT "document_translations_document_id_documents_id_fkey" FOREIGN KEY ("document_id") REFERENCES "magic"."documents"("id");--> statement-breakpoint
ALTER TABLE "magic_data"."document_import_runs" ADD CONSTRAINT "document_import_runs_revision_id_document_revisions_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "magic"."document_revisions"("id");--> statement-breakpoint
DROP TYPE "magic"."document_definition_status";--> statement-breakpoint
DROP TYPE "magic"."document_node_change_relation_side";--> statement-breakpoint
DROP TYPE "magic"."document_node_change_type";--> statement-breakpoint
DROP TYPE "magic"."document_node_content_status";--> statement-breakpoint
DROP TYPE "magic"."document_node_kind";--> statement-breakpoint
DROP TYPE "magic"."document_version_lifecycle_status";--> statement-breakpoint
DROP TYPE "magic_data"."document_version_import_status";