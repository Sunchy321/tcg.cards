ALTER TABLE "hearthstone"."tags" ADD COLUMN "value_type" text;--> statement-breakpoint
ALTER TABLE "hearthstone"."tags" ADD COLUMN "localization" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
-- Preserve legacy copy that does not already have a source name or a localized entry.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "hearthstone"."tags" AS tag
    WHERE (
      tag."name" IS NOT NULL
      AND tag."name" IS DISTINCT FROM tag."raw_name"
      AND tag."name" <> tag."slug"
      AND NOT COALESCE(tag."name" = ANY(tag."raw_names"), false)
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_each(tag."localization") AS translation
        WHERE translation.value ->> 'name' = tag."name"
      )
    ) OR (
      tag."description" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_each(tag."localization") AS translation
        WHERE translation.value ->> 'description' = tag."description"
      )
    )
  ) THEN
    RAISE EXCEPTION 'Localize existing Hearthstone tag names and descriptions before removing their old columns';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "hearthstone"."tags" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "hearthstone"."tags" DROP COLUMN "description";