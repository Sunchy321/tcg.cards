import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { runWithDb } from '@tcg-cards/db/db';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { search } from '../server/search/index.ts';
import { setMagicSearchManifest } from '../server/search/accelerated-adapter';

const WARMUPS = 2;
const SAMPLES = 20;
const PAGE_SIZE = 20;
const SEED = 0x5eed;
const OUTPUT_ROOT = resolve(import.meta.dirname, '../../../.scratch/search-acceleration/benchmark-artifacts');
const rollbackSignal = new Error('rollback T07 temporary text index probe');

type Fixture = {
  cardId:    string;
  version:   string;
  partIndex: number;
  locale:    string;
  source:    string;
};

type TextCase = {
  id:                  string;
  dsl:                 string;
  lang:                'en' | 'zhs';
  expectedFixtureIds?: string[];
  compareLiveAction?:  boolean;
};

type CapturedQuery = {
  caseId: string;
  sql:    string;
  params: unknown[];
};

type PgSession = {
  unsafe: (query: string, params?: unknown[]) => Promise<any[]>;
};

/** Serializes PostgreSQL values that JSON does not handle by default. */
function serialize(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === 'bigint') return item.toString();
    if (item instanceof Date) return item.toISOString();
    return item;
  });
}

/** Produces a deterministic random sequence for interleaving query variants. */
function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Computes the interpolated latency percentile for one query case. */
function percentile(values: number[], probability: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

/** Summarizes SQL client round-trip samples without treating them as API latency. */
function summarize(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    samples: values.length,
    p50Ms:   percentile(sorted, 0.5),
    p95Ms:   percentile(sorted, 0.95),
    minMs:   sorted[0] ?? null,
    maxMs:   sorted.at(-1) ?? null,
  };
}

/** Validates the search result returned by the in-process essential action. */
function actionResult(response: any, caseId: string) {
  if (response.errors?.length || response.result == null || !Array.isArray(response.result.result)) {
    throw new Error(`${caseId} failed in the current Magic PG search path: ${serialize(response.errors)}`);
  }
  return response.result;
}

/** Converts accelerated rows into the stable card/version/part identity. */
function actionIdentity(result: any): string[] {
  return result.result.map((row: any) => `${row.cardId}/${row.version}/${row.partIndex}`);
}

/** Extracts card identities from the accelerated SQL's JSON candidate payload. */
function queryIdentity(rows: any[]): { total: number, page: number, totalPage: number, identities: string[] } {
  const row = rows[0];
  const candidates = (row?.candidates ?? []) as Array<Record<string, unknown>>;
  const total = Number(row?.total ?? 0);
  return {
    total,
    page:       1,
    totalPage:  Math.ceil(total / PAGE_SIZE),
    identities: candidates.map(candidate => `${candidate.cardId}/${candidate.version}/${candidate.partIndex}`),
  };
}

/** Builds the fixed text edge cases over four real card identities in temporary copies. */
function makeCases(fixtures: Fixture[]): TextCase[] {
  const id = (index: number) => `${fixtures[index]!.cardId}/${fixtures[index]!.version}/${fixtures[index]!.partIndex}`;
  return [
    { id: 'body-contains-real', dsl: 'o:"draw a card"', lang: 'en', compareLiveAction: true },
    { id: 'body-short-real', dsl: 'o:of', lang: 'en', compareLiveAction: true },
    { id: 'body-short-fixture', dsl: 'x:T07', lang: 'en', expectedFixtureIds: [id(0), id(1), id(3)] },
    { id: 'body-exact-fixture', dsl: 'x="T10ExactBody"', lang: 'en', expectedFixtureIds: [id(2)] },
    { id: 'body-percent-literal', dsl: 'x:"T07%"', lang: 'en', expectedFixtureIds: [id(0)] },
    { id: 'body-underscore-literal', dsl: 'x:"T08_"', lang: 'en', expectedFixtureIds: [id(1)] },
    { id: 'body-newline', dsl: `x:"T07Alpha\nBeta"`, lang: 'en', expectedFixtureIds: [id(0)] },
    { id: 'localized-unicode', dsl: 'lx:T09中文测试', lang: 'zhs', expectedFixtureIds: [id(0)] },
    { id: 'body-cross-field-boundary', dsl: 'x:"T07BoundaryToken"', lang: 'zhs', expectedFixtureIds: [] },
  ];
}

