CREATE TABLE "hearthstone_data"."publish_ledgers" (
	"publish_target_id" text PRIMARY KEY,
	"environment" text NOT NULL,
	"target_fingerprint" text NOT NULL,
	"batch_id" uuid NOT NULL,
	"source_tag_min" integer NOT NULL,
	"source_tag_max" integer NOT NULL,
	"build_min" integer NOT NULL,
	"build_max" integer NOT NULL,
	"manifest_hash" text NOT NULL,
	"card_count" integer NOT NULL,
	"changed_card_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "publish_ledgers_source_tag_range_chk" CHECK ("source_tag_min" <= "source_tag_max"),
	CONSTRAINT "publish_ledgers_build_range_chk" CHECK ("build_min" <= "build_max"),
	CONSTRAINT "publish_ledgers_source_tag_min_positive_chk" CHECK ("source_tag_min" > 0),
	CONSTRAINT "publish_ledgers_build_min_positive_chk" CHECK ("build_min" > 0),
	CONSTRAINT "publish_ledgers_card_count_nonnegative_chk" CHECK ("card_count" >= 0),
	CONSTRAINT "publish_ledgers_changed_card_count_nonnegative_chk" CHECK ("changed_card_count" >= 0)
);
--> statement-breakpoint
DROP TABLE "magic_app"."import_review_actions";--> statement-breakpoint
CREATE INDEX "publish_ledgers_environment_idx" ON "hearthstone_data"."publish_ledgers" ("environment");--> statement-breakpoint
CREATE INDEX "publish_ledgers_published_at_idx" ON "hearthstone_data"."publish_ledgers" ("published_at");--> statement-breakpoint
DROP TYPE "magic_app"."import_review_action";--> statement-breakpoint
DROP TYPE "magic_app"."import_review_scope_type";