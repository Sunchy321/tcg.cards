-- Publish row-change triggers for Hearthstone local result tables.
--
-- This file is a maintenance source, not an executable migration entrypoint.
-- Drizzle migrations do not include external SQL files at runtime, so the
-- actual migration must still contain a copied snapshot of the SQL below.
--
-- When these triggers change:
-- 1. Update this file first.
-- 2. Copy the matching SQL into the new local migration.
-- 3. Keep the rowKey field order aligned with hsdata-publish.ts.
--
-- These triggers intentionally record only the minimal change facts:
-- - table_name
-- - row_key
-- - operation
-- - changed_at
--
-- They do not compute row hashes, do not resolve publish stream ownership,
-- and do not decide the final publish action. Those responsibilities stay in
-- the runtime planner, which compares current rows with PublishRowBaseline.

CREATE OR REPLACE FUNCTION "hearthstone_data"."log_publish_row_change_cards"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "hearthstone_data"."publish_row_change_logs" (
      "table_name",
      "row_key",
      "operation",
      "changed_at"
    )
    VALUES (
      'cards',
      jsonb_build_object('cardId', NEW.card_id)::text,
      'insert',
      now()
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    INSERT INTO "hearthstone_data"."publish_row_change_logs" (
      "table_name",
      "row_key",
      "operation",
      "changed_at"
    )
    VALUES (
      'cards',
      jsonb_build_object('cardId', NEW.card_id)::text,
      'update',
      now()
    );
    RETURN NEW;
  END IF;

  INSERT INTO "hearthstone_data"."publish_row_change_logs" (
    "table_name",
    "row_key",
    "operation",
    "changed_at"
  )
  VALUES (
    'cards',
    jsonb_build_object('cardId', OLD.card_id)::text,
    'delete',
    now()
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS "publish_row_change_cards_trigger" ON "hearthstone"."cards";

CREATE TRIGGER "publish_row_change_cards_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "hearthstone"."cards"
FOR EACH ROW
EXECUTE FUNCTION "hearthstone_data"."log_publish_row_change_cards"();

CREATE OR REPLACE FUNCTION "hearthstone_data"."log_publish_row_change_entities"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "hearthstone_data"."publish_row_change_logs" (
      "table_name",
      "row_key",
      "operation",
      "changed_at"
    )
    VALUES (
      'entities',
      jsonb_build_object(
        'cardId', NEW.card_id,
        'revisionHash', NEW.revision_hash
      )::text,
      'insert',
      now()
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    INSERT INTO "hearthstone_data"."publish_row_change_logs" (
      "table_name",
      "row_key",
      "operation",
      "changed_at"
    )
    VALUES (
      'entities',
      jsonb_build_object(
        'cardId', NEW.card_id,
        'revisionHash', NEW.revision_hash
      )::text,
      'update',
      now()
    );
    RETURN NEW;
  END IF;

  INSERT INTO "hearthstone_data"."publish_row_change_logs" (
    "table_name",
    "row_key",
    "operation",
    "changed_at"
  )
  VALUES (
    'entities',
    jsonb_build_object(
      'cardId', OLD.card_id,
      'revisionHash', OLD.revision_hash
    )::text,
    'delete',
    now()
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS "publish_row_change_entities_trigger" ON "hearthstone"."entities";

CREATE TRIGGER "publish_row_change_entities_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "hearthstone"."entities"
FOR EACH ROW
EXECUTE FUNCTION "hearthstone_data"."log_publish_row_change_entities"();

CREATE OR REPLACE FUNCTION "hearthstone_data"."log_publish_row_change_entity_localizations"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "hearthstone_data"."publish_row_change_logs" (
      "table_name",
      "row_key",
      "operation",
      "changed_at"
    )
    VALUES (
      'entity_localizations',
      jsonb_build_object(
        'cardId', NEW.card_id,
        'lang', NEW.lang,
        'localizationHash', NEW.localization_hash,
        'revisionHash', NEW.revision_hash
      )::text,
      'insert',
      now()
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    INSERT INTO "hearthstone_data"."publish_row_change_logs" (
      "table_name",
      "row_key",
      "operation",
      "changed_at"
    )
    VALUES (
      'entity_localizations',
      jsonb_build_object(
        'cardId', NEW.card_id,
        'lang', NEW.lang,
        'localizationHash', NEW.localization_hash,
        'revisionHash', NEW.revision_hash
      )::text,
      'update',
      now()
    );
    RETURN NEW;
  END IF;

  INSERT INTO "hearthstone_data"."publish_row_change_logs" (
    "table_name",
    "row_key",
    "operation",
    "changed_at"
  )
  VALUES (
    'entity_localizations',
    jsonb_build_object(
      'cardId', OLD.card_id,
      'lang', OLD.lang,
      'localizationHash', OLD.localization_hash,
      'revisionHash', OLD.revision_hash
    )::text,
    'delete',
    now()
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS "publish_row_change_entity_localizations_trigger" ON "hearthstone"."entity_localizations";

CREATE TRIGGER "publish_row_change_entity_localizations_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "hearthstone"."entity_localizations"
FOR EACH ROW
EXECUTE FUNCTION "hearthstone_data"."log_publish_row_change_entity_localizations"();

CREATE OR REPLACE FUNCTION "hearthstone_data"."log_publish_row_change_entity_relations"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "hearthstone_data"."publish_row_change_logs" (
      "table_name",
      "row_key",
      "operation",
      "changed_at"
    )
    VALUES (
      'entity_relations',
      jsonb_build_object(
        'relation', NEW.relation,
        'sourceId', NEW.source_id,
        'sourceRevisionHash', NEW.source_revision_hash,
        'targetId', NEW.target_id
      )::text,
      'insert',
      now()
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    INSERT INTO "hearthstone_data"."publish_row_change_logs" (
      "table_name",
      "row_key",
      "operation",
      "changed_at"
    )
    VALUES (
      'entity_relations',
      jsonb_build_object(
        'relation', NEW.relation,
        'sourceId', NEW.source_id,
        'sourceRevisionHash', NEW.source_revision_hash,
        'targetId', NEW.target_id
      )::text,
      'update',
      now()
    );
    RETURN NEW;
  END IF;

  INSERT INTO "hearthstone_data"."publish_row_change_logs" (
    "table_name",
    "row_key",
    "operation",
    "changed_at"
  )
  VALUES (
    'entity_relations',
    jsonb_build_object(
      'relation', OLD.relation,
      'sourceId', OLD.source_id,
      'sourceRevisionHash', OLD.source_revision_hash,
      'targetId', OLD.target_id
    )::text,
    'delete',
    now()
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS "publish_row_change_entity_relations_trigger" ON "hearthstone"."entity_relations";

CREATE TRIGGER "publish_row_change_entity_relations_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "hearthstone"."entity_relations"
FOR EACH ROW
EXECUTE FUNCTION "hearthstone_data"."log_publish_row_change_entity_relations"();