/** Rewrites only the two approved body relations to one transaction-local copy. */
function rewriteQuery(query: CapturedQuery, variant: 'baseline' | 'trgm'): string {
  const replacements = [
    ['"magic"."search_card_parts"', `pg_temp."t07_magic_${variant}_parts"`],
    ['"magic"."search_card_part_localizations"', `pg_temp."t07_magic_${variant}_localizations"`],
  ] as const;
  let rewritten = query.sql;
  for (const [source, target] of replacements) {
    rewritten = rewritten.replaceAll(source, target);
  }
  if (!rewritten.includes(`pg_temp."t07_magic_${variant}_parts"`)
    && !rewritten.includes(`pg_temp."t07_magic_${variant}_localizations"`)) {
    throw new Error(`${query.caseId} did not reference a rewritable Magic body table.`);
  }
  return rewritten;
}

/** Captures the exact current adapter statement generated for a public DSL query. */
async function captureActionQuery(
  session: PgSession,
  textCase: TextCase,
  observations: CapturedQuery[],
): Promise<{ result: any, query: CapturedQuery }> {
  let activeCaseId: string | null = textCase.id;
  const database = drizzle({
    client: session as any,
    logger: {
      logQuery(query: string, params: unknown[]) {
        if (activeCaseId != null) observations.push({ caseId: activeCaseId, sql: query, params: [...params] });
      },
    },
  });

  setMagicSearchManifest(null);
  const response = await runWithDb(database, () => search.search('essential', textCase.dsl, {
    page:     1,
    pageSize: PAGE_SIZE,
    lang:     textCase.lang,
    groupBy:  'card',
    orderBy:  'id+',
    dsl:      textCase.dsl,
  }));
  activeCaseId = null;

  const result = actionResult(response, textCase.id);
  const query = observations.findLast(observation => observation.caseId === textCase.id
    && observation.sql.toLowerCase().includes('ilike')
    && (observation.sql.includes('search_card_parts') || observation.sql.includes('search_card_part_localizations')));
  if (query == null) throw new Error(`${textCase.id} did not compile a PG body query.`);
  return { result, query };
}

/** Copies one real search relation, including its primary-key indexes, into pg_temp. */
async function copyRelation(session: PgSession, schema: string, table: string, suffix: string): Promise<string> {
  const tempName = `t07_magic_${suffix}_${table === 'search_card_parts' ? 'parts' : 'localizations'}`;
  await session.unsafe(`CREATE TEMP TABLE "${tempName}" (LIKE "${schema}"."${table}" INCLUDING ALL) ON COMMIT DROP`);
  await session.unsafe(`INSERT INTO pg_temp."${tempName}" SELECT * FROM "${schema}"."${table}"`);
  return tempName;
}

/** Creates two transaction-local copies with matching Magic fixture content. */
async function createCopies(session: PgSession) {
  const copies = {
    baseline: {
      parts:         await copyRelation(session, 'magic', 'search_card_parts', 'baseline'),
      localizations: await copyRelation(session, 'magic', 'search_card_part_localizations', 'baseline'),
    },
    trgm: {
      parts:         await copyRelation(session, 'magic', 'search_card_parts', 'trgm'),
      localizations: await copyRelation(session, 'magic', 'search_card_part_localizations', 'trgm'),
    },
  };
  return copies;
}

