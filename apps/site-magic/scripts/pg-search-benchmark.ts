import { createServer } from 'node:net';
import { resolve } from 'node:path';

import { runWithDb } from '@tcg-cards/db/db';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import Parser from '#search/parser';
import { simplify } from '#search/parser/simplify';
import { resolveQueryRequest } from '#search/server/logical';
import { translateLegacy } from '#search/server/translate';

import { search } from '../server/search/index.ts';
import * as magicCommands from '../server/search/command-list';

// Bun's fetch honors HTTP(S)_PROXY from the environment, which would route the
// loopback RPC traffic through the developer's proxy; loopback must bypass it.
for (const key of ['NO_PROXY', 'no_proxy']) {
  process.env[key] = [...new Set([...(process.env[key] ?? '').split(',').filter(Boolean), '127.0.0.1', 'localhost'])].join(',');
}

const GAME = 'magic';

// BENCH_* env overrides let a short protocol be requested without editing the
// frozen case fixtures; the defaults use the approved lightweight protocol.
const WARMUPS = Number(process.env.BENCH_WARMUPS ?? 2);
const SAMPLES = Number(process.env.BENCH_SAMPLES ?? 20);
const SKIP_API = process.env.BENCH_SKIP_API === '1';
const EXPLAIN_LIMIT = Number(process.env.BENCH_EXPLAIN_LIMIT ?? 0);
const SEED = 0x5eed;
const PAGE_SIZE = 20;

// The configured magic site dev port (nuxt.config devServer); the benchmark
// measures the public RPC on that port and never picks another one.
const CONFIGURED_PORT = 3001;
const OUTPUT_ROOT = resolve(import.meta.dirname, '../../../.scratch/search-acceleration/benchmark-artifacts');

/** Defines a fixed query and its public search options. */
type BenchmarkCase = {
  id:       string;
  coverage: string;
  q:        string;
  page:     number;
  pageSize: number;
  lang:     'en';
  groupBy:  'card';
  orderBy:  string;
};

/** Records one diagnostic SQL round trip during preflight. */
type SqlObservation = {
  caseId:         string;
  path:           'legacy-pg' | 'search-action';
  phase:          'preflight';
  iteration:      number;
  statementIndex: number;
  sql:            string;
  params:         unknown[];
  durationMs:     number;
  error?:         string;
};

/** Describes the result fields needed for benchmark validation. */
type SearchResult = {
  result?: {
    result?:    Array<Record<string, unknown>>;
    total?:     number;
    page?:      number;
    totalPage?: number;
    ambit?:     string;
  };
  errors?: unknown[];
};

