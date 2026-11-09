import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { runWithDb } from '@tcg-cards/db/db';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { search } from '../server/search/index.ts';
import { setHearthstoneSearchDataset } from '../server/search/accelerated-adapter';

const WARMUPS = 2;
const SAMPLES = 20;
const PAGE_SIZE = 20;
const SEED = 0x5eed;
const OUTPUT_ROOT = resolve(import.meta.dirname, '../../../.scratch/search-acceleration/benchmark-artifacts');
const rollbackSignal = new Error('rollback T07 temporary text index probe');

type Fixture = { cardId: string };
type TextCase = {
  id:                  string;
  dsl:                 string;
  lang:                'en' | 'zhs';
  expectedFixtureIds?: string[];
  compareLiveAction?:  boolean;
};
type CapturedQuery = { caseId: string, sql: string, params: unknown[] };
type ResultIdentity = { total: number, page: number, totalPage: number, ambit: string, identities: string[] };
type PgSession = { unsafe: (query: string, params?: unknown[]) => Promise<any[]> };

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

/** Computes an interpolated latency percentile for one query case. */
function percentile(values: number[], probability: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

/** Summarizes SQL client round trips, not endpoint latency. */
function summarize(values: number[]) {
  return {
    samples: values.length,
    p50Ms:   percentile(values, 0.5),
    p95Ms:   percentile(values, 0.95),
    minMs:   values.length === 0 ? null : Math.min(...values),
    maxMs:   values.length === 0 ? null : Math.max(...values),
  };
}

/** Validates and unwraps the current essential search action response. */
function actionResult(response: any, caseId: string): any {
  if (response.errors?.length || response.result == null || !Array.isArray(response.result.result)) {
    throw new Error(`${caseId} failed in the current Hearthstone PG search path: ${serialize(response.errors)}`);
  }
  return response.result;
}

/** Extracts stable ordered card/language identity and aggregate fields. */
function resultIdentity(value: { total: unknown, page?: unknown, totalPage?: unknown, ambit?: unknown, result: any[] }): ResultIdentity {
  const total = Number(value.total);
  return {
    total,
    page:       value.page == null ? 1 : Number(value.page),
    totalPage:  value.totalPage == null ? Math.ceil(total / PAGE_SIZE) : Number(value.totalPage),
    ambit:      String(value.ambit ?? 'primary'),
    identities: value.result.map(row => `${row.cardId}/${row.lang ?? row.localization?.lang ?? ''}`),
  };
}

/** Reads identities from the raw accelerated query's JSON result payload. */
function queryIdentity(rows: any[]): ResultIdentity {
  const row = rows[0] ?? {};
  const result = Array.isArray(row.result) ? row.result : [];
  const total = Number(row.total ?? 0);
  return {
    total,
    page:       1,
    totalPage:  Math.ceil(total / PAGE_SIZE),
    ambit:      String(row.ambit ?? 'primary'),
    identities: result.map((item: any) => `${item.cardId}/${item.lang ?? item.localization?.lang ?? ''}`),
  };
}

/** Builds fixed semantic cases over four real current card identities. */
function makeCases(fixtures: Fixture[]): TextCase[] {
  const id = (index: number) => `${fixtures[index]!.cardId}/en`;
  return [
    { id: 'body-contains-real', dsl: 'text:"deal 3 damage"', lang: 'en', compareLiveAction: true },
    { id: 'body-short-real', dsl: 'text:of', lang: 'en', compareLiveAction: true },
    { id: 'body-short-fixture', dsl: 'text:T07', lang: 'en', expectedFixtureIds: [id(0), id(1)] },
    { id: 'body-exact-fixture', dsl: 'text="T10ExactBody"', lang: 'en', expectedFixtureIds: [id(2)] },
    { id: 'body-percent-literal', dsl: 'text:"T07%"', lang: 'en', expectedFixtureIds: [id(0)] },
    { id: 'body-underscore-literal', dsl: 'text:"T08_"', lang: 'en', expectedFixtureIds: [id(1)] },
    { id: 'body-newline', dsl: `text:"T07Alpha\nBeta"`, lang: 'en', expectedFixtureIds: [id(0)] },
    { id: 'body-bare-expansion', dsl: 'T07BareBody', lang: 'en', expectedFixtureIds: [id(0)] },
    { id: 'body-cross-field-boundary', dsl: 'T07BoundaryToken', lang: 'en', expectedFixtureIds: [] },
    { id: 'localized-unicode', dsl: 'text:T09中文测试', lang: 'zhs', expectedFixtureIds: [`${fixtures[0]!.cardId}/zhs`] },
  ];
}

/** Rewrites only the approved Hearthstone body table to a transaction-local copy. */
function rewriteQuery(query: CapturedQuery, variant: 'baseline' | 'trgm'): string {
  const source = '"hearthstone"."search_card_localizations"';
  const target = `pg_temp."t07_hearthstone_localizations_${variant}"`;
  const rewritten = query.sql.replaceAll(source, target);
  if (!rewritten.includes(target)) throw new Error(`${query.caseId} did not reference the rewritable Hearthstone body table.`);
  return rewritten;
}

/** Captures the SQL produced by the public action for one fixed DSL query. */
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
  const response = await runWithDb(database, () => search.search('essential', textCase.dsl, {
    page:     1,
    pageSize: PAGE_SIZE,
    lang:     textCase.lang,
    orderBy:  'name+',
    dsl:      textCase.dsl,
  }));
  activeCaseId = null;

  const result = actionResult(response, textCase.id);
  const query = observations.findLast(observation => observation.caseId === textCase.id
    && observation.sql.toLowerCase().includes('ilike')
    && observation.sql.includes('search_card_localizations'));
  if (query == null) throw new Error(`${textCase.id} did not compile a PG body query.`);
  return { result, query };
}