/** Selects four usable cards that have both English and Simplified Chinese candidates. */
async function selectFixtures(session: PgSession): Promise<Fixture[]> {
  const rows = await session.unsafe(`
    SELECT DISTINCT ON (p.card_id, p.version)
      p.card_id AS "cardId", p.version, p.part_index AS "partIndex",
      pl.locale, pl.source
    FROM magic.search_cards c
    JOIN magic.search_card_parts p
      ON p.card_id = c.card_id AND p.version = c.version AND p.deleted_at IS NULL
    JOIN magic.search_card_part_localizations pl
      ON pl.card_id = p.card_id AND pl.version = p.version
      AND pl.part_index = p.part_index AND pl.locale = 'zhs' AND pl.deleted_at IS NULL
    WHERE c.deleted_at IS NULL
      AND c.candidate_prints_by_locale ? 'en'
      AND c.candidate_prints_by_locale ? 'zhs'
    ORDER BY p.card_id, p.version, p.part_index, pl.source
    LIMIT 4`);
  if (rows.length !== 4) throw new Error(`Expected four Magic text fixtures, found ${rows.length}.`);
  return rows as Fixture[];
}

/** Seeds deterministic edge-case bodies without changing committed search data. */
async function seedFixtures(session: PgSession, copies: Awaited<ReturnType<typeof createCopies>>, fixtures: Fixture[]): Promise<void> {
  const values = [
    { partText: 'T07Alpha\nBeta T07%literal T08X T07', localizedText: 'T09中文测试' },
    { partText: 'T07Xliteral T08_literal T07', localizedText: 'T07LocalizedRight' },
    { partText: 'T10ExactBody', localizedText: 'T10ExactLocalized' },
    { partText: 'T07Boundary', localizedText: 'Token' },
  ];
  for (const variant of ['baseline', 'trgm'] as const) {
    for (const [index, fixture] of fixtures.entries()) {
      const body = values[index]!;
      await session.unsafe(`
        UPDATE pg_temp."${copies[variant].parts}"
        SET part_text = $1
        WHERE card_id = $2 AND version = $3 AND part_index = $4`,
      [body.partText, fixture.cardId, fixture.version, fixture.partIndex]);
      await session.unsafe(`
        UPDATE pg_temp."${copies[variant].localizations}"
        SET part_loc_text = $1
        WHERE card_id = $2 AND version = $3 AND part_index = $4
          AND locale = $5 AND source = $6`,
      [body.localizedText, fixture.cardId, fixture.version, fixture.partIndex, fixture.locale, fixture.source]);
    }
  }
}

/** Replays one captured statement against the unindexed or trigram relation copies. */
async function queryVariant(session: PgSession, query: CapturedQuery, variant: 'baseline' | 'trgm') {
  return session.unsafe(rewriteQuery(query, variant), query.params);
}

/** Measures a reversible text-column UPDATE on one copy using a savepoint. */
async function measureUpdate(session: PgSession, tableName: string, column: string): Promise<{ durationMs: number, rows: number }> {
  await session.unsafe('SAVEPOINT t07_update_sample');
  const startedAt = performance.now();
  const result = await session.unsafe(`
    WITH picked AS (
      SELECT ctid FROM pg_temp."${tableName}"
      WHERE deleted_at IS NULL
      ORDER BY card_id, version, part_index
      LIMIT 1000
    )
    UPDATE pg_temp."${tableName}" AS target
    SET "${column}" = target."${column}" || ' '
    FROM picked WHERE target.ctid = picked.ctid`);
  const durationMs = performance.now() - startedAt;
  await session.unsafe('ROLLBACK TO SAVEPOINT t07_update_sample');
  await session.unsafe('RELEASE SAVEPOINT t07_update_sample');
  return { durationMs, rows: Number(result.count ?? 0) };
}

