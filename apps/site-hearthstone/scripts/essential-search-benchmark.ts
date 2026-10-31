import { resolve } from 'node:path';
import postgres from 'postgres';
import { runWithDb } from '@tcg-cards/db/db';
import { hearthstoneSearchManifest } from '@tcg-cards/model/hearthstone/search/manifest';
import { essentialSearchResult } from '@tcg-cards/model/hearthstone/schema/search';

import { search } from '../server/search';
import { setHearthstoneSearchDataset } from '../server/search/accelerated-adapter';
import {
  apiSearch, collectDatabaseMetadata, createInstrumentedDb, observeSearchSql, seededRandom, sqlObservations, startApi, summarize,
} from './pg-search-benchmark';

/** Uses the baseline API input contract for reproducible paired measurements. */
type BenchmarkCase = Parameters<typeof apiSearch>[1];

/** Identifies the implementation behind the same essential response contract. */
type SearchPath = 'original' | 'accelerated';

const cases: BenchmarkCase[] = [
  ['name', 'n:Fireball'],
  ['body', 'x:"deal 3 damage"'],
  ['attributes', 'c:4 a:4 h:5'],
  ['logic', 'type:minion (class:mage|class:warlock) -cost:0'],
  ['ambit', 'ambit:primary type:minion'],
  ['list', 'type:minion'],
  ['language-alias', 'l:zhs type:minion'],
  ['multiple-languages', 'lang:en|zhs type:minion'],
  ['elite', 'elite:true'],
  ['tavern', 'in-tavern:true'],
  ['cooldown', 'cooldown>=2'],
  ['stats-order', 'type:minion order:stats-'],
  ['regex', 'x:/deal.{0,24}damage/'],
  ['hashtag-fallback', '#taunt'],
  ['faction-fallback', 'faction:human'],
].map(([id, q]) => ({ id: id!, coverage: id!, q: q!, page: 1, pageSize: 20, lang: 'en', orderBy: 'name+' }));
cases.push({ ...cases[5]!, id: 'deep-page', page: 100 });
cases.push({ ...cases[0]!, id: 'empty-page', page: 99999 });

/** Compares all necessary fields in order, excluding only elapsed time. */
function identity(value: unknown): string {
  const response = essentialSearchResult.parse(value);
  if (response.result == null || response.errors?.length) {
    throw new Error(`Search failed: ${JSON.stringify(response.errors)}`);
  }
  const { elapsed: _elapsed, ...result } = response.result;
  return JSON.stringify(result);
}