const cases: BenchmarkCase[] = [
  { id: 'name', coverage: '名字', q: 'n:"Black Lotus"', page: 1, pageSize: PAGE_SIZE, lang: 'en', groupBy: 'card', orderBy: 'id+' },
  { id: 'cost-attributes', coverage: '费用/属性', q: 'mv=1 c:U', page: 1, pageSize: PAGE_SIZE, lang: 'en', groupBy: 'card', orderBy: 'id+' },
  { id: 'body-text', coverage: '正文', q: 'o:"draw a card"', page: 1, pageSize: PAGE_SIZE, lang: 'en', groupBy: 'card', orderBy: 'id+' },
  { id: 'nested-logic', coverage: '嵌套逻辑', q: 't:creature (c:U|c:B) -mv:0', page: 1, pageSize: PAGE_SIZE, lang: 'en', groupBy: 'card', orderBy: 'id+' },
  { id: 'rarity-existence-short', coverage: '稀有度存在性', q: 'r~:c', page: 1, pageSize: PAGE_SIZE, lang: 'en', groupBy: 'card', orderBy: 'id+' },
  { id: 'rarity-existence-long', coverage: '稀有度存在性', q: 'rarity~:common', page: 1, pageSize: PAGE_SIZE, lang: 'en', groupBy: 'card', orderBy: 'id+' },
  { id: 'rarity-existence-negative', coverage: '稀有度存在性/否定', q: '-r~:c', page: 1, pageSize: PAGE_SIZE, lang: 'en', groupBy: 'card', orderBy: 'id+' },
  { id: 'rarity-existence-and', coverage: '稀有度存在性/独立见证 AND', q: 'r~:c r~:r', page: 1, pageSize: PAGE_SIZE, lang: 'en', groupBy: 'card', orderBy: 'id+' },
  { id: 'rarity-existence-or', coverage: '稀有度存在性/OR', q: 'r~:c | r~:r', page: 1, pageSize: PAGE_SIZE, lang: 'en', groupBy: 'card', orderBy: 'id+' },
  { id: 'ordinary-rarity', coverage: '普通印刷稀有度', q: 'rarity:r', page: 1, pageSize: PAGE_SIZE, lang: 'en', groupBy: 'card', orderBy: 'id+' },
  { id: 'ambit', coverage: 'ambit', q: 'ambit:primary t:creature', page: 1, pageSize: PAGE_SIZE, lang: 'en', groupBy: 'card', orderBy: 'id+' },
  { id: 'pagination-first', coverage: '分页/count：首屏', q: 't:creature', page: 1, pageSize: PAGE_SIZE, lang: 'en', groupBy: 'card', orderBy: 'id+' },
  { id: 'pagination-deep', coverage: '分页/count：深页', q: 't:creature', page: 100, pageSize: PAGE_SIZE, lang: 'en', groupBy: 'card', orderBy: 'id+' },
  { id: 'pagination-empty', coverage: '分页/count：空页', q: 'n:"Black Lotus"', page: 2, pageSize: PAGE_SIZE, lang: 'en', groupBy: 'card', orderBy: 'id+' },
  { id: 'hard-regex', coverage: '困难查询', q: 'o:/draw.{0,24}card/', page: 1, pageSize: PAGE_SIZE, lang: 'en', groupBy: 'card', orderBy: 'id+' },
];

let currentSqlContext: Omit<SqlObservation, 'statementIndex' | 'sql' | 'params' | 'durationMs' | 'error'> | null = null;
let currentStatementIndex = 0;
const sqlObservations: SqlObservation[] = [];

/** Serializes artifacts including PostgreSQL bigint values. */
function serialize(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === 'bigint') return item.toString();
    if (item instanceof Date) return item.toISOString();
    return item;
  });
}

