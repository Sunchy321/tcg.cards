CREATE TABLE "magic_data"."asset_images" (
	"key" text PRIMARY KEY,
	"format" text NOT NULL,
	"source" text NOT NULL,
	"sha256" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"byte_size" integer NOT NULL,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"quality_score" double precision
);
--> statement-breakpoint
CREATE INDEX "asset_images_sha256_idx" ON "magic_data"."asset_images" ("sha256");