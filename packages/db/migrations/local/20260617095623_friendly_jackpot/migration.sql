ALTER TABLE "hearthstone_data"."publish_baselines" ADD COLUMN "generation_fingerprint" text DEFAULT 'card-data-projector/v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_baselines" ADD COLUMN "generation_order" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ADD COLUMN "generation_fingerprint" text DEFAULT 'card-data-projector/v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ADD COLUMN "generation_order" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_baselines" ADD CONSTRAINT "publish_baselines_generation_order_positive_chk" CHECK ("generation_order" > 0);--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batches" ADD CONSTRAINT "publish_batches_generation_order_positive_chk" CHECK ("generation_order" > 0);