ALTER TABLE "magic_data"."gatherer" ADD COLUMN "cache_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "magic_data"."gatherer" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "magic_data"."gatherer" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;