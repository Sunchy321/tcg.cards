ALTER TYPE "magic"."document_change_review_status" SET SCHEMA "magic_app";--> statement-breakpoint
ALTER TYPE "magic"."document_node_change_review_state_cache" SET SCHEMA "magic_app";--> statement-breakpoint
CREATE TABLE "magic_app"."document_change_review_states" (
	"change_id" uuid PRIMARY KEY,
	"review_state" "magic_app"."document_node_change_review_state_cache" DEFAULT 'unreviewed'::"magic_app"."document_node_change_review_state_cache" NOT NULL,
	"reviewed_at" timestamp,
	"latest_review_id" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "magic"."document_change_reviews" SET SCHEMA "magic_app";
--> statement-breakpoint
ALTER TABLE "magic"."document_version_pair_revisions" SET SCHEMA "magic_app";
--> statement-breakpoint
INSERT INTO "magic_app"."document_change_review_states" (
	"change_id",
	"review_state",
	"reviewed_at",
	"latest_review_id"
)
SELECT
	"change"."id",
	COALESCE("latest_review"."status"::text, "change"."review_state_cache"::text, 'unreviewed')::"magic_app"."document_node_change_review_state_cache",
	COALESCE("latest_review"."reviewed_at", "change"."reviewed_at"),
	"latest_review"."id"
FROM "magic"."document_node_changes" AS "change"
LEFT JOIN LATERAL (
	SELECT
		"review"."id",
		"review"."status",
		"review"."reviewed_at"
	FROM "magic_app"."document_change_reviews" AS "review"
	WHERE "review"."change_id" = "change"."id"
		AND "review"."is_latest" = true
	ORDER BY "review"."revision" DESC
	LIMIT 1
) AS "latest_review" ON true;--> statement-breakpoint
ALTER INDEX "magic"."doc_node_changes_doc_review_conf_idx" RENAME TO "doc_node_changes_doc_conf_idx";--> statement-breakpoint
ALTER TABLE "magic"."document_node_changes" DROP COLUMN "review_state_cache";--> statement-breakpoint
ALTER TABLE "magic"."document_node_changes" DROP COLUMN "reviewed_at";--> statement-breakpoint
DROP INDEX "magic"."doc_node_changes_doc_conf_idx";--> statement-breakpoint
CREATE INDEX "doc_node_changes_doc_conf_idx" ON "magic"."document_node_changes" ("document_id","confidence_score");--> statement-breakpoint
CREATE INDEX "document_change_review_states_review_state_idx" ON "magic_app"."document_change_review_states" ("review_state");--> statement-breakpoint
CREATE UNIQUE INDEX "document_change_review_states_latest_review_id_uq" ON "magic_app"."document_change_review_states" ("latest_review_id") WHERE "latest_review_id" is not null;--> statement-breakpoint
ALTER TABLE "magic_app"."document_change_review_states" ADD CONSTRAINT "document_change_review_states_PY2cjpH9Eey2_fkey" FOREIGN KEY ("change_id") REFERENCES "magic"."document_node_changes"("id");--> statement-breakpoint
ALTER TABLE "magic_app"."document_change_review_states" ADD CONSTRAINT "document_change_review_states_SHLbSmMDq0Ia_fkey" FOREIGN KEY ("latest_review_id") REFERENCES "magic_app"."document_change_reviews"("id");
