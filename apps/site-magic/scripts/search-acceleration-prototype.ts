import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import postgres from 'postgres';

const WARMUPS = Number(process.env.SEARCH_ACCEL_WARMUPS ?? 2);
const SAMPLES = Number(process.env.SEARCH_ACCEL_SAMPLES ?? 20);
const PAGE_SIZE = 20;
const OUTPUT_ROOT = resolve(import.meta.dirname, '../../../.scratch/search-acceleration/benchmark-artifacts');

const locales = [
  'en', 'zhs', 'zht', 'de', 'fr', 'it', 'ja', 'ko', 'pt', 'ru', 'es',
  'ph', 'he', 'ar', 'sa', 'grc', 'la', 'qya', 'dw',
] as const;

type Layout = 'card-json' | 'localized-row-json';
type Phase = 'primary-key-only' | 'candidate-indexes';
type SearchRow = {
  total: string;
  page:  unknown;
};
type BenchmarkCase = {
  id:    string;
  where: string;
};

const cases: BenchmarkCase[] = [
  { id: 'part-name', where: `(p.part_name ILIKE '%Black Lotus%' OR l.part_loc_name ILIKE '%Black Lotus%')` },
  { id: 'oracle-text', where: `(p.part_text ILIKE '%draw a card%' OR l.part_loc_text ILIKE '%draw a card%')` },
  { id: 'type-symbol', where: `p.type_main @> ARRAY['creature']::text[]` },
  { id: 'card-only-tag', where: `c.tags @> ARRAY['dev:token']::text[]` },
  { id: 'mana-value', where: `c.mana_value = 1` },
  { id: 'commander-legality', where: `(c.legalities ->> 'commander') IN ('legal', 'restricted')` },
];

const tableNames = [
  'search_accel_latest_prints',
  'search_accel_candidates',
  'search_accel_candidate_maps',
  'search_accel_cards_card_json',
  'search_accel_cards_localized_row_json',
  'search_accel_parts',
  'search_accel_localizations_card_json',
  'search_accel_localizations_localized_row_json',
] as const;

/** Keeps benchmark JSON stable and serializable. */
function serialize(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => typeof item === 'bigint' ? item.toString() : item);
}

/** Returns median and exploratory p95 for one fixed sample set. */
function summarize(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? 0;

  return {
    samples: sorted.length,
    p50Ms:   percentile(0.5),
    p95Ms:   percentile(0.95),
    minMs:   sorted[0] ?? 0,
    maxMs:   sorted.at(-1) ?? 0,
  };
}

/** Builds the one-query filter/count/page operation for one candidate layout. */
function searchSql(layout: Layout, benchmarkCase: BenchmarkCase, requestLocale: string) {
  const candidate = layout === 'card-json'
    ? `(c.candidate_by_locale -> l.locale::text)`
    : `(l.candidate_by_locale -> l.locale::text)`;

  const cards = layout === 'card-json'
    ? 'search_accel_cards_card_json'
    : 'search_accel_cards_localized_row_json';
  const localizations = layout === 'card-json'
    ? 'search_accel_localizations_card_json'
    : 'search_accel_localizations_localized_row_json';

  return `
    WITH filtered AS MATERIALIZED (
      SELECT DISTINCT ON (c.card_id, c.version)
        c.card_id,
        c.version,
        p.part_index,
        ${candidate} ->> 'set' AS candidate_set,
        ${candidate} ->> 'number' AS candidate_number,
        ${candidate} ->> 'lang' AS candidate_lang,
        ${candidate} ->> 'source' AS candidate_source
      FROM ${cards} c
      JOIN search_accel_parts p
        ON p.card_id = c.card_id AND p.version = c.version
      JOIN ${localizations} l
        ON l.card_id = p.card_id
        AND l.version = p.version
        AND l.part_index = p.part_index
      WHERE ${benchmarkCase.where}
      ORDER BY
        c.card_id,
        c.version,
        p.part_index,
        CASE
          WHEN ${candidate} ->> 'lang' = '${requestLocale}' THEN 0
          WHEN ${candidate} ->> 'lang' = 'en' THEN 1
          ELSE 2
        END
    ),
    total AS (
      SELECT count(*)::bigint AS count FROM filtered
    ),
    page AS (
      SELECT * FROM filtered ORDER BY card_id, version LIMIT ${PAGE_SIZE}
    )
    SELECT
      total.count::text AS total,
      COALESCE(
        jsonb_agg(jsonb_build_array(
          page.card_id,
          page.version,
          page.candidate_set,
          page.candidate_number,
          page.candidate_lang,
          page.candidate_source
        ) ORDER BY page.card_id, page.version)
          FILTER (WHERE page.card_id IS NOT NULL),
        '[]'::jsonb
      ) AS page
    FROM total LEFT JOIN page ON true
    GROUP BY total.count`;
}