/** Runs the no-index and GIN variants in a fixed-seed interleaved schedule. */
async function sampleCases(
  session: PgSession,
  cases: TextCase[],
  queries: Map<string, CapturedQuery>,
  expectedByCase: Map<string, { total: number, page: number, totalPage: number, identities: string[] }>,
) {
  const random = seededRandom(SEED);
  const samples: Array<{ caseId: string, variant: 'baseline' | 'trgm', iteration: number, durationMs: number }> = [];
  const preflight: Array<{ caseId: string, total: number, identities: string[] }> = [];

  for (const textCase of cases) {
    const query = queries.get(textCase.id)!;
    const baseline = await queryVariant(session, query, 'baseline');
    const trgm = await queryVariant(session, query, 'trgm');
    if (serialize(baseline) !== serialize(trgm)) {
      throw new Error(`${textCase.id}: the GIN result differs from the no-index result.`);
    }
    const identity = queryIdentity(baseline);
    const expected = expectedByCase.get(textCase.id);
    if (expected != null && serialize(identity) !== serialize(expected)) {
      throw new Error(`${textCase.id}: expected ${serialize(expected)}, received ${serialize(identity)}.`);
    }
    preflight.push({ caseId: textCase.id, total: identity.total, identities: identity.identities });
  }

  for (let iteration = -WARMUPS; iteration < SAMPLES; iteration++) {
    const order = [...cases];
    for (let index = order.length - 1; index > 0; index--) {
      const swap = Math.floor(random() * (index + 1));
      [order[index], order[swap]] = [order[swap]!, order[index]!];
    }
    for (const textCase of order) {
      const variants: Array<'baseline' | 'trgm'> = random() < 0.5 ? ['baseline', 'trgm'] : ['trgm', 'baseline'];
      const query = queries.get(textCase.id)!;
      for (const variant of variants) {
        const rewritten = rewriteQuery(query, variant);
        const startedAt = performance.now();
        const rows = await session.unsafe(rewritten, query.params);
        const durationMs = performance.now() - startedAt;
        const current = queryIdentity(rows);
        const expected = preflight.find(entry => entry.caseId === textCase.id)!;
        if (current.total !== expected.total || serialize(current.identities) !== serialize(expected.identities)) {
          throw new Error(`${textCase.id}:${variant}: sampled result identity changed during the run.`);
        }
        if (iteration >= 0) samples.push({ caseId: textCase.id, variant, iteration, durationMs });
      }
    }
  }

  return {
    preflight,
    samples,
    metrics: cases.flatMap(textCase => (['baseline', 'trgm'] as const).map(variant => ({
      caseId: textCase.id,
      variant,
      ...summarize(samples.filter(sample => sample.caseId === textCase.id && sample.variant === variant).map(sample => sample.durationMs)),
    }))),
  };
}

