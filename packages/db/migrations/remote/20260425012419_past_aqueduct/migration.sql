CREATE TABLE "hearthstone_data"."card_image_imports" (
	"import_id" text PRIMARY KEY,
	"export_id" text NOT NULL,
	"image_spec_version" text NOT NULL,
	"archive_file_name" text NOT NULL,
	"archive_sha256" text,
	"expected_count" integer NOT NULL,
	"imported_count" integer NOT NULL,
	"uploaded_count" integer NOT NULL,
	"reused_count" integer NOT NULL,
	"missing_count" integer NOT NULL,
	"rejected_count" integer NOT NULL,
	"status" text NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hearthstone_data"."card_image_assets" ADD COLUMN "source_import_id" text;--> statement-breakpoint
CREATE INDEX "card_image_imports_created_at_idx" ON "hearthstone_data"."card_image_imports" ("created_at");--> statement-breakpoint
CREATE INDEX "card_image_imports_export_id_idx" ON "hearthstone_data"."card_image_imports" ("export_id");--> statement-breakpoint
CREATE INDEX "card_image_imports_image_spec_version_idx" ON "hearthstone_data"."card_image_imports" ("image_spec_version");