/** Copies the current search localization relation into pg_temp with its existing non-text indexes. */
async function copyLocalization(session: PgSession, variant: 'baseline' | 'trgm'): Promise<string> {
  const table = `t07_hearthstone_localizations_${variant}`;
  await session.unsafe(`CREATE TEMP TABLE "${table}" (LIKE "hearthstone"."search_card_localizations" INCLUDING ALL) ON COMMIT DROP`);
  await session.unsafe(`INSERT INTO pg_temp."${table}" SELECT * FROM "hearthstone"."search_card_localizations"`);
  return table;
}

/** Selects four latest cards with both English and Simplified Chinese search rows. */
async function selectFixtures(session: PgSession): Promise<Fixture[]> {
  const rows = await session.unsafe(`
    SELECT DISTINCT ON (c.card_id) c.card_id AS "cardId"
    FROM hearthstone.search_cards c
    JOIN hearthstone.search_card_localizations en
      ON en.card_id = c.card_id AND en.lang = 'en' AND en.deleted_at IS NULL
    JOIN hearthstone.search_card_localizations zhs
      ON zhs.card_id = c.card_id AND zhs.lang = 'zhs' AND zhs.deleted_at IS NULL
    WHERE c.deleted_at IS NULL AND c.type <> 'enchantment'
    ORDER BY c.card_id
    LIMIT 4`);
  if (rows.length !== 4) throw new Error(`Expected four Hearthstone text fixtures, found ${rows.length}.`);
  return rows as Fixture[];
}

/** Seeds repeatable literal and Unicode cases in both transaction-local copies. */
async function seedFixtures(session: PgSession, tableNames: Record<'baseline' | 'trgm', string>, fixtures: Fixture[]): Promise<void> {
  const values = [
    { name: 'T07BareName', text: 'T07Alpha\nBeta T07%literal T08X T07 T07BareBody' },
    { name: 'T07Literal', text: 'T07Xliteral T08_literal T07' },
    { name: 'T10Exact', text: 'T10ExactBody' },
    { name: 'T07Boundary', text: 'Token' },
  ];
  for (const variant of ['baseline', 'trgm'] as const) {
    const table = tableNames[variant];
    for (const [index, fixture] of fixtures.entries()) {
      const body = values[index]!;
      await session.unsafe(`
        UPDATE pg_temp."${table}"
        SET name = $1, text = $2
        WHERE card_id = $3 AND lang = 'en'`, [body.name, body.text, fixture.cardId]);
    }
    await session.unsafe(`
      UPDATE pg_temp."${table}"
      SET text = $1
      WHERE card_id = $2 AND lang = 'zhs'`, ['T09中文测试', fixtures[0]!.cardId]);
  }
}

/** Replays one captured statement against a no-text-index or trigram relation. */
async function queryVariant(session: PgSession, query: CapturedQuery, variant: 'baseline' | 'trgm') {
  return session.unsafe(rewriteQuery(query, variant), query.params);
}

/** Measures a reversible text-column UPDATE on a matching copy using a savepoint. */
async function measureUpdate(session: PgSession, tableName: string): Promise<{ durationMs: number, rows: number }> {
  await session.unsafe('SAVEPOINT t07_update_sample');
  const startedAt = performance.now();
  const result = await session.unsafe(`
    WITH picked AS (
      SELECT ctid FROM pg_temp."${tableName}"
      WHERE deleted_at IS NULL AND lang = 'en'
      ORDER BY card_id
      LIMIT 1000
    )
    UPDATE pg_temp."${tableName}" AS target
    SET text = target.text || ' '
    FROM picked WHERE target.ctid = picked.ctid`);
  const durationMs = performance.now() - startedAt;
  await session.unsafe('ROLLBACK TO SAVEPOINT t07_update_sample');
  await session.unsafe('RELEASE SAVEPOINT t07_update_sample');
  return { durationMs, rows: Number(result.count ?? 0) };
}

