import { isNull, sql } from 'drizzle-orm';

import type { MagicSearchManifest } from '@tcg-cards/model/magic/search/manifest';
import * as basicModel from '@tcg-cards/model/magic/schema/basic';

import { Card, CardPart, CardPartLocalization, CardLocalization } from '@tcg-cards/db/schema/shared/magic/card';
import { Print } from '@tcg-cards/db/schema/shared/magic/print';
import { SearchPublicationMetadata } from '@tcg-cards/db/schema/remote';
import { fingerprintSearchProjection } from '@tcg-cards/db/search-fingerprint';
import {
  SearchCard,
  SearchCardPart,
  SearchCardPartLocalization,
} from '@tcg-cards/db/schema/shared/magic/search';
import { LOCAL_SEARCH_SCHEMA_VERSIONS } from '@tcg-cards/model/search/publication';
import type { ProjectDb } from './assemble';
import { deriveMagicNamePinyin } from './pinyin';

const pinyinBatchSize = 500;

/** Rebuild the local search projection from the completed Magic fact rows. */
export async function rebuildMagicSearchData(database: ProjectDb): Promise<void> {
  const locales = basicModel.locale.options;
  const supportedLocales = sql.join(
    locales.map(value => sql`${value}::magic.locale`),
    sql`, `,
  );

  await database.transaction(async tx => {
    await tx.execute(sql`
      WITH supported(locale) AS (
        SELECT unnest(ARRAY[${supportedLocales}]::magic.locale[])
      ),
      latest_prints AS (
        SELECT DISTINCT ON (p.card_id, p.version, p.lang)
          p.card_id,
          p.version,
          p.lang,
          p.set,
          p.number,
          p.source,
          p.release_date,
          p.layout,
          p.image_status,
          COALESCE(p.image_info -> 0 ->> 'type', 'webp') AS image_type
        FROM ${Print} p
        JOIN ${Card} c ON c.card_id = p.card_id AND c.version = p.version
        WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL
        ORDER BY
          p.card_id,
          p.version,
          p.lang,
          NULLIF(p.release_date, '') DESC NULLS LAST,
          p.set DESC,
          p.number DESC
      ),
      rarity_summaries AS (
        SELECT
          p.card_id,
          p.version,
          array_agg(DISTINCT p.rarity ORDER BY p.rarity) AS rarities
        FROM ${Print} p
        WHERE p.deleted_at IS NULL
        GROUP BY p.card_id, p.version
      ),
      other_prints AS (
        SELECT DISTINCT ON (p.card_id, p.version)
          p.card_id,
          p.version,
          p.set,
          p.number,
          p.lang,
          p.source,
          p.release_date,
          p.layout,
          p.image_status,
          p.image_type
        FROM latest_prints p
        WHERE p.lang <> 'en'
        ORDER BY
          p.card_id,
          p.version,
          NULLIF(p.release_date, '') DESC NULLS LAST,
          p.lang,
          p.set DESC,
          p.number DESC
      ),
      candidate_rows AS (
        SELECT
          c.card_id,
          c.version,
          supported.locale AS request_locale,
          COALESCE(requested.set, english.set, other.set) AS set,
          COALESCE(requested.number, english.number, other.number) AS number,
          COALESCE(requested.lang, english.lang, other.lang) AS lang,
          COALESCE(requested.source, english.source, other.source) AS source,
          COALESCE(requested.release_date, english.release_date, other.release_date) AS release_date,
          COALESCE(requested.layout, english.layout, other.layout) AS layout,
          COALESCE(requested.image_status, english.image_status, other.image_status) AS image_status,
          COALESCE(requested.image_type, english.image_type, other.image_type, 'webp') AS image_type
        FROM ${Card} c
        CROSS JOIN supported
        LEFT JOIN latest_prints requested
          ON requested.card_id = c.card_id
          AND requested.version = c.version
          AND requested.lang = supported.locale
        LEFT JOIN latest_prints english
          ON english.card_id = c.card_id
          AND english.version = c.version
          AND english.lang = 'en'
        LEFT JOIN other_prints other
          ON other.card_id = c.card_id
          AND other.version = c.version
          AND requested.card_id IS NULL
          AND english.card_id IS NULL
        WHERE c.deleted_at IS NULL
      ),
      candidate_maps AS (
        SELECT
          card_id,
          version,
          COALESCE(
            jsonb_object_agg(
              request_locale::text,
              jsonb_build_object(
                'set', set,
                'number', number,
                'lang', lang::text,
                'source', source,
                'releaseDate', release_date,
                'layout', layout,
                'imageType', image_type,
                'imageStatus', image_status
              )
            ) FILTER (WHERE set IS NOT NULL),
            '{}'::jsonb
          ) AS candidate_prints_by_locale
        FROM candidate_rows
        GROUP BY card_id, version
      )
      INSERT INTO ${SearchCard} (
        card_id, version, ambit, mana_value, color_identity, tags, rarities, legalities,
        candidate_prints_by_locale, updated_at, deleted_at
      )
      SELECT
        c.card_id,
        c.version,
        c.ambit,
        c.mana_value,
        c.color_identity,
        c.tags,
        COALESCE(rarity_summaries.rarities, ARRAY[]::text[]),
        c.legalities,
        candidate_maps.candidate_prints_by_locale,
        NOW(),
        NULL
      FROM ${Card} c
      JOIN candidate_maps USING (card_id, version)
      LEFT JOIN rarity_summaries USING (card_id, version)
      WHERE c.deleted_at IS NULL
      ON CONFLICT (card_id, version) DO UPDATE SET
        ambit = EXCLUDED.ambit,
        mana_value = EXCLUDED.mana_value,
        color_identity = EXCLUDED.color_identity,
        tags = EXCLUDED.tags,
        rarities = EXCLUDED.rarities,
        legalities = EXCLUDED.legalities,
        candidate_prints_by_locale = EXCLUDED.candidate_prints_by_locale,
        name_pinyin = ARRAY[]::text[],
        name_initials = ARRAY[]::text[],
        updated_at = NOW(),
        deleted_at = NULL`);

    const localizedNames = await tx.execute<{
      cardId:  string;
      version: string;
      locale:  'zhs' | 'zht';
      name:    string;
    }>(sql`
      SELECT
        l.card_id AS "cardId",
        l.version,
        l.locale::text AS locale,
        l.loc_name AS name
      FROM ${CardLocalization} l
      JOIN ${Card} c ON c.card_id = l.card_id AND c.version = l.version
      WHERE l.deleted_at IS NULL
        AND c.deleted_at IS NULL
        AND l.locale IN ('zhs'::magic.locale, 'zht'::magic.locale)
      ORDER BY l.card_id, l.version, l.locale, l.source`);

    const formsByCard = new Map<string, {
      cardId:       string;
      version:      string;
      namePinyin:   Set<string>;
      nameInitials: Set<string>;
    }>();

    for (const localizedName of localizedNames) {
      const key = JSON.stringify([localizedName.cardId, localizedName.version]);
      let forms = formsByCard.get(key);

      if (forms == null) {
        forms = {
          cardId:       localizedName.cardId,
          version:      localizedName.version,
          namePinyin:   new Set(),
          nameInitials: new Set(),
        };
        formsByCard.set(key, forms);
      }

      const derived = deriveMagicNamePinyin(localizedName.name, localizedName.locale);
      if (derived.full !== '') {
        forms.namePinyin.add(derived.full);
      }
      if (derived.initials !== '') {
        forms.nameInitials.add(derived.initials);
      }
    }

    await tx.execute(sql`
      UPDATE ${SearchCard}
      SET name_pinyin = ARRAY[]::text[],
          name_initials = ARRAY[]::text[]
      WHERE deleted_at IS NULL`);

    const pinyinRows = [...formsByCard.values()].map(forms => ({
      cardId:       forms.cardId,
      version:      forms.version,
      namePinyin:   [...forms.namePinyin].sort(),
      nameInitials: [...forms.nameInitials].sort(),
    }));

    for (let offset = 0; offset < pinyinRows.length; offset += pinyinBatchSize) {
      const batch = pinyinRows.slice(offset, offset + pinyinBatchSize);
      const values = sql.join(batch.map(row => sql`(
        ${row.cardId},
        ${row.version},
        ${JSON.stringify(row.namePinyin)}::jsonb,
        ${JSON.stringify(row.nameInitials)}::jsonb
      )`), sql`, `);

      await tx.execute(sql`
        UPDATE ${SearchCard} AS s
        SET name_pinyin = ARRAY(
              SELECT value
              FROM jsonb_array_elements_text(v.name_pinyin) AS pinyin(value)
            ),
            name_initials = ARRAY(
              SELECT value
              FROM jsonb_array_elements_text(v.name_initials) AS initials(value)
            ),
            updated_at = NOW()
        FROM (VALUES ${values}) AS v(card_id, version, name_pinyin, name_initials)
        WHERE s.card_id = v.card_id
          AND s.version = v.version
          AND s.deleted_at IS NULL`);
    }

    await tx.execute(sql`
      INSERT INTO ${SearchCardPart} (
        card_id, version, part_index, part_name, part_typeline, part_text,
        color, color_indicator, type_super, type_main, type_sub,
        power, toughness, loyalty, defense, hand_modifier, life_modifier,
        updated_at, deleted_at
      )
      SELECT
        p.card_id,
        p.version,
        p.part_index,
        p.part_name,
        p.part_typeline,
        p.part_text,
        p.color,
        p.color_indicator,
        p.type_super,
        p.type_main,
        p.type_sub,
        p.power,
        p.toughness,
        p.loyalty,
        p.defense,
        p.hand_modifier,
        p.life_modifier,
        NOW(),
        NULL
      FROM ${CardPart} p
      JOIN ${Card} c ON c.card_id = p.card_id AND c.version = p.version
      WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL
      ON CONFLICT (card_id, version, part_index) DO UPDATE SET
        part_name = EXCLUDED.part_name,
        part_typeline = EXCLUDED.part_typeline,
        part_text = EXCLUDED.part_text,
        color = EXCLUDED.color,
        color_indicator = EXCLUDED.color_indicator,
        type_super = EXCLUDED.type_super,
        type_main = EXCLUDED.type_main,
        type_sub = EXCLUDED.type_sub,
        power = EXCLUDED.power,
        toughness = EXCLUDED.toughness,
        loyalty = EXCLUDED.loyalty,
        defense = EXCLUDED.defense,
        hand_modifier = EXCLUDED.hand_modifier,
        life_modifier = EXCLUDED.life_modifier,
        updated_at = NOW(),
        deleted_at = NULL`);

    await tx.execute(sql`
      INSERT INTO ${SearchCardPartLocalization} (
        card_id, version, locale, source, part_index,
        part_loc_name, ruby_name, part_loc_typeline, part_loc_text, updated_at, deleted_at
      )
      SELECT
        pl.card_id,
        pl.version,
        pl.locale,
        pl.source,
        pl.part_index,
        pl.part_loc_name,
        pl.ruby_part_loc_name,
        pl.part_loc_typeline,
        pl.part_loc_text,
        NOW(),
        NULL
      FROM ${CardPartLocalization} pl
      JOIN ${CardPart} p
        ON p.card_id = pl.card_id
        AND p.version = pl.version
        AND p.part_index = pl.part_index
      JOIN ${CardLocalization} l
        ON l.card_id = pl.card_id
        AND l.version = pl.version
        AND l.locale = pl.locale
        AND l.source = pl.source
      JOIN ${Card} c ON c.card_id = pl.card_id AND c.version = pl.version
      WHERE pl.deleted_at IS NULL
        AND p.deleted_at IS NULL
        AND l.deleted_at IS NULL
        AND c.deleted_at IS NULL
      ON CONFLICT (card_id, version, locale, source, part_index) DO UPDATE SET
        part_loc_name = EXCLUDED.part_loc_name,
        ruby_name = EXCLUDED.ruby_name,
        part_loc_typeline = EXCLUDED.part_loc_typeline,
        part_loc_text = EXCLUDED.part_loc_text,
        updated_at = NOW(),
        deleted_at = NULL`);

    await tx.execute(sql`
      UPDATE ${SearchCard} s
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE s.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM ${Card} c
          WHERE c.card_id = s.card_id AND c.version = s.version AND c.deleted_at IS NULL
        )`);

    await tx.execute(sql`
      UPDATE ${SearchCardPart} s
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE s.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM ${CardPart} p
          JOIN ${Card} c ON c.card_id = p.card_id AND c.version = p.version
          WHERE p.card_id = s.card_id
            AND p.version = s.version
            AND p.part_index = s.part_index
            AND p.deleted_at IS NULL
            AND c.deleted_at IS NULL
        )`);

    await tx.execute(sql`
      UPDATE ${SearchCardPartLocalization} s
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE s.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM ${CardPartLocalization} pl
          JOIN ${CardPart} p
            ON p.card_id = pl.card_id
            AND p.version = pl.version
            AND p.part_index = pl.part_index
          JOIN ${CardLocalization} l
            ON l.card_id = pl.card_id
            AND l.version = pl.version
            AND l.locale = pl.locale
            AND l.source = pl.source
          JOIN ${Card} c ON c.card_id = pl.card_id AND c.version = pl.version
          WHERE pl.card_id = s.card_id
            AND pl.version = s.version
            AND pl.locale = s.locale
            AND pl.source = s.source
            AND pl.part_index = s.part_index
            AND pl.deleted_at IS NULL
            AND p.deleted_at IS NULL
            AND l.deleted_at IS NULL
            AND c.deleted_at IS NULL
        )`);

    const cards = await tx.select().from(SearchCard).where(isNull(SearchCard.deletedAt))
      .orderBy(SearchCard.cardId, SearchCard.version);
    const parts = await tx.select().from(SearchCardPart).where(isNull(SearchCardPart.deletedAt))
      .orderBy(SearchCardPart.cardId, SearchCardPart.version, SearchCardPart.partIndex);
    const localizations = await tx.select().from(SearchCardPartLocalization)
      .where(isNull(SearchCardPartLocalization.deletedAt))
      .orderBy(
        SearchCardPartLocalization.cardId,
        SearchCardPartLocalization.version,
        SearchCardPartLocalization.partIndex,
        SearchCardPartLocalization.locale,
        SearchCardPartLocalization.source,
      );
    const pgFingerprint = fingerprintSearchProjection([
      ['cards', cards],
      ['parts', parts],
      ['localizations', localizations],
    ]);
    const planner = await buildMagicSearchManifest(tx as unknown as ProjectDb, pgFingerprint);
    await tx.insert(SearchPublicationMetadata).values({
      game:            'magic',
      dataVersion:     pgFingerprint,
      pgFingerprint,
      releaseHash:     null,
      schemaVersion:   LOCAL_SEARCH_SCHEMA_VERSIONS.magic,
      ready:           true,
      plannerMetadata: {
        typeSymbols: planner.typeSymbols,
        tagOwners:   planner.tagOwners,
      },
    }).onConflictDoUpdate({
      target: SearchPublicationMetadata.game,
      set:    {
        dataVersion:     pgFingerprint,
        pgFingerprint,
        releaseHash:     null,
        schemaVersion:   LOCAL_SEARCH_SCHEMA_VERSIONS.magic,
        ready:           true,
        plannerMetadata: {
          typeSymbols: planner.typeSymbols,
          tagOwners:   planner.tagOwners,
        },
        updatedAt: new Date(),
      },
    });
  });
}