/** Validates both paths before running the approved serial interleaved API protocol. */
async function main(): Promise<void> {
  const connection = process.env.DATABASE_URL;
  const manifestPath = process.env.BENCH_SEARCH_MANIFEST;
  if (connection == null || manifestPath == null) {
    throw new Error('Set DATABASE_URL and BENCH_SEARCH_MANIFEST to an existing search dataset sidecar.');
  }
  const source = await Bun.file(manifestPath).json();
  const manifest = hearthstoneSearchManifest.parse({ dataVersion: source.dataVersion, buildNumber: source.buildNumber });
  const client = postgres(connection, { max: 1, connection: { application_name: 'hearthstone-essential-benchmark' } });
  const instrumented = createInstrumentedDb(connection);
  const samples: Array<{ caseId: string, path: SearchPath, iteration: number, durationMs: number }> = [];
  const preflight: Array<{ caseId: string, expected: unknown }> = [];
  let api: Awaited<ReturnType<typeof startApi>> | null = null;
  const startedAt = new Date().toISOString();
  try {
    const [latest] = await client`SELECT max(build_number) AS build FROM hearthstone.patches`;
    if (Number(latest!.build) !== manifest.buildNumber) {
      throw new Error('The manifest is not for the global latest build; benchmark aborted.');
    }
    const dataset = { manifest, dataVersion: manifest.dataVersion, buildNumber: manifest.buildNumber, ready: true };
    const expected = new Map<string, string>();
    for (const entry of cases) {
      /** Replays one implementation with exactly one diagnostic observation. */
      const run = async (path: SearchPath) => {
        setHearthstoneSearchDataset(path === 'original' ? null : dataset);
        return observeSearchSql(`${entry.id}:${path}`, () => runWithDb(instrumented.db, () => search.search('essential', entry.q, {
          page:     entry.page,
          pageSize: entry.pageSize,
          lang:     entry.lang,
          orderBy:  entry.orderBy,
          dsl:      entry.q,
        })));
      };
      const original = await run('original');
      const accelerated = await run('accelerated');
      const key = identity(original);
      if (identity(accelerated) !== key) {
        throw new Error(`${entry.id}: ordered essential rows or aggregates differ between paths.`);
      }
      expected.set(entry.id, key);
      preflight.push({ caseId: entry.id, expected: JSON.parse(key) });
    }
    if (process.env.BENCH_SKIP_API !== '1') {
      process.env.BENCH_HEARTHSTONE_SEARCH_DATASET = JSON.stringify(dataset);
      api = await startApi(connection);
      const random = seededRandom(0x5eed);
      const warmups = Number(process.env.BENCH_WARMUPS ?? 2);
      const rounds = Number(process.env.BENCH_SAMPLES ?? 20);
      for (let round = -warmups; round < rounds; round++) {
        const schedule = cases.flatMap(entry => (['original', 'accelerated'] as const).map(path => ({ entry, path })));
        for (let index = schedule.length - 1; index > 0; index--) {
          const other = Math.floor(random() * (index + 1));
          [schedule[index], schedule[other]] = [schedule[other]!, schedule[index]!];
        }
        for (const { entry, path } of schedule) {
          const measured = await apiSearch(api.baseUrl, entry, { endpoint: 'essential', path });
          if (identity(measured.result) !== expected.get(entry.id)) {
            throw new Error(`${entry.id}:${path}: API result differs from the fixed preflight.`);
          }
          if (round >= 0) {
            samples.push({ caseId: entry.id, path, iteration: round, durationMs: measured.durationMs });
          }
        }
        console.log(`Completed paired API round ${round + warmups + 1}/${warmups + rounds}`);
      }
    }
    const explain: unknown[] = [];
    for (const observation of sqlObservations.slice(0, Number(process.env.BENCH_EXPLAIN_LIMIT ?? 8))) {
      const plan = await client.unsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${observation.sql}`, observation.params as never[]);
      explain.push({ caseId: observation.caseId, sql: observation.sql, params: observation.params, plan });
    }
    const sizes = await client`SELECT relname, pg_total_relation_size(oid) AS total_bytes
      FROM pg_class WHERE oid IN ('hearthstone.search_cards'::regclass, 'hearthstone.search_card_localizations'::regclass)`;
    const counts = await client`SELECT (SELECT count(*) FROM hearthstone.search_cards WHERE deleted_at IS NULL) AS cards,
      (SELECT count(*) FROM hearthstone.search_card_localizations WHERE deleted_at IS NULL) AS localizations`;
    const artifact = {
      startedAt,
      completedAt:           new Date().toISOString(),
      manifest,
      database:              await collectDatabaseMetadata(connection, api?.port ?? 3002),
      gitRevision:           Bun.spawnSync(['git', 'rev-parse', 'HEAD']).stdout.toString().trim(),
      sourceBuildDurationMs: source.buildDurationMs ?? null,
      protocol:              { concurrency: 1, warmups: Number(process.env.BENCH_WARMUPS ?? 2), samples: Number(process.env.BENCH_SAMPLES ?? 20), seed: 0x5eed, cache: 'warm, not cleared', api: api != null, environment: 'local Nuxt dev / same essential endpoint' },
      preflight,
      sqlObservations,
      explain,
      sizes,
      counts,
      samples,
      metrics:               cases.flatMap(entry => (['original', 'accelerated'] as const).map(path => ({
        caseId: entry.id,
        path,
        ...summarize(samples.filter(sample => sample.caseId === entry.id && sample.path === path).map(sample => sample.durationMs)),
      }))),
    };
    const output = resolve(import.meta.dirname, '../../../.scratch/search-acceleration/benchmark-artifacts', `hearthstone-essential-${startedAt.replace(/[:.]/g, '-')}.json`);
    await Bun.write(output, JSON.stringify(artifact, (_key, value) => typeof value === 'bigint' ? String(value) : value, 2));
    console.log(output);
  } finally {
    setHearthstoneSearchDataset(null);
    delete process.env.BENCH_HEARTHSTONE_SEARCH_DATASET;
    api?.child.kill('SIGTERM');
    await instrumented.client.end();
    await client.end();
  }
}

await main();