/** Runs fixed-seed paired SQL samples and checks each result against its preflight identity. */
async function sampleCases(session: PgSession, cases: TextCase[], queries: Map<string, CapturedQuery>, expectedByCase: Map<string, ResultIdentity>) {
  const random = seededRandom(SEED);
  const samples: Array<{ caseId: string, variant: 'baseline' | 'trgm', iteration: number, durationMs: number }> = [];
  const preflight: Array<{ caseId: string } & ResultIdentity> = [];

  for (const textCase of cases) {
    const query = queries.get(textCase.id)!;
    const baseline = await queryVariant(session, query, 'baseline');
    const trgm = await queryVariant(session, query, 'trgm');
    const baselineIdentity = queryIdentity(baseline);
    const trgmIdentity = queryIdentity(trgm);
    if (serialize(baselineIdentity) !== serialize(trgmIdentity)) {
      throw new Error(`${textCase.id}: the GIN result differs from the no-index result.`);
    }
    const expected = expectedByCase.get(textCase.id);
    if (expected != null) {
      const { ambit: _expectedAmbit, ...expectedFields } = expected;
      const { ambit: _actualAmbit, ...actualFields } = baselineIdentity;
      if (serialize(actualFields) !== serialize(expectedFields)) {
        throw new Error(`${textCase.id}: expected ${serialize(expectedFields)}, received ${serialize(actualFields)}.`);
      }
    }
    preflight.push({ caseId: textCase.id, ...baselineIdentity });
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
        const startedAt = performance.now();
        const rows = await session.unsafe(rewriteQuery(query, variant), query.params);
        const durationMs = performance.now() - startedAt;
        const identity = queryIdentity(rows);
        const expected = preflight.find(entry => entry.caseId === textCase.id)!;
        const { caseId: _caseId, ...expectedIdentity } = expected;
        if (serialize(identity) !== serialize(expectedIdentity)) {
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

/** Runs the local Hearthstone comparison and rolls every temporary change back. */
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

  const client = postgres(connection.toString(), { max: 1, connect_timeout: 5, application_name: 'search-acceleration-t07-text-index-hearthstone' });
  let report: Record<string, unknown> | null = null;
  let extensionOriginallyInstalled = false;
  const startedAt = new Date().toISOString();
  try {
    const [patch] = await client.unsafe('SELECT max(build_number) AS build_number FROM hearthstone.patches');
    if (patch?.build_number == null) throw new Error('No Hearthstone latest build is available for the text index probe.');
    const buildNumber = Number(patch.build_number);
    const manifest = { dataVersion: 't07-local-probe', buildNumber };
    setHearthstoneSearchDataset({ manifest, ...manifest, ready: true });
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

        const baselineTable = await copyLocalization(session, 'baseline');
        const trgmTable = await copyLocalization(session, 'trgm');
        const tableNames = { baseline: baselineTable, trgm: trgmTable };
        const liveActionComparisons = [];
        for (const textCase of cases.filter(entry => entry.compareLiveAction)) {
          const actual = resultIdentity(actionResults.get(textCase.id)!);
          const baseline = queryIdentity(await queryVariant(session, queries.get(textCase.id)!, 'baseline'));
          if (baseline.total !== actual.total || baseline.ambit !== actual.ambit
            || serialize(baseline.identities) !== serialize(actual.identities)) {
            throw new Error(`${textCase.id}: unmodified no-index copy differs from the current accelerated action.`);
          }
          liveActionComparisons.push({ caseId: textCase.id, result: actual });
        }
        await seedFixtures(session, tableNames, fixtures);
        await session.unsafe('CREATE EXTENSION IF NOT EXISTS pg_trgm');

        const indexBuildStartedAt = performance.now();
        await session.unsafe(`CREATE INDEX "t07_hearthstone_localizations_trgm_idx" ON pg_temp."${trgmTable}" USING gin (text gin_trgm_ops)`);
        const indexBuildMs = performance.now() - indexBuildStartedAt;
        const [indexSize] = await session.unsafe('SELECT pg_relation_size($1::regclass)::bigint AS bytes', ['pg_temp.t07_hearthstone_localizations_trgm_idx']);
        await session.unsafe(`ANALYZE pg_temp."${baselineTable}"`);
        await session.unsafe(`ANALYZE pg_temp."${trgmTable}"`);

        const expectedByCase = new Map<string, ResultIdentity>();
        for (const textCase of cases) {
          if (textCase.expectedFixtureIds != null) {
            expectedByCase.set(textCase.id, {
              total:      textCase.expectedFixtureIds.length,
              page:       1,
              totalPage:  Math.ceil(textCase.expectedFixtureIds.length / PAGE_SIZE),
              ambit:      'primary',
              identities: textCase.expectedFixtureIds,
            });
          }
        }

        const [textSizes] = await session.unsafe(`
          SELECT count(*)::bigint AS rows,
            COALESCE(sum(pg_column_size(text)), 0)::bigint AS text_bytes,
            pg_total_relation_size('hearthstone.search_card_localizations'::regclass)::bigint AS source_total_bytes
          FROM hearthstone.search_card_localizations WHERE deleted_at IS NULL`);
        const updateSamples = [];
        for (let iteration = 0; iteration < 5; iteration++) {
          updateSamples.push({ iteration, variant: 'baseline', ...(await measureUpdate(session, baselineTable)) });
          updateSamples.push({ iteration, variant: 'trgm', ...(await measureUpdate(session, trgmTable)) });
        }

        const explainAnalyze = [];
        for (const textCase of cases) {
          const query = queries.get(textCase.id)!;
          for (const variant of ['baseline', 'trgm'] as const) {
            const statement = rewriteQuery(query, variant);
            const plan = await session.unsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${statement}`, query.params);
            explainAnalyze.push({ caseId: textCase.id, variant, sql: statement, params: query.params, plan: plan[0]?.['QUERY PLAN'] ?? plan });
          }
        }

        const tableSizes = [];
        for (const variant of ['baseline', 'trgm'] as const) {
          const [size] = await session.unsafe('SELECT pg_total_relation_size($1::regclass)::bigint AS bytes', [`pg_temp.${tableNames[variant]}`]);
          tableSizes.push({ variant, relation: tableNames[variant], bytes: String(size?.bytes ?? 0) });
        }
        const measurements = await sampleCases(session, cases, queries, expectedByCase);
        report = {
          startedAt,
          completedAt:           new Date().toISOString(),
          game:                  'hearthstone',
          dataset:               { buildNumber },
          protocol:              { warmups: WARMUPS, samples: SAMPLES, concurrency: 1, seed: SEED, order: 'fixed-seed interleaved per case, variants randomized within each pair' },
          environment:           await session.unsafe('SELECT current_database() AS database, version() AS version, inet_server_addr()::text AS address'),
          pgTrgmInstalledBefore: extensionOriginallyInstalled,
          fixtures,
          cases,
          liveActionComparisons,
          textSizes,
          tableSizes,
          index:                 { name: 't07_hearthstone_localizations_trgm_idx', column: 'text', buildMs: indexBuildMs, bytes: String(indexSize?.bytes ?? 0) },
          updateSamples,
          measurements,
          explainAnalyze,
          limitations:           [
            'Latency samples are SQL client round trips over the exact accelerated query, not external API timings.',
            'The candidate GIN index, pg_trgm extension, fixture updates, and table copies are rolled back with the transaction.',
            'P95 uses 20 samples and is exploratory.',
          ],
        };
        throw rollbackSignal;
      });
    } catch (error) {
      if (error !== rollbackSignal) throw error;
    }

    if (report == null) throw new Error('The Hearthstone text index probe produced no report.');
    const cleanup = await client.unsafe(`
      SELECT
        to_regclass('hearthstone.t07_hearthstone_localizations_baseline') IS NULL
          AND to_regclass('pg_temp.t07_hearthstone_localizations_baseline') IS NULL
          AND to_regclass('pg_temp.t07_hearthstone_localizations_trgm') IS NULL AS no_persistent_table,
        EXISTS (SELECT 1 FROM pg_extension WHERE extname = $1) AS extension_present`, ['pg_trgm']);
    if (!cleanup[0]?.no_persistent_table) throw new Error('A T07 temporary Hearthstone table remained after rollback.');
    if (Boolean(cleanup[0]?.extension_present) !== extensionOriginallyInstalled) {
      throw new Error('The pg_trgm extension state changed after the T07 Hearthstone probe rollback.');
    }

    await mkdir(OUTPUT_ROOT, { recursive: true });
    const outputPath = resolve(OUTPUT_ROOT, `hearthstone-text-index-${startedAt.replace(/[:.]/g, '-')}.json`);
    await writeFile(outputPath, `${serialize(report)}\n`, 'utf8');
    console.log(outputPath);
  } finally {
    setHearthstoneSearchDataset(null);
    await client.end();
  }
}

await main();