/** Captures the table and index bytes for the temporary experiment tables. */
async function readTableSizes(tx: postgres.TransactionSql) {
  return tx.unsafe(`
    SELECT
      c.relname AS table_name,
      pg_relation_size(c.oid)::bigint AS table_bytes,
      pg_indexes_size(c.oid)::bigint AS index_bytes,
      pg_total_relation_size(c.oid)::bigint AS total_bytes
    FROM pg_class c
    WHERE c.relnamespace = pg_my_temp_schema()
      AND c.relkind = 'r'
      AND c.relname = ANY($1::text[])
    ORDER BY c.relname`, [tableNames]) as Promise<Array<Record<string, unknown>>>;
}

/** Returns the JSON plan as a parsed value without timing it as a sample. */
async function explain(tx: postgres.TransactionSql, query: string) {
  const rows = await tx.unsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`);
  return rows[0]?.['QUERY PLAN'] ?? rows[0]?.['query plan'] ?? rows[0];
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl == null) throw new Error('DATABASE_URL is missing; run through the site-magic scripts/.env configuration.');
  if (!Number.isInteger(WARMUPS) || WARMUPS < 0 || !Number.isInteger(SAMPLES) || SAMPLES < 1) {
    throw new Error('SEARCH_ACCEL_WARMUPS and SEARCH_ACCEL_SAMPLES must be non-negative/positive integers.');
  }

  const client = postgres(databaseUrl, { max: 1, application_name: 'search-acceleration-candidate-prototype' });

  try {
    const report = await client.begin(async tx => {
      const database = await tx.unsafe(`
        SELECT
          current_database() AS database,
          current_setting('server_version') AS server_version,
          (SELECT count(*) FROM magic.cards WHERE deleted_at IS NULL)::bigint AS cards,
          (SELECT count(*) FROM magic.card_parts WHERE deleted_at IS NULL)::bigint AS parts,
          (SELECT count(*) FROM magic.card_part_localizations WHERE deleted_at IS NULL)::bigint AS localized_parts,
          (SELECT count(*) FROM magic.prints WHERE deleted_at IS NULL)::bigint AS prints`);

      await tx.unsafe(`
        CREATE TEMP TABLE search_accel_latest_prints ON COMMIT DROP AS
        SELECT DISTINCT ON (card_id, version, lang)
          card_id, version, lang, set, number, source, release_date
        FROM magic.prints
        WHERE deleted_at IS NULL
        ORDER BY
          card_id, version, lang,
          NULLIF(release_date, '') DESC NULLS LAST,
          set DESC,
          number DESC`);
      await tx.unsafe('ALTER TABLE search_accel_latest_prints ADD PRIMARY KEY (card_id, version, lang)');

      await tx.unsafe(`
        CREATE TEMP TABLE search_accel_candidates ON COMMIT DROP AS
        WITH supported(locale) AS (
          SELECT unnest(ARRAY[${locales.map(locale => `'${locale}'::magic.locale`).join(', ')}])
        )
        SELECT
          c.card_id,
          c.version,
          supported.locale AS request_locale,
          COALESCE(requested.set, english.set, other.set) AS set,
          COALESCE(requested.number, english.number, other.number) AS number,
          COALESCE(requested.lang, english.lang, other.lang) AS lang,
          COALESCE(requested.source, english.source, other.source) AS source,
          COALESCE(requested.release_date, english.release_date, other.release_date) AS release_date
        FROM magic.cards c
        CROSS JOIN supported
        LEFT JOIN search_accel_latest_prints requested
          ON requested.card_id = c.card_id
          AND requested.version = c.version
          AND requested.lang = supported.locale
        LEFT JOIN search_accel_latest_prints english
          ON english.card_id = c.card_id
          AND english.version = c.version
          AND english.lang = 'en'
        LEFT JOIN LATERAL (
          SELECT other_print.*
          FROM search_accel_latest_prints other_print
          WHERE other_print.card_id = c.card_id
            AND other_print.version = c.version
            AND other_print.lang <> supported.locale
            AND other_print.lang <> 'en'
          ORDER BY
            NULLIF(other_print.release_date, '') DESC NULLS LAST,
            other_print.lang,
            other_print.set DESC,
            other_print.number DESC
          LIMIT 1
        ) other ON requested.card_id IS NULL AND english.card_id IS NULL
        WHERE c.deleted_at IS NULL`);

      await tx.unsafe(`
        CREATE TEMP TABLE search_accel_candidate_maps ON COMMIT DROP AS
        SELECT
          card_id,
          version,
          jsonb_object_agg(
            request_locale::text,
            jsonb_build_object(
              'set', set,
              'number', number,
              'lang', lang::text,
              'source', source,
              'releaseDate', release_date
            ) ORDER BY request_locale
          ) AS candidate_by_locale
        FROM search_accel_candidates
        GROUP BY card_id, version`);
      await tx.unsafe('ALTER TABLE search_accel_candidate_maps ADD PRIMARY KEY (card_id, version)');

      await tx.unsafe(`
        CREATE TEMP TABLE search_accel_cards_card_json ON COMMIT DROP AS
        SELECT
          c.card_id, c.version, c.ambit, c.typeline, c.mana_value,
          c.color_identity, c.tags, c.legalities,
          m.candidate_by_locale
        FROM magic.cards c
        JOIN search_accel_candidate_maps m USING (card_id, version)
        WHERE c.deleted_at IS NULL`);
      await tx.unsafe('ALTER TABLE search_accel_cards_card_json ADD PRIMARY KEY (card_id, version)');

      await tx.unsafe(`
        CREATE TEMP TABLE search_accel_cards_localized_row_json ON COMMIT DROP AS
        SELECT
          c.card_id, c.version, c.ambit, c.typeline, c.mana_value,
          c.color_identity, c.tags, c.legalities
        FROM magic.cards c
        WHERE c.deleted_at IS NULL`);
      await tx.unsafe('ALTER TABLE search_accel_cards_localized_row_json ADD PRIMARY KEY (card_id, version)');

      await tx.unsafe(`
        CREATE TEMP TABLE search_accel_parts ON COMMIT DROP AS
        SELECT
          card_id, version, part_index, part_name, part_typeline, part_text,
          part_mana_value, color, color_indicator, type_super, type_main, type_sub,
          power, toughness, loyalty, defense, hand_modifier, life_modifier
        FROM magic.card_parts
        WHERE deleted_at IS NULL`);
      await tx.unsafe('ALTER TABLE search_accel_parts ADD PRIMARY KEY (card_id, version, part_index)');

      await tx.unsafe(`
        CREATE TEMP TABLE search_accel_localizations_card_json ON COMMIT DROP AS
        SELECT
          l.card_id, l.version, l.locale, l.source, l.part_index,
          l.part_loc_name, l.part_loc_typeline, l.part_loc_text
        FROM magic.card_part_localizations l
        WHERE l.deleted_at IS NULL`);
      await tx.unsafe('ALTER TABLE search_accel_localizations_card_json ADD PRIMARY KEY (card_id, version, locale, source, part_index)');

      await tx.unsafe(`
        CREATE TEMP TABLE search_accel_localizations_localized_row_json ON COMMIT DROP AS
        SELECT
          l.card_id, l.version, l.locale, l.source, l.part_index,
          l.part_loc_name, l.part_loc_typeline, l.part_loc_text,
          m.candidate_by_locale
        FROM magic.card_part_localizations l
        JOIN search_accel_candidate_maps m USING (card_id, version)
        WHERE l.deleted_at IS NULL`);
      await tx.unsafe('ALTER TABLE search_accel_localizations_localized_row_json ADD PRIMARY KEY (card_id, version, locale, source, part_index)');

      for (const table of tableNames) {
        await tx.unsafe(`ANALYZE ${table}`);
      }

      const sizeBeforeIndexes = await readTableSizes(tx);
      const rowBytes = await tx.unsafe(`
        SELECT
          (SELECT coalesce(sum(pg_column_size(candidate_by_locale)), 0)::bigint FROM search_accel_cards_card_json) AS card_map_bytes,
          (SELECT coalesce(sum(pg_column_size(candidate_by_locale)), 0)::bigint FROM search_accel_localizations_localized_row_json) AS duplicated_map_bytes,
          (SELECT count(*)::bigint FROM search_accel_candidates) AS candidate_rows,
          (SELECT count(*)::bigint FROM search_accel_localizations_localized_row_json) AS repeated_rows`);

      const layouts: Layout[] = ['card-json', 'localized-row-json'];
      const phases: Phase[] = ['primary-key-only', 'candidate-indexes'];
      const results = new Map<string, { signature: string, samples: number[] }>();
      const plans: Record<string, unknown> = {};
      const timingRecords: Array<{ phase: Phase, caseId: string, layout: Layout, iteration: number, ms: number }> = [];

      async function execute(phase: Phase, benchmarkCase: BenchmarkCase, layout: Layout, iteration: number, record: boolean) {
        const query = searchSql(layout, benchmarkCase, 'zhs');
        const startedAt = performance.now();
        const row = (await tx.unsafe(query))[0] as SearchRow;
        const ms = performance.now() - startedAt;
        const key = `${phase}:${benchmarkCase.id}:${layout}`;
        const signature = serialize({ total: row?.total ?? '0', page: row?.page ?? [] });

        if (record) {
          const existing = results.get(key);
          if (existing == null) results.set(key, { signature, samples: [ms] });
          else {
            if (existing.signature !== signature) throw new Error(`${key} changed results between samples.`);
            existing.samples.push(ms);
          }
          timingRecords.push({ phase, caseId: benchmarkCase.id, layout, iteration, ms });
        } else {
          return { signature, ms };
        }
      }

      for (const benchmarkCase of cases) {
        const a = await execute('primary-key-only', benchmarkCase, 'card-json', 0, false) as { signature: string };
        const b = await execute('primary-key-only', benchmarkCase, 'localized-row-json', 0, false) as { signature: string };
        if (a.signature !== b.signature) throw new Error(`Candidate layouts disagree for ${benchmarkCase.id}.`);
      }

      for (const phase of phases) {
        if (phase === 'candidate-indexes') {
          await tx.unsafe('CREATE INDEX search_accel_cards_mana_value_idx ON search_accel_cards_card_json (mana_value)');
          await tx.unsafe('CREATE INDEX search_accel_cards_mana_value_dup_idx ON search_accel_cards_localized_row_json (mana_value)');
          await tx.unsafe('CREATE INDEX search_accel_cards_tags_gin ON search_accel_cards_card_json USING gin (tags)');
          await tx.unsafe('CREATE INDEX search_accel_cards_tags_dup_gin ON search_accel_cards_localized_row_json USING gin (tags)');
          await tx.unsafe('CREATE INDEX search_accel_parts_type_main_gin ON search_accel_parts USING gin (type_main)');
          await tx.unsafe('CREATE INDEX search_accel_cards_commander_legal_idx ON search_accel_cards_card_json ((legalities ->> \'commander\'))');
          await tx.unsafe('CREATE INDEX search_accel_cards_commander_legal_dup_idx ON search_accel_cards_localized_row_json ((legalities ->> \'commander\'))');
          for (const table of tableNames) await tx.unsafe(`ANALYZE ${table}`);
        }

        // Alternate layouts in a stable order so one variant does not always get the warmer cache.
        for (let iteration = 0; iteration < WARMUPS; iteration++) {
          for (const benchmarkCase of cases) {
            const order = iteration % 2 === 0 ? layouts : [...layouts].reverse();
            for (const layout of order) await execute(phase, benchmarkCase, layout, -iteration - 1, false);
          }
        }

        for (let iteration = 0; iteration < SAMPLES; iteration++) {
          for (const benchmarkCase of cases) {
            const order = iteration % 2 === 0 ? layouts : [...layouts].reverse();
            for (const layout of order) await execute(phase, benchmarkCase, layout, iteration, true);
          }
        }

        for (const benchmarkCase of cases) {
          for (const layout of layouts) {
            const key = `${phase}:${benchmarkCase.id}:${layout}`;
            plans[key] = await explain(tx, searchSql(layout, benchmarkCase, 'zhs'));
          }
        }
      }

      const summaries = [...results.entries()].map(([key, value]) => {
        const [phase, caseId, layout] = key.split(':') as [Phase, string, Layout];
        return { phase, caseId, layout, result: summarize(value.samples), signature: value.signature };
      });
      const sizeAfterIndexes = await readTableSizes(tx);

      return {
        createdAt:   new Date().toISOString(),
        protocol:    { warmups: WARMUPS, samples: SAMPLES, concurrency: 1, pageSize: PAGE_SIZE, requestLocale: 'zhs' },
        environment: database[0],
        source:      {
          rows:               rowBytes[0],
          candidateSelection: 'per supported locale: requested language, then English, then the latest print in any other language; within language: release date descending, set and number descending',
          limitations:        [
            'Cost is omitted until its approved unordered search encoding is designed.',
            'pg_trgm is not installed; substring name/text indexes are therefore not part of this experiment.',
            'The candidate index set is temporary evidence only and is not a production index decision.',
          ],
        },
        candidateLayouts: {
          'card-json':          'candidate locale map stored once on each (cardId, version) row',
          'localized-row-json': 'the same candidate locale map repeated on each (cardId, version, locale, source, partIndex) row',
        },
        sizes:         { primaryKeyOnly: sizeBeforeIndexes, candidateIndexes: sizeAfterIndexes },
        timings:       summaries,
        timingSamples: timingRecords,
        plans,
      };
    });

    await mkdir(OUTPUT_ROOT, { recursive: true });
    const outputPath = resolve(OUTPUT_ROOT, `candidate-layout-prototype-${new Date().toISOString().replaceAll(':', '-')}.json`);
    await writeFile(outputPath, `${serialize(report)}\n`, 'utf8');
    console.log(JSON.stringify({ outputPath, environment: report.environment, sizes: report.sizes, timings: report.timings }));
  } finally {
    await client.end({ timeout: 5 });
  }
}

await main();
