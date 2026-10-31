ALTER TABLE "magic"."search_cards" ADD COLUMN "rarities" text[];--> statement-breakpoint
WITH rarity_summaries AS (
  SELECT
    p.card_id,
    p.version,
    array_agg(DISTINCT p.rarity ORDER BY p.rarity) AS rarities
  FROM "magic"."prints" p
  WHERE p.deleted_at IS NULL
  GROUP BY p.card_id, p.version
)
UPDATE "magic"."search_cards" AS s
SET rarities = summaries.rarities
FROM rarity_summaries AS summaries
WHERE s.card_id = summaries.card_id
  AND s.version = summaries.version;--> statement-breakpoint
UPDATE "magic"."search_cards"
SET rarities = ARRAY[]::text[]
WHERE rarities IS NULL;--> statement-breakpoint
ALTER TABLE "magic"."search_cards" ALTER COLUMN "rarities" SET NOT NULL;
