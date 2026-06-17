CREATE TYPE "publish_row_change_operation" AS ENUM('insert', 'update', 'delete');--> statement-breakpoint
ALTER TYPE "hearthstone_data"."publish_batch_row_action" SET SCHEMA "public";--> statement-breakpoint
ALTER TYPE "hearthstone_data"."publish_batch_row_status" SET SCHEMA "public";--> statement-breakpoint
ALTER TYPE "hearthstone_data"."publish_batch_status" SET SCHEMA "public";--> statement-breakpoint
ALTER TYPE "hearthstone_data"."publish_operation_kind" SET SCHEMA "public";--> statement-breakpoint
CREATE TABLE "hearthstone_data"."publish_row_baselines" (
	"publish_target" text,
	"environment" text,
	"publish_type" text DEFAULT 'card_data',
	"table_name" text,
	"row_key" text,
	"row_hash" text NOT NULL,
	"source_batch_id" uuid,
	"published_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "publish_row_baselines_pkey" PRIMARY KEY("publish_target","environment","publish_type","table_name","row_key")
);
--> statement-breakpoint
CREATE TABLE "hearthstone_data"."publish_row_change_logs" (
	"table_name" text,
	"row_key" text,
	"operation" "publish_row_change_operation" NOT NULL,
	"source_build" integer,
	"source_tag" integer,
	"source_run_id" uuid,
	"changed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "publish_row_change_logs_pkey" PRIMARY KEY("table_name","row_key","changed_at")
);
--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_batch_rows" RENAME COLUMN "row_pk" TO "row_key";--> statement-breakpoint
CREATE INDEX "publish_row_baselines_stream_idx" ON "hearthstone_data"."publish_row_baselines" ("publish_target","environment","publish_type");--> statement-breakpoint
CREATE INDEX "publish_row_baselines_source_batch_idx" ON "hearthstone_data"."publish_row_baselines" ("source_batch_id");--> statement-breakpoint
CREATE INDEX "publish_row_change_logs_changed_at_idx" ON "hearthstone_data"."publish_row_change_logs" ("changed_at");--> statement-breakpoint
CREATE INDEX "publish_row_change_logs_table_row_idx" ON "hearthstone_data"."publish_row_change_logs" ("table_name","row_key");--> statement-breakpoint
CREATE INDEX "publish_row_change_logs_operation_idx" ON "hearthstone_data"."publish_row_change_logs" ("operation");--> statement-breakpoint
ALTER TABLE "hearthstone_data"."publish_row_baselines" ADD CONSTRAINT "publish_row_baselines_source_batch_id_publish_batches_id_fkey" FOREIGN KEY ("source_batch_id") REFERENCES "hearthstone_data"."publish_batches"("id");
--> statement-breakpoint
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
--> statement-breakpoint
DROP TRIGGER IF EXISTS "publish_row_change_cards_trigger" ON "hearthstone"."cards";
--> statement-breakpoint
CREATE TRIGGER "publish_row_change_cards_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "hearthstone"."cards"
FOR EACH ROW
EXECUTE FUNCTION "hearthstone_data"."log_publish_row_change_cards"();
--> statement-breakpoint
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
--> statement-breakpoint
DROP TRIGGER IF EXISTS "publish_row_change_entities_trigger" ON "hearthstone"."entities";
--> statement-breakpoint
CREATE TRIGGER "publish_row_change_entities_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "hearthstone"."entities"
FOR EACH ROW
EXECUTE FUNCTION "hearthstone_data"."log_publish_row_change_entities"();
--> statement-breakpoint
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
--> statement-breakpoint
DROP TRIGGER IF EXISTS "publish_row_change_entity_localizations_trigger" ON "hearthstone"."entity_localizations";
--> statement-breakpoint
CREATE TRIGGER "publish_row_change_entity_localizations_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "hearthstone"."entity_localizations"
FOR EACH ROW
EXECUTE FUNCTION "hearthstone_data"."log_publish_row_change_entity_localizations"();
--> statement-breakpoint
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
--> statement-breakpoint
DROP TRIGGER IF EXISTS "publish_row_change_entity_relations_trigger" ON "hearthstone"."entity_relations";
--> statement-breakpoint
CREATE TRIGGER "publish_row_change_entity_relations_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "hearthstone"."entity_relations"
FOR EACH ROW
EXECUTE FUNCTION "hearthstone_data"."log_publish_row_change_entity_relations"();
