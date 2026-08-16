ALTER TABLE "hearthstone_data"."patch_states" ADD COLUMN "unpack_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."patch_states" ADD COLUMN "unpack_error" text;--> statement-breakpoint
ALTER TABLE "hearthstone_data"."patch_states" ADD COLUMN "unpacked_at" timestamp;