/** Captures diagnostic round trips without timing observation bookkeeping. */
function instrumentQuery<T extends object>(query: T, statement: string, params: unknown[]): T {
  return new Proxy(query, {
    get(target, property) {
      if (property === 'then') {
        return (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
          const startedAt = performance.now();
          const record = (error?: unknown) => {
            const durationMs = performance.now() - startedAt;
            if (currentSqlContext == null) return;
            const statementIndex = currentStatementIndex++;
            sqlObservations.push({
              ...currentSqlContext,
              statementIndex,
              sql: statement,
              params,
              durationMs,
              ...(error == null ? {} : { error: error instanceof Error ? error.message : String(error) }),
            });
          };

          return (target as any).then(
            (value: unknown) => {
              record();
              return onFulfilled?.(value) ?? value;
            },
            (error: unknown) => {
              record(error);
              if (onRejected != null) return onRejected(error);
              throw error;
            },
          );
        };
      }

      if (property === 'values') {
        return (...args: unknown[]) => instrumentQuery((target as any).values(...args), statement, params);
      }

      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/** Creates an isolated database client for preflight SQL capture. */
function createInstrumentedDb(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 1, application_name: 'search-acceleration-benchmark-magic' });
  const unsafe = client.unsafe.bind(client);
  const instrumentedClient = new Proxy(client, {
    get(target, property, receiver) {
      if (property === 'unsafe') {
        return (statement: string, params: unknown[] = [], options?: unknown) =>
          instrumentQuery(unsafe(statement, params, options as any), statement, params);
      }
      return Reflect.get(target, property, receiver);
    },
  });

  return { client, db: drizzle({ client: instrumentedClient }) };
}

/** Extracts ordered result identities and pagination for comparison. */
function getIdentityRows(result: SearchResult, caseId: string) {
  if (result.errors?.length) {
    throw new Error(`${caseId} returned search errors: ${serialize(result.errors)}`);
  }

  const normal = result.result;
  if (normal == null || !Array.isArray(normal.result) || typeof normal.total !== 'number') {
    throw new Error(`${caseId} returned an unexpected search result: ${serialize(result)}`);
  }

  const ids = normal.result.map(row => {
    const cardId = row.cardId;
    if (typeof cardId !== 'string') throw new Error(`${caseId} result row has no cardId`);
    return cardId;
  });

  return {
    total:     normal.total,
    page:      normal.page,
    totalPage: normal.totalPage,
    ids,
    ambit:     normal.ambit,
  };
}

/** Rejects result changes between entrypoints or repeated requests. */
function assertSameResult(expected: ReturnType<typeof getIdentityRows>, actual: ReturnType<typeof getIdentityRows>, caseId: string) {
  if (serialize(expected) !== serialize(actual)) {
    throw new Error(`${caseId} result changed during the run: expected ${serialize(expected)}, received ${serialize(actual)}`);
  }
}

/** Replays the normal search action, which selects acceleration or PG fallback. */
async function acceleratedSearch(database: ReturnType<typeof createInstrumentedDb>['db'], benchmarkCase: BenchmarkCase) {
  return runWithDb(database, () => search.search('search', benchmarkCase.q, {
    page:     benchmarkCase.page,
    pageSize: benchmarkCase.pageSize,
    lang:     benchmarkCase.lang,
    groupBy:  benchmarkCase.groupBy,
    orderBy:  benchmarkCase.orderBy,
    dsl:      benchmarkCase.q,
  })) as Promise<SearchResult>;
}

/** Replays the preserved legacy translator and original PG action handler. */
async function legacyPgSearch(database: ReturnType<typeof createInstrumentedDb>['db'], benchmarkCase: BenchmarkCase) {
  return runWithDb(database, async () => {
    const expression = simplify(new Parser(benchmarkCase.q).parse());
    const { query, post } = translateLegacy(
      expression,
      Object.values(magicCommands) as any,
      search.actions.search.table,
    );
    if (query == null) return { result: undefined } as SearchResult;

    return {
      result: await search.actions.search.handler(query, post, {
        page:     benchmarkCase.page,
        pageSize: benchmarkCase.pageSize,
        lang:     benchmarkCase.lang,
        groupBy:  benchmarkCase.groupBy,
        orderBy:  benchmarkCase.orderBy,
        dsl:      benchmarkCase.q,
      }),
    } as SearchResult;
  });
}

/** Records whether the normal action should use the exact accelerated adapter. */
function getAccelerationPlan(benchmarkCase: BenchmarkCase) {
  const expression = simplify(new Parser(benchmarkCase.q).parse());
  const request = resolveQueryRequest(expression, Object.values(magicCommands) as any, {
    sort:     [{ kind: 'request', field: 'order', value: benchmarkCase.orderBy }],
    group:    benchmarkCase.groupBy,
    page:     benchmarkCase.page,
    pageSize: benchmarkCase.pageSize,
    total:    true,
    ambit:    null,
    lang:     benchmarkCase.lang,
  });

  return search.actions.search.acceleratedAdapter?.plan(request) ?? { type: 'not-configured' };
}

/** Checks that the configured site port is available. */
async function assertPortAvailable(port: number) {
  const probe = createServer();
  try {
    await new Promise<void>((resolveListen, reject) => {
      probe.once('error', reject);
      probe.listen(port, '127.0.0.1', () => resolveListen());
    });
  } catch {
    throw new Error(`Configured dev port ${port} is already in use; stop the process holding it before benchmarking.`);
  } finally {
    await new Promise<void>(resolveClose => probe.close(() => resolveClose()));
  }
}

/** Starts the local development API and waits for readiness. */
async function startApi(databaseUrl: string) {
  const appRoot = resolve(import.meta.dirname, '..');
  await assertPortAvailable(CONFIGURED_PORT);
  const port = CONFIGURED_PORT;
  const child = Bun.spawn(['bun', 'x', 'nuxt', 'dev', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: appRoot,
    env: {
      ...process.env,
      DATABASE_URL:                                             databaseUrl,
      CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: databaseUrl,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  let serverOutput = '';
  const collect = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      serverOutput = (serverOutput + decoder.decode(value)).slice(-20_000);
    }
  };
  void collect(child.stdout);
  void collect(child.stderr);

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`Nuxt dev server exited (${child.exitCode}):\n${serverOutput}`);
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(2_000) });
      if (response.status < 500) return { child, baseUrl, port, serverOutput: () => serverOutput };
    } catch {
      // The server is still compiling or binding its local port.
    }
    await Bun.sleep(500);
  }

  child.kill('SIGTERM');
  throw new Error(`Nuxt dev server did not start in time:\n${serverOutput}`);
}