/** Executes the local Magic text index comparison and rolls all temporary DDL back. */
async function main(): Promise<void> {
  const configuredUrl = process.env.DATABASE_URL;
  if (configuredUrl == null) throw new Error('DATABASE_URL is missing; run through benchmark:search:text-index so scripts/.env is loaded.');
  const connection = new URL(configuredUrl);
  const host = connection.hostname === 'localhost' ? '127.0.0.1' : connection.hostname;
  const databaseName = decodeURIComponent(connection.pathname.slice(1));
  if (!['127.0.0.1', '::1'].includes(host) || databaseName !== 'local') {
    throw new Error('T07 text index probes are restricted to the local PostgreSQL database named local.');
  }
  connection.hostname = host;

  const client = postgres(connection.toString(), { max: 1, connect_timeout: 5, application_name: 'search-acceleration-t07-text-index-magic' });
  let report: Record<string, unknown> | null = null;
  let extensionOriginallyInstalled = false;
  const startedAt = new Date().toISOString();
  try {
    const fixtures = await selectFixtures(client as unknown as PgSession);
    const cases = makeCases(fixtures);
    const observations: CapturedQuery[] = [];
    const actionResults = new Map<string, any>();
    const queries = new Map<string, CapturedQuery>();
    for (const textCase of cases) {
      const captured = await captureActionQuery(client as unknown as PgSession, textCase, observations);
      actionResults.set(textCase.id, captured.result);
      queries.set(textCase.id, captured.query);
    }

    try {
      await client.begin(async transaction => {
        const session = transaction as unknown as PgSession;
        const extensionBefore = await session.unsafe('SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = $1) AS installed', ['pg_trgm']);
        extensionOriginallyInstalled = Boolean(extensionBefore[0]?.installed);

        const copies = await createCopies(session);
        const liveActionComparisons = [];
        for (const textCase of cases.filter(entry => entry.compareLiveAction)) {
          const action = actionResults.get(textCase.id)!;
          const expected = {
            total:      Number(action.total),
            page:       Number(action.page),
            totalPage:  Number(action.totalPage),
            identities: actionIdentity(action),
          };
          const baseline = queryIdentity(await queryVariant(session, queries.get(textCase.id)!, 'baseline'));
          if (baseline.total !== expected.total || serialize(baseline.identities) !== serialize(expected.identities)) {
            throw new Error(`${textCase.id}: unmodified no-index copy differs from the current accelerated action.`);
          }
          liveActionComparisons.push({ caseId: textCase.id, result: expected });
        }
        await seedFixtures(session, copies, fixtures);
        await session.unsafe('CREATE EXTENSION IF NOT EXISTS pg_trgm');

        const indexBuilds: Array<{ relation: string, index: string, buildMs: number, bytes: string }> = [];
        const indexTargets = [
          { relation: copies.trgm.parts, column: 'part_text', index: 't07_magic_parts_trgm_idx' },
          { relation: copies.trgm.localizations, column: 'part_loc_text', index: 't07_magic_localizations_trgm_idx' },
        ];
        for (const target of indexTargets) {
          const buildStartedAt = performance.now();
          await session.unsafe(`CREATE INDEX "${target.index}" ON pg_temp."${target.relation}" USING gin ("${target.column}" gin_trgm_ops)`);
          indexBuilds.push({
            relation: target.relation,
            index:    target.index,
            buildMs:  performance.now() - buildStartedAt,
            bytes:    String((await session.unsafe('SELECT pg_relation_size($1::regclass)::bigint AS bytes', [`pg_temp.${target.index}`]))[0]?.bytes ?? 0),
          });
        }
        await session.unsafe(`ANALYZE pg_temp."${copies.baseline.parts}"`);
        await session.unsafe(`ANALYZE pg_temp."${copies.baseline.localizations}"`);
        await session.unsafe(`ANALYZE pg_temp."${copies.trgm.parts}"`);
        await session.unsafe(`ANALYZE pg_temp."${copies.trgm.localizations}"`);

        const expectedByCase = new Map<string, { total: number, page: number, totalPage: number, identities: string[] }>();
        for (const textCase of cases) {
          if (textCase.expectedFixtureIds != null) {
            expectedByCase.set(textCase.id, {
              total:      textCase.expectedFixtureIds.length,
              page:       1,
              totalPage:  Math.ceil(textCase.expectedFixtureIds.length / PAGE_SIZE),
              identities: textCase.expectedFixtureIds,
            });
          }
        }

        const textSizes = await session.unsafe(`
          SELECT
            (SELECT count(*) FROM magic.search_card_parts WHERE deleted_at IS NULL)::bigint AS part_rows,
            (SELECT COALESCE(sum(pg_column_size(part_text)), 0) FROM magic.search_card_parts WHERE deleted_at IS NULL)::bigint AS part_text_bytes,
            (SELECT count(*) FROM magic.search_card_part_localizations WHERE deleted_at IS NULL)::bigint AS localization_rows,
            (SELECT COALESCE(sum(pg_column_size(part_loc_text)), 0) FROM magic.search_card_part_localizations WHERE deleted_at IS NULL)::bigint AS localization_text_bytes`);

        const updateSamples = [];
        for (let iteration = 0; iteration < 5; iteration++) {
          updateSamples.push({ iteration, variant: 'baseline', table: 'parts', ...(await measureUpdate(session, copies.baseline.parts, 'part_text')) });
          updateSamples.push({ iteration, variant: 'trgm', table: 'parts', ...(await measureUpdate(session, copies.trgm.parts, 'part_text')) });
          updateSamples.push({ iteration, variant: 'baseline', table: 'localizations', ...(await measureUpdate(session, copies.baseline.localizations, 'part_loc_text')) });
          updateSamples.push({ iteration, variant: 'trgm', table: 'localizations', ...(await measureUpdate(session, copies.trgm.localizations, 'part_loc_text')) });
        }

        const explain = [];
        for (const textCase of cases) {
          const query = queries.get(textCase.id)!;
          for (const variant of ['baseline', 'trgm'] as const) {
            const statement = rewriteQuery(query, variant);
            const plan = await session.unsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${statement}`, query.params);
            explain.push({ caseId: textCase.id, variant, sql: statement, params: query.params, plan: plan[0]?.['QUERY PLAN'] ?? plan });
          }
        }

        const tableSizes = [];
        for (const variant of ['baseline', 'trgm'] as const) {
          for (const tableName of [copies[variant].parts, copies[variant].localizations]) {
            const size = await session.unsafe('SELECT pg_total_relation_size($1::regclass)::bigint AS bytes', [`pg_temp.${tableName}`]);
            tableSizes.push({ variant, relation: tableName, bytes: String(size[0]?.bytes ?? 0) });
          }
        }

        const measurements = await sampleCases(session, cases, queries, expectedByCase);
        report = {
          startedAt,
          completedAt:           new Date().toISOString(),
          game:                  'magic',
          protocol:              { warmups: WARMUPS, samples: SAMPLES, concurrency: 1, seed: SEED, order: 'fixed-seed interleaved per case, variants randomized within each pair' },
          environment:           await session.unsafe('SELECT current_database() AS database, version() AS version, inet_server_addr()::text AS address'),
          pgTrgmInstalledBefore: Boolean(extensionBefore[0]?.installed),
          fixtures,
          cases,
          liveActionComparisons,
          textSizes:             textSizes[0],
          tableSizes,
          indexBuilds,
          updateSamples,
          measurements,
          explainAnalyze:        explain,
          limitations:           [
            'Latency samples are SQL client round trips over the exact accelerated query, not external API timings.',
            'The candidate GIN indexes, pg_trgm extension, fixture updates, and table copies are rolled back with the transaction.',
            'P95 uses 20 samples and is exploratory.',
          ],
        };
        throw rollbackSignal;
      });
    } catch (error) {
      if (error !== rollbackSignal) throw error;
    }

    if (report == null) throw new Error('The Magic text index probe produced no report.');
    const cleanup = await client.unsafe(`
      SELECT
        to_regclass('magic.t07_magic_parts_baseline') IS NULL
          AND to_regclass('pg_temp.t07_magic_baseline_parts') IS NULL
          AND to_regclass('pg_temp.t07_magic_trgm_parts') IS NULL AS no_persistent_table,
        EXISTS (SELECT 1 FROM pg_extension WHERE extname = $1) AS extension_present`, ['pg_trgm']);
    if (!cleanup[0]?.no_persistent_table) throw new Error('A T07 temporary Magic table remained after rollback.');
    if (Boolean(cleanup[0]?.extension_present) !== extensionOriginallyInstalled) {
      throw new Error('The pg_trgm extension state changed after the T07 Magic probe rollback.');
    }

    await mkdir(OUTPUT_ROOT, { recursive: true });
    const outputPath = resolve(OUTPUT_ROOT, `magic-text-index-${startedAt.replace(/[:.]/g, '-')}.json`);
    await writeFile(outputPath, `${serialize(report)}\n`, 'utf8');
    console.log(outputPath);
  } finally {
    setMagicSearchManifest(null);
    await client.end();
  }
}

await main();
