ALTER TABLE "yugioh"."cards" ADD COLUMN "primary_image_r2_bucket" text;--> statement-breakpoint
ALTER TABLE "yugioh"."cards" ADD COLUMN "primary_image_r2_key" text;--> statement-breakpoint
ALTER TABLE "yugioh"."cards" ADD COLUMN "primary_image_content_type" text;--> statement-breakpoint
ALTER TABLE "yugioh"."cards" ADD COLUMN "primary_image_byte_size" integer;--> statement-breakpoint
ALTER TABLE "yugioh"."cards" ADD COLUMN "primary_image_width" integer;--> statement-breakpoint
ALTER TABLE "yugioh"."cards" ADD COLUMN "primary_image_height" integer;--> statement-breakpoint
ALTER TABLE "yugioh"."cards" ADD COLUMN "primary_image_sha256" varchar(64);--> statement-breakpoint
ALTER TABLE "yugioh"."cards" ADD COLUMN "primary_image_deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "cards_primary_image_r2_key_uidx" ON "yugioh"."cards" ("primary_image_r2_key");--> statement-breakpoint
CREATE INDEX "cards_primary_image_deleted_at_idx" ON "yugioh"."cards" ("primary_image_deleted_at");--> statement-breakpoint
ALTER TABLE "yugioh"."cards" ADD CONSTRAINT "cards_primary_image_sha256_format_chk" CHECK ("primary_image_sha256" is null or "primary_image_sha256" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
ALTER TABLE "yugioh"."cards" ADD CONSTRAINT "cards_primary_image_byte_size_positive_chk" CHECK ("primary_image_byte_size" is null or "primary_image_byte_size" > 0);--> statement-breakpoint
ALTER TABLE "yugioh"."cards" ADD CONSTRAINT "cards_primary_image_width_positive_chk" CHECK ("primary_image_width" is null or "primary_image_width" > 0);--> statement-breakpoint
ALTER TABLE "yugioh"."cards" ADD CONSTRAINT "cards_primary_image_height_positive_chk" CHECK ("primary_image_height" is null or "primary_image_height" > 0);--> statement-breakpoint
ALTER TABLE "yugioh"."cards" ADD CONSTRAINT "cards_primary_image_fields_complete_chk" CHECK (
    ("primary_image_r2_key" is null
      and "primary_image_r2_bucket" is null
      and "primary_image_content_type" is null
      and "primary_image_byte_size" is null
      and "primary_image_width" is null
      and "primary_image_height" is null
      and "primary_image_sha256" is null)
    or
    ("primary_image_r2_key" is not null
      and "primary_image_r2_bucket" is not null
      and "primary_image_content_type" is not null
      and "primary_image_byte_size" is not null
      and "primary_image_width" is not null
      and "primary_image_height" is not null
      and "primary_image_sha256" is not null)
  );