/** Measures a public RPC request through response JSON parsing. */
async function apiSearch(baseUrl: string, benchmarkCase: BenchmarkCase) {
  const { id: _id, coverage: _coverage, ...input } = benchmarkCase;
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}/rpc/magic/search/basic`, {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify({ json: input }),
  });
  const body = await response.json() as any;
  const durationMs = performance.now() - startedAt;
  if (!response.ok) throw new Error(`API ${benchmarkCase.id} failed (${response.status}): ${serialize(body)}`);
  return { result: body.json ?? body, durationMs };
}

/** Produces reproducible random values for case ordering. */
function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Shuffles cases within each round using a fixed seed. */
function interleavedSchedule(repetitions: number, seed: number) {
  const random = seededRandom(seed);
  const schedule: Array<{ benchmarkCase: BenchmarkCase, iteration: number }> = [];
  for (let iteration = 1; iteration <= repetitions; iteration++) {
    const shuffled = [...cases];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
    }
    for (const benchmarkCase of shuffled) schedule.push({ benchmarkCase, iteration });
  }
  return schedule;
}

/** Interpolates a percentile from sorted latency samples. */
function percentile(sorted: number[], probability: number) {
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

/** Summarizes API latency samples for routine comparisons. */
function summarize(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const variance = sorted.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / sorted.length;
  return {
    samples:             sorted.length,
    minMs:               sorted[0] ?? null,
    p50Ms:               percentile(sorted, 0.5),
    p95Ms:               percentile(sorted, 0.95),
    maxMs:               sorted.at(-1) ?? null,
    meanMs:              mean,
    standardDeviationMs: Math.sqrt(variance),
  };
}

/** Records the source revision and working tree state. */
async function readGitMetadata(repoRoot: string) {
  const revision = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: repoRoot }).stdout.toString().trim();
  const status = Bun.spawnSync(['git', 'status', '--porcelain'], { cwd: repoRoot }).stdout.toString().trim();
  return { revision, workingTreeDirty: status.length > 0 };
}

/** Describes the database endpoint without exposing credentials. */
function describeConnection(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  return {
    host:     parsed.hostname,
    port:     Number(parsed.port || 5432),
    database: decodeURIComponent(parsed.pathname.slice(1)),
    sslmode:  parsed.searchParams.get('sslmode') ?? 'driver-default',
  };
}

/** Collects database and measurement context for reproduction. */
async function collectDatabaseMetadata(databaseUrl: string, apiPort: number) {
  const client = postgres(databaseUrl, { max: 1, application_name: 'search-acceleration-benchmark-magic-metadata' });
  try {
    const [serverRows, counts, tables] = await Promise.all([
      client.unsafe(`SELECT current_database() AS database, version() AS version, current_setting('server_version') AS server_version, inet_server_addr()::text AS server_address, inet_server_port() AS server_port, current_setting('shared_preload_libraries') AS shared_preload_libraries, current_setting('track_io_timing') AS track_io_timing`),
      client.unsafe(`SELECT MAX(build_number)::bigint AS latest_hearthstone_build, COUNT(*)::bigint AS patch_count FROM hearthstone.patches`),
      client.unsafe(`SELECT n.nspname AS schema, c.relname AS table, c.reltuples::bigint AS estimated_rows, pg_total_relation_size(c.oid)::bigint AS total_bytes FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r', 'm', 'p') AND n.nspname IN ('magic', 'hearthstone') ORDER BY n.nspname, c.relname`),
    ]);
    return {
      database:               serverRows[0],
      connection:             describeConnection(databaseUrl),
      latestHearthstoneBuild: counts[0],
      tableEstimatesAndSizes: tables,
      locality:               'local development server and benchmark client on the same host; PostgreSQL endpoint is local',
      apiPort,
      concurrency:            1,
      cacheMode:              SKIP_API ? 'diagnostic preflight only; no API warmup or sampling' : `warm after EXPLAIN and ${WARMUPS} fixed API warmup rounds; no cache clearing`,
      samples:                SKIP_API ? 0 : SAMPLES,
      warmups:                SKIP_API ? 0 : WARMUPS,
      locale:                 'en',
    };
  } finally {
    await client.end();
  }
}

