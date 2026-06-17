CREATE TABLE "publish_stream_registrations" (
	"publish_target" text,
	"environment" text,
	"publish_type" text DEFAULT 'card_data',
	"target_fingerprint" text NOT NULL,
	"normal_publish_enabled" boolean DEFAULT false NOT NULL,
	"lease_holder_id" text,
	"lease_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "publish_stream_registrations_pkey" PRIMARY KEY("publish_target","environment","publish_type")
);
--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_ledgers" SET SCHEMA "public";
--> statement-breakpoint
ALTER TABLE "publish_ledgers" ADD COLUMN "generation_fingerprint" text DEFAULT 'card-data-projector/v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "publish_ledgers" ADD COLUMN "generation_order" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX "publish_stream_registrations_stream_idx" ON "publish_stream_registrations" ("publish_target","environment","publish_type");--> statement-breakpoint
CREATE INDEX "publish_stream_registrations_publish_enabled_idx" ON "publish_stream_registrations" ("normal_publish_enabled");--> statement-breakpoint
CREATE INDEX "publish_stream_registrations_lease_expires_at_idx" ON "publish_stream_registrations" ("lease_expires_at");--> statement-breakpoint
ALTER TABLE "publish_ledgers" ADD CONSTRAINT "publish_ledgers_generation_order_positive_chk" CHECK ("generation_order" > 0);