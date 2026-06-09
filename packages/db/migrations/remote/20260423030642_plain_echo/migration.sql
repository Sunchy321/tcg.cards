CREATE TABLE "hearthstone_data"."card_image_assets" (
	"image_spec_version" text,
	"render_hash" text,
	"lang" text NOT NULL,
	"zone" text,
	"template" text,
	"premium" text,
	"r2_bucket" text NOT NULL,
	"r2_key" text NOT NULL,
	"content_type" text DEFAULT 'image/webp' NOT NULL,
	"byte_size" integer,
	"width" integer,
	"height" integer,
	"sha256" text,
	"source_export_id" text,
	"status" text DEFAULT 'ready' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"verified_at" timestamp,
	CONSTRAINT "card_image_assets_pkey" PRIMARY KEY("image_spec_version","render_hash","zone","template","premium")
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."card_image_exports" (
	"export_id" text PRIMARY KEY,
	"image_spec_version" text NOT NULL,
	"filters" jsonb DEFAULT '{}' NOT NULL,
	"request_count" integer NOT NULL,
	"max_request_count" integer NOT NULL,
	"file_format" text DEFAULT 'json' NOT NULL,
	"file_name" text NOT NULL,
	"file_sha256" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "card_image_assets_r2_key_uq" ON "hearthstone_data"."card_image_assets" ("r2_key");--> statement-breakpoint
CREATE INDEX "card_image_assets_render_hash_idx" ON "hearthstone_data"."card_image_assets" ("render_hash");--> statement-breakpoint
CREATE INDEX "card_image_assets_lang_status_idx" ON "hearthstone_data"."card_image_assets" ("lang","status");--> statement-breakpoint
CREATE INDEX "card_image_assets_variant_status_idx" ON "hearthstone_data"."card_image_assets" ("zone","template","premium","status");--> statement-breakpoint
CREATE INDEX "card_image_exports_created_at_idx" ON "hearthstone_data"."card_image_exports" ("created_at");--> statement-breakpoint
CREATE INDEX "card_image_exports_image_spec_version_idx" ON "hearthstone_data"."card_image_exports" ("image_spec_version");