/** Captures representative read-only plans outside latency sampling. */
async function capturePlans(databaseUrl: string, observations: SqlObservation[]) {
  const representatives = new Map<string, SqlObservation>();
  for (const observation of observations) {
    if (observation.phase !== 'preflight' || !/^\s*select\b/i.test(observation.sql)) continue;
    const key = `${observation.caseId}:${observation.statementIndex}:${observation.sql}:${serialize(observation.params)}`;
    representatives.set(key, observation);
  }

  let selected = [...representatives.values()];
  if (EXPLAIN_LIMIT > 0) {
    selected = [...selected].sort((left, right) => right.durationMs - left.durationMs).slice(0, EXPLAIN_LIMIT);
  }

  const client = postgres(databaseUrl, { max: 1, application_name: 'search-acceleration-benchmark-magic-explain' });
  const plans: Array<Record<string, unknown>> = [];
  try {
    await client.unsafe('BEGIN READ ONLY');
    for (const observation of selected) {
      try {
        const result = await client.unsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${observation.sql}`, observation.params);
        plans.push({
          caseId:         observation.caseId,
          path:           observation.path,
          statementIndex: observation.statementIndex,
          sql:            observation.sql,
          params:         observation.params,
          plan:           result[0]?.['QUERY PLAN'] ?? result,
        });
      } catch (error) {
        plans.push({
          caseId:         observation.caseId,
          path:           observation.path,
          statementIndex: observation.statementIndex,
          sql:            observation.sql,
          params:         observation.params,
          error:          error instanceof Error ? error.message : String(error),
        });
      }
    }
    await client.unsafe('COMMIT');
  } catch (error) {
    await client.unsafe('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
  return plans;
}

/** Preserves raw API samples alongside per-case latency summaries. */
function caseMetrics(samples: Map<string, Array<{ iteration: number, durationMs: number, result: ReturnType<typeof getIdentityRows> }>>) {
  return cases.map(benchmarkCase => {
    const entries = samples.get(benchmarkCase.id) ?? [];
    return {
      caseId:     benchmarkCase.id,
      coverage:   benchmarkCase.coverage,
      metrics:    summarize(entries.map(entry => entry.durationMs)),
      rawSamples: entries,
    };
  });
}

/** Validates cases, samples API latency, and writes diagnostic artifacts. */
async function main() {
  const configuredDatabaseUrl = process.env.DATABASE_URL;
  if (configuredDatabaseUrl == null) throw new Error('DATABASE_URL is missing; run through benchmark:search:pg so scripts/.env is loaded.');
  if (describeConnection(configuredDatabaseUrl).database !== 'local') {
    throw new Error('This runner is locked to the confirmed local PostgreSQL database named local.');
  }
  const parsedDatabaseUrl = new URL(configuredDatabaseUrl);
  if (parsedDatabaseUrl.hostname === 'localhost' || parsedDatabaseUrl.hostname === '::1') {
    parsedDatabaseUrl.hostname = '127.0.0.1';
  }
  const databaseUrl = parsedDatabaseUrl.toString();

  const repoRoot = resolve(import.meta.dirname, '../../..');
  const git = await readGitMetadata(repoRoot);
  const startedAt = new Date().toISOString();
  const api = SKIP_API ? null : await startApi(databaseUrl);
  const instrumented = createInstrumentedDb(databaseUrl);
  const expectedResults = new Map<string, ReturnType<typeof getIdentityRows>>();
  const acceleratedResults = new Map<string, ReturnType<typeof getIdentityRows>>();
  const accelerationPlans = new Map<string, ReturnType<typeof getAccelerationPlan>>();
  const apiPreflight = new Map<string, ReturnType<typeof getIdentityRows>>();
  const apiSamples = new Map<string, Array<{ iteration: number, durationMs: number, result: ReturnType<typeof getIdentityRows> }>>();
  let plans: Array<Record<string, unknown>>;

  const recordContext = async <T>(
    caseId: string,
    path: SqlObservation['path'],
    phase: SqlObservation['phase'],
    iteration: number,
    run: () => Promise<T>,
  ) => {
    currentSqlContext = { caseId, path, phase, iteration };
    currentStatementIndex = 0;
    try {
      return await run();
    } finally {
      currentSqlContext = null;
    }
  };

  try {
    if (api == null) {
      console.log(`Diagnostic mode (BENCH_SKIP_API): one internal preflight per case; no API samples, EXPLAIN limit ${EXPLAIN_LIMIT || 'none'}.`);
    } else {
      console.log(`Magic API ready at ${api.baseUrl}; checking ${cases.length} fixed cases.`);
    }
    for (const benchmarkCase of cases) {
      const apiResult = api == null ? null : await apiSearch(api.baseUrl, benchmarkCase);
      const beforeLegacyCount = sqlObservations.length;
      const legacyResult = await recordContext(
        benchmarkCase.id,
        'legacy-pg',
        'preflight',
        0,
        () => legacyPgSearch(instrumented.db, benchmarkCase),
      );
      if (sqlObservations.length === beforeLegacyCount) throw new Error(`${benchmarkCase.id} executed no legacy PG SQL statements during preflight.`);

      const beforeAcceleratedCount = sqlObservations.length;
      const directResult = await recordContext(
        benchmarkCase.id,
        'search-action',
        'preflight',
        0,
        () => acceleratedSearch(instrumented.db, benchmarkCase),
      );
      if (sqlObservations.length === beforeAcceleratedCount) throw new Error(`${benchmarkCase.id} executed no search-action SQL statements during preflight.`);

      const legacyIdentity = getIdentityRows(legacyResult, benchmarkCase.id);
      const directIdentity = getIdentityRows(directResult, benchmarkCase.id);
      assertSameResult(legacyIdentity, directIdentity, benchmarkCase.id);
      acceleratedResults.set(benchmarkCase.id, directIdentity);
      accelerationPlans.set(benchmarkCase.id, getAccelerationPlan(benchmarkCase));
      if (apiResult != null) {
        const apiIdentity = getIdentityRows(apiResult.result, benchmarkCase.id);
        assertSameResult(apiIdentity, directIdentity, benchmarkCase.id);
        apiPreflight.set(benchmarkCase.id, apiIdentity);
      }
      expectedResults.set(benchmarkCase.id, legacyIdentity);
    }

    plans = await capturePlans(databaseUrl, sqlObservations);

    if (api != null) {
      const apiWarmups = interleavedSchedule(WARMUPS, SEED);
      for (const { benchmarkCase } of apiWarmups) {
        const result = await apiSearch(api.baseUrl, benchmarkCase);
        assertSameResult(expectedResults.get(benchmarkCase.id)!, getIdentityRows(result.result, benchmarkCase.id), benchmarkCase.id);
      }
    }

    if (api != null) {
      for (const { benchmarkCase, iteration } of interleavedSchedule(SAMPLES, SEED)) {
        const result = await apiSearch(api.baseUrl, benchmarkCase);
        const identity = getIdentityRows(result.result, benchmarkCase.id);
        assertSameResult(expectedResults.get(benchmarkCase.id)!, identity, benchmarkCase.id);
        const entries = apiSamples.get(benchmarkCase.id) ?? [];
        entries.push({ iteration, durationMs: result.durationMs, result: identity });
        apiSamples.set(benchmarkCase.id, entries);
        if (iteration === SAMPLES && benchmarkCase.id === cases.at(-1)!.id) console.log('API endpoint measurements complete.');
      }
    }

    const metadata = await collectDatabaseMetadata(databaseUrl, api?.port ?? CONFIGURED_PORT);
    const apiResults = api == null ? [] : caseMetrics(apiSamples);
    const report = {
      schemaVersion: 2,
      game:          GAME,
      startedAt,
      completedAt:   new Date().toISOString(),
      source:        git,
      environment:   {
        runtime:      `Bun ${Bun.version}`,
        platform:     process.platform,
        architecture: process.arch,
        nodeVersion:  process.versions.node,
        database:     metadata,
        measurement:  {
          apiEnabled:        api != null,
          warmups:           api == null ? 0 : WARMUPS,
          samples:           api == null ? 0 : SAMPLES,
          concurrency:       1,
          warmCache:         true,
          seed:              SEED,
          apiInterleaveSeed: SEED,
          sqlCapture:        'one preflight per case for both legacy PG and current search action; diagnostic durations only, no repeated SQL latency sampling',
          percentileNote:    `P95 is exploratory with ${SAMPLES} samples per case; use raw samples and P50 for routine comparisons`,
          sqlTiming:         'benchmark-only Postgres.js unsafe query thenable to resolution, including client driver result decoding; excludes Drizzle response mapping',
          apiTiming:         'external fetch start through response JSON parsing completion',
        },
        latestSemantics: 'Compares the original PG search handler with the current search action; the latter uses its exact accelerated plan or falls back to PG per request.',
      },
      cases,
      preflight: cases.map(benchmarkCase => ({
        caseId:           benchmarkCase.id,
        legacyPgResult:   expectedResults.get(benchmarkCase.id),
        searchAction:     acceleratedResults.get(benchmarkCase.id),
        accelerationPlan: accelerationPlans.get(benchmarkCase.id),
        apiResult:        apiPreflight.get(benchmarkCase.id),
      })),
      measurements: {
        apiEndToEnd: apiResults,
        sqlObservations,
      },
      explainAnalyze: plans,
    };

    await Bun.$`mkdir -p ${OUTPUT_ROOT}`;
    const filename = `magic-pg-baseline-${startedAt.replaceAll(':', '-').replaceAll('.', '-')}.json`;
    const outputPath = resolve(OUTPUT_ROOT, filename);
    await Bun.write(outputPath, serialize(report));

    console.log(`Saved raw baseline artifact: ${outputPath}`);
    for (const item of apiResults) {
      console.log(`API ${item.caseId}: p50=${item.metrics.p50Ms?.toFixed(3)}ms p95=${item.metrics.p95Ms?.toFixed(3)}ms sd=${item.metrics.standardDeviationMs.toFixed(3)}ms n=${item.metrics.samples}`);
    }
    if (api != null) console.log(`P95 is exploratory with ${SAMPLES} samples per case; raw samples are preserved.`);
    for (const item of sqlObservations) {
      console.log(`SQL diagnostic ${item.caseId} #${item.statementIndex}: ${item.durationMs.toFixed(3)}ms (single preflight observation)`);
    }

    const planErrors = plans.filter(plan => plan.error != null);
    if (planErrors.length > 0) throw new Error(`${planErrors.length} EXPLAIN ANALYZE plan(s) failed; raw artifact preserved at ${outputPath}`);
  } finally {
    await instrumented.client.end();
    if (api != null) {
      api.child.kill('SIGTERM');
      await Promise.race([api.child.exited, Bun.sleep(5_000)]);
      if (api.child.exitCode == null) api.child.kill('SIGKILL');
    }
  }
}

await main();