/** Builds routing metadata from the same facts as the active Magic projection. */
export async function buildMagicSearchManifest(
  database: ProjectDb,
  dataVersion: string,
): Promise<MagicSearchManifest> {
  const typeRows = await database.execute<{ symbol: string }>(sql`
    SELECT DISTINCT symbol
    FROM ${CardPart} p
    JOIN ${Card} c ON c.card_id = p.card_id AND c.version = p.version
    CROSS JOIN LATERAL unnest(
      COALESCE(p.type_super, ARRAY[]::text[]) ||
      p.type_main ||
      COALESCE(p.type_sub, ARRAY[]::text[])
    ) AS types(symbol)
    WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL
    ORDER BY symbol`);

  const tagRows = await database.execute<{ tag: string, has_card: boolean, has_print: boolean }>(sql`
    WITH tag_sources AS (
      SELECT unnest(c.tags) AS tag, TRUE AS is_card, FALSE AS is_print
      FROM ${Card} c
      WHERE c.deleted_at IS NULL
      UNION ALL
      SELECT unnest(p.print_tags) AS tag, FALSE AS is_card, TRUE AS is_print
      FROM ${Print} p
      JOIN ${Card} c ON c.card_id = p.card_id AND c.version = p.version
      WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL
    )
    SELECT tag, bool_or(is_card) AS has_card, bool_or(is_print) AS has_print
    FROM tag_sources
    GROUP BY tag
    ORDER BY tag`);

  const tagOwners: MagicSearchManifest['tagOwners'] = {};
  for (const row of tagRows) {
    tagOwners[row.tag] = row.has_card && row.has_print
      ? 'overlap'
      : row.has_card
        ? 'card-only'
        : 'print-only';
  }

  return {
    dataVersion,
    typeSymbols: typeRows.map(row => row.symbol),
    tagOwners,
  };
}
