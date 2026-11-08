DROP VIEW "hearthstone_data"."tag_value_view";--> statement-breakpoint
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
ALTER TABLE "hearthstone"."tags" DROP COLUMN "description";--> statement-breakpoint
CREATE VIEW "hearthstone_data"."tag_value_view" AS (select "hearthstone_data"."raw_entity_snapshot_tags"."snapshot_id", "hearthstone_data"."raw_entity_snapshots"."card_id", "hearthstone_data"."raw_entity_snapshots"."dbf_id", "hearthstone_data"."raw_entity_snapshots"."source_tags", "hearthstone_data"."raw_entity_snapshot_tags"."enum_id", "hearthstone"."tags"."slug" as "tag_slug", "hearthstone"."tags"."raw_name" as "tag_name", "hearthstone_data"."raw_entity_snapshot_tags"."value_kind", "hearthstone_data"."raw_entity_snapshot_tags"."bool_value", "hearthstone_data"."raw_entity_snapshot_tags"."int_value", "hearthstone_data"."raw_entity_snapshot_tags"."string_value", "hearthstone_data"."raw_entity_snapshot_tags"."enum_value", "hearthstone_data"."raw_entity_snapshot_tags"."loc_string_value", "hearthstone_data"."raw_entity_snapshot_tags"."card_value", "hearthstone_data"."raw_entity_snapshot_tags"."json_value" from "hearthstone_data"."raw_entity_snapshot_tags" inner join "hearthstone_data"."raw_entity_snapshots" on "hearthstone_data"."raw_entity_snapshot_tags"."snapshot_id" = "hearthstone_data"."raw_entity_snapshots"."id" inner join "hearthstone"."tags" on "hearthstone_data"."raw_entity_snapshot_tags"."enum_id" = "hearthstone"."tags"."enum_id");