CREATE TABLE "magic_data"."document_adjacencies" (
	"id" text PRIMARY KEY,
	"document_id" text NOT NULL,
	"from_release_id" text NOT NULL,
	"to_release_id" text NOT NULL,
	"from_revision_id" text NOT NULL,
	"to_revision_id" text NOT NULL,
	"from_hash" text NOT NULL,
	"to_hash" text NOT NULL,
	"algorithm" text NOT NULL,
	"timeline_hash" text NOT NULL,
	CONSTRAINT "document_adjacencies_pair_uq" UNIQUE("document_id","from_release_id","to_release_id"),
	CONSTRAINT "document_adjacencies_distinct_ck" CHECK ("from_release_id" <> "to_release_id")
);
--> statement-breakpoint
CREATE TABLE "magic_data"."document_node_relations" (
	"comparison_id" text,
	"group_id" text NOT NULL,
	"side" text,
	"node_id" text,
	"identity" text NOT NULL,
	"item_id" text NOT NULL,
	"kind" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "document_node_relations_pkey" PRIMARY KEY("comparison_id","side","node_id"),
	CONSTRAINT "document_node_relations_side_ck" CHECK ("side" IN ('from', 'to')),
	CONSTRAINT "document_node_relations_kind_ck" CHECK ("kind" IN ('unchanged', 'added', 'removed', 'modified', 'moved', 'renamed', 'renamed_modified', 'split', 'merged'))
);
--> statement-breakpoint
ALTER TABLE "magic"."document_revisions" ADD COLUMN "content_hash" text;--> statement-breakpoint
CREATE INDEX "document_node_relations_identity_idx" ON "magic_data"."document_node_relations" ("identity","comparison_id");--> statement-breakpoint
CREATE INDEX "document_node_relations_node_idx" ON "magic_data"."document_node_relations" ("node_id","comparison_id");--> statement-breakpoint
CREATE INDEX "document_node_relations_group_idx" ON "magic_data"."document_node_relations" ("comparison_id","group_id");--> statement-breakpoint
ALTER TABLE "magic_data"."document_adjacencies" ADD CONSTRAINT "document_adjacencies_document_id_documents_id_fkey" FOREIGN KEY ("document_id") REFERENCES "magic"."documents"("id");--> statement-breakpoint
ALTER TABLE "magic_data"."document_adjacencies" ADD CONSTRAINT "document_adjacencies_from_release_id_document_releases_id_fkey" FOREIGN KEY ("from_release_id") REFERENCES "magic"."document_releases"("id");--> statement-breakpoint
ALTER TABLE "magic_data"."document_adjacencies" ADD CONSTRAINT "document_adjacencies_to_release_id_document_releases_id_fkey" FOREIGN KEY ("to_release_id") REFERENCES "magic"."document_releases"("id");--> statement-breakpoint
ALTER TABLE "magic_data"."document_adjacencies" ADD CONSTRAINT "document_adjacencies_Gr77sN0IyE6O_fkey" FOREIGN KEY ("from_revision_id") REFERENCES "magic"."document_revisions"("id");--> statement-breakpoint
ALTER TABLE "magic_data"."document_adjacencies" ADD CONSTRAINT "document_adjacencies_to_revision_id_document_revisions_id_fkey" FOREIGN KEY ("to_revision_id") REFERENCES "magic"."document_revisions"("id");--> statement-breakpoint
ALTER TABLE "magic_data"."document_node_relations" ADD CONSTRAINT "document_node_relations_e5EvKe8LVJoz_fkey" FOREIGN KEY ("comparison_id") REFERENCES "magic_data"."document_adjacencies"("id");