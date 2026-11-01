import { createServer } from 'node:net';
import { resolve } from 'node:path';

import { runWithDb } from '@tcg-cards/db/db';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { search } from '../server/search/index.ts';
import { refreshHearthstoneSearchDataset } from '../server/search/accelerated-adapter';

// Bun's fetch honors HTTP(S)_PROXY from the environment, which would route the
// loopback RPC traffic through the developer's proxy; loopback must bypass it.
for (const key of ['NO_PROXY', 'no_proxy']) {
  process.env[key] = [...new Set([...(process.env[key] ?? '').split(',').filter(Boolean), '127.0.0.1', 'localhost'])].join(',');
}

const GAME = 'hearthstone';

// BENCH_* env overrides let a short protocol be requested without editing the
// frozen case fixtures; the defaults use the approved lightweight protocol.
const WARMUPS = Number(process.env.BENCH_WARMUPS ?? 2);
const SAMPLES = Number(process.env.BENCH_SAMPLES ?? 20);
const SKIP_API = process.env.BENCH_SKIP_API === '1';
const EXPLAIN_LIMIT = Number(process.env.BENCH_EXPLAIN_LIMIT ?? 0);
const SEED = 0x5eed;
const PAGE_SIZE = 20;

// The original-path wide sorts spill multi-GB temp files under the default 4MB
// work_mem and the local container no longer has that disk; the user approved a
// session-level override for this run so both compared paths run spill-free.
const WORK_MEM = process.env.BENCH_WORK_MEM ?? '1GB';

/** Appends a session work_mem startup option to a PostgreSQL connection URL. */
function withWorkMem(databaseUrl: string): string {
  const separator = databaseUrl.includes('?') ? '&' : '?';
  return `${databaseUrl}${separator}options=${encodeURIComponent(`-c work_mem=${WORK_MEM}`)}`;
}

// The configured hearthstone site dev port (nuxt.config devServer); the
// benchmark measures the public RPC on that port and never picks another one.
const CONFIGURED_PORT = 3002;
const OUTPUT_ROOT = resolve(import.meta.dirname, '../../../.scratch/search-acceleration/benchmark-artifacts');

/** Defines a fixed query and its public search options. */
type BenchmarkCase = {
  id:       string;
  coverage: string;
  q:        string;
  page:     number;
  pageSize: number;
  lang:     'en';
  orderBy:  string;
};

/** Records one diagnostic SQL round trip during preflight. */
type SqlObservation = {
  caseId:         string;
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
  { id: 'name', coverage: '名字', q: 'n:Fireball', page: 1, pageSize: PAGE_SIZE, lang: 'en', orderBy: 'name+' },
  { id: 'cost-attributes', coverage: '费用/属性', q: 'c:4 a:4 h:5', page: 1, pageSize: PAGE_SIZE, lang: 'en', orderBy: 'name+' },
  { id: 'body-text', coverage: '正文', q: 'x:"deal 3 damage"', page: 1, pageSize: PAGE_SIZE, lang: 'en', orderBy: 'name+' },
  { id: 'nested-logic', coverage: '嵌套逻辑', q: 'type:minion (class:mage|class:warlock) -cost:0', page: 1, pageSize: PAGE_SIZE, lang: 'en', orderBy: 'name+' },
  { id: 'ambit', coverage: 'ambit', q: 'ambit:primary type:minion', page: 1, pageSize: PAGE_SIZE, lang: 'en', orderBy: 'name+' },
  { id: 'pagination-first', coverage: '分页/count：首屏', q: 'type:minion', page: 1, pageSize: PAGE_SIZE, lang: 'en', orderBy: 'name+' },
  { id: 'pagination-deep', coverage: '分页/count：深页', q: 'type:minion', page: 100, pageSize: PAGE_SIZE, lang: 'en', orderBy: 'name+' },
  { id: 'pagination-empty', coverage: '分页/count：空页', q: 'n:Fireball', page: 2, pageSize: PAGE_SIZE, lang: 'en', orderBy: 'name+' },
  { id: 'hard-regex', coverage: '困难查询', q: 'x:/deal.{0,24}damage/', page: 1, pageSize: PAGE_SIZE, lang: 'en', orderBy: 'name+' },
];

let currentSqlContext: Omit<SqlObservation, 'statementIndex' | 'sql' | 'params' | 'durationMs' | 'error'> | null = null;
let currentStatementIndex = 0;
export const sqlObservations: SqlObservation[] = [];

/** Captures one preflight query without turning diagnostics into repeated SQL sampling. */
export async function observeSearchSql<T>(caseId: string, run: () => Promise<T>): Promise<T> {
  currentSqlContext = { caseId, phase: 'preflight', iteration: 0 };
  currentStatementIndex = 0;
  try {
    return await run();
  } finally {
    currentSqlContext = null;
  }
}

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
export function createInstrumentedDb(databaseUrl: string) {
  const client = postgres(withWorkMem(databaseUrl), { max: 1, connection: { application_name: 'search-acceleration-benchmark-hearthstone' } });
  const unsafe = client.unsafe.bind(client);
  const instrumentedClient = new Proxy(client, {
    get(target, property, receiver) {
      if (property === 'unsafe') {
        return (statement: string, params: unknown[] = [], options?: unknown) =>
          instrumentQuery(unsafe(statement, params as never[], options as any), statement, params);
      }
      return Reflect.get(target, property, receiver);
    },
  });

  return { client, db: drizzle({ client: instrumentedClient }) };
}

/** Extracts result identities and pagination; ties in the `name+` order are
 * not a total order, so the compared identity is the sorted page id set while
 * the observed order is preserved for stability reporting. */
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
    sortedIds: [...ids].sort(),
    ambit:     normal.ambit,
  };
}

/** Rejects result changes between entrypoints or repeated requests, comparing
 * the sorted page id set so PostgreSQL tie order does not abort the run. */
function assertSameResult(expected: ReturnType<typeof getIdentityRows>, actual: ReturnType<typeof getIdentityRows>, caseId: string) {
  const key = (identity: ReturnType<typeof getIdentityRows>) => serialize({
    total:     identity.total,
    page:      identity.page,
    totalPage: identity.totalPage,
    ids:       identity.sortedIds,
    ambit:     identity.ambit,
  });

  if (key(expected) !== key(actual)) {
    throw new Error(`${caseId} result changed during the run: expected ${serialize(expected)}, received ${serialize(actual)}`);
  }
}

/** Replays a fixed query with the diagnostic database client. */
async function directSearch(
  database: ReturnType<typeof createInstrumentedDb>['db'],
  refreshDb: ReturnType<typeof drizzle>,
  benchmarkCase: BenchmarkCase,
) {
  // The public RPC handler refreshes the publication dataset before every
  // search; the runner mirrors that per-request behavior on a separate
  // connection so diagnostic SQL capture stays limited to the search itself.
  await runWithDb(refreshDb, () => refreshHearthstoneSearchDataset());
  return runWithDb(database, () => search.search('search', benchmarkCase.q, {
    page:     benchmarkCase.page,
    pageSize: benchmarkCase.pageSize,
    lang:     benchmarkCase.lang,
    orderBy:  benchmarkCase.orderBy,
    dsl:      benchmarkCase.q,
  })) as Promise<SearchResult>;
}

/** Checks that the configured site port is available. */
async function assertPortAvailable(port: number) {
  const probe = createServer();
  try {
    await new Promise<void>((resolveListen, reject) => {
      // Nuxt's ambient net shim omits EventEmitter methods from this Node-only script.
      (probe as unknown as { once(event: 'error', listener: (error: Error) => void): void }).once('error', reject);
      probe.listen(port, '127.0.0.1', () => resolveListen());
    });
  } catch {
    throw new Error(`Configured dev port ${port} is already in use; stop the process holding it before benchmarking.`);
  } finally {
    await new Promise<void>(resolveClose => probe.close(() => resolveClose()));
  }
}

/** Starts the local development API and waits for readiness. */
export async function startApi(databaseUrl: string) {
  const appRoot = resolve(import.meta.dirname, '..');
  await assertPortAvailable(CONFIGURED_PORT);
  const port = CONFIGURED_PORT;
  const child = Bun.spawn(['bun', 'x', 'nuxt', 'dev', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: appRoot,
    env: {
      ...process.env,
      DATABASE_URL:                                             withWorkMem(databaseUrl),
      CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: withWorkMem(databaseUrl),
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
export async function apiSearch(baseUrl: string, benchmarkCase: BenchmarkCase, options: { endpoint?: 'basic' | 'essential', path?: 'original' | 'accelerated' } = {}) {
  const { id: _id, coverage: _coverage, ...input } = benchmarkCase;
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}/rpc/hearthstone/search/${options.endpoint ?? 'basic'}`, {
    method:  'POST',
    signal:  AbortSignal.timeout(120_000),
    headers: { 'content-type': 'application/json', ...(options.path == null ? {} : { 'x-search-benchmark-path': options.path }) },
    body:    JSON.stringify({ json: input }),
  });
  const body = await response.json() as any;
  const durationMs = performance.now() - startedAt;
  if (!response.ok) throw new Error(`API ${benchmarkCase.id} failed (${response.status}): ${serialize(body)}`);
  return { result: body.json ?? body, durationMs };
}

/** Produces reproducible random values for case ordering. */
export function seededRandom(seed: number) {
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
export function summarize(values: number[]) {
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
export async function collectDatabaseMetadata(databaseUrl: string, apiPort: number) {
  const client = postgres(withWorkMem(databaseUrl), { max: 1, connection: { application_name: 'search-acceleration-benchmark-hearthstone-metadata' } });
  try {
    const [serverRows, counts, tables] = await Promise.all([
      client.unsafe(`SELECT current_database() AS database, version() AS version, current_setting('server_version') AS server_version, current_setting('work_mem') AS work_mem, inet_server_addr()::text AS server_address, inet_server_port() AS server_port, current_setting('shared_preload_libraries') AS shared_preload_libraries, current_setting('track_io_timing') AS track_io_timing`),
      client.unsafe(`SELECT MAX(build_number)::bigint AS latest_hearthstone_build, COUNT(*)::bigint AS patch_count FROM hearthstone.patches`),
      client.unsafe(`SELECT n.nspname AS schema, c.relname AS table, c.reltuples::bigint AS estimated_rows, pg_total_relation_size(c.oid)::bigint AS total_bytes FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r', 'm', 'p') AND n.nspname IN ('magic', 'hearthstone') ORDER BY n.nspname, c.relname`),
    ]);
    return {
      database:               serverRows[0],
      connection:             describeConnection(databaseUrl),
      latestHearthstoneBuild: counts[0],
      tableEstimatesAndSizes: tables,
      locality:               'local development server and benchmark client on the same host; PostgreSQL endpoint is local',
      workMemNote:            `session work_mem=${WORK_MEM} approved by the user for this run because the default 4MB spills multi-GB temp files that exceed the remaining container disk; both compared paths use the same setting`,
      apiPort,
      concurrency:            1,
      cacheMode:              `warm after EXPLAIN and ${WARMUPS} fixed API warmup rounds; no cache clearing`,
      samples:                SAMPLES,
      warmups:                WARMUPS,
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

  const client = postgres(withWorkMem(databaseUrl), { max: 1, connection: { application_name: 'search-acceleration-benchmark-hearthstone-explain' } });
  const plans: Array<Record<string, unknown>> = [];
  try {
    await client.unsafe('BEGIN READ ONLY');
    for (const observation of selected) {
      try {
        const result = await client.unsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${observation.sql}`, observation.params as never[]);
        plans.push({
          caseId:         observation.caseId,
          statementIndex: observation.statementIndex,
          sql:            observation.sql,
          params:         observation.params,
          plan:           result[0]?.['QUERY PLAN'] ?? result,
        });
      } catch (error) {
        plans.push({
          caseId:         observation.caseId,
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
      caseId:      benchmarkCase.id,
      coverage:    benchmarkCase.coverage,
      metrics:     summarize(entries.map(entry => entry.durationMs)),
      orderStable: entries.length === 0 || entries.every(entry => serialize(entry.result.ids) === serialize(entries[0]!.result.ids)),
      rawSamples:  entries,
    };
  });
}

/** Validates cases, samples API latency, and writes diagnostic artifacts. */
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl == null) throw new Error('DATABASE_URL is missing; run through benchmark:search:pg so scripts/.env is loaded.');
  if (describeConnection(databaseUrl).database !== 'local') {
    throw new Error('This runner is locked to the confirmed local PostgreSQL database named local.');
  }

  const repoRoot = resolve(import.meta.dirname, '../../..');
  const git = await readGitMetadata(repoRoot);
  const startedAt = new Date().toISOString();
  const api = SKIP_API ? null : await startApi(databaseUrl);
  const instrumented = createInstrumentedDb(databaseUrl);
  const refreshClient = postgres(withWorkMem(databaseUrl), { max: 1, connection: { application_name: 'search-acceleration-benchmark-hearthstone-refresh' } });
  const refreshDb = drizzle({ client: refreshClient });
  const expectedResults = new Map<string, ReturnType<typeof getIdentityRows>>();
  const apiPreflight = new Map<string, ReturnType<typeof getIdentityRows>>();
  const apiSamples = new Map<string, Array<{ iteration: number, durationMs: number, result: ReturnType<typeof getIdentityRows> }>>();
  let plans: Array<Record<string, unknown>>;

  const recordContext = async <T>(caseId: string, phase: SqlObservation['phase'], iteration: number, run: () => Promise<T>) => {
    currentSqlContext = { caseId, phase, iteration };
    currentStatementIndex = 0;
    try {
      return await run();
    } finally {
      currentSqlContext = null;
    }
  };

  try {
    if (api == null) {
      console.log(`Fast mode (BENCH_SKIP_API): in-process SQL path only, ${WARMUPS} warmups, ${SAMPLES} sample(s), EXPLAIN limit ${EXPLAIN_LIMIT || 'none'}.`);
    } else {
      console.log(`Hearthstone API ready at ${api.baseUrl}; checking ${cases.length} fixed cases.`);
    }
    for (const benchmarkCase of cases) {
      const apiResult = api == null ? null : await apiSearch(api.baseUrl, benchmarkCase);
      const beforeCount = sqlObservations.length;
      const directResult = await recordContext(benchmarkCase.id, 'preflight', 0, () => directSearch(instrumented.db, refreshDb, benchmarkCase));
      if (sqlObservations.length === beforeCount) throw new Error(`${benchmarkCase.id} executed no SQL statements during preflight.`);
      const directIdentity = getIdentityRows(directResult, benchmarkCase.id);
      if (apiResult != null) {
        const apiIdentity = getIdentityRows(apiResult.result, benchmarkCase.id);
        assertSameResult(apiIdentity, directIdentity, benchmarkCase.id);
        apiPreflight.set(benchmarkCase.id, apiIdentity);
      }
      expectedResults.set(benchmarkCase.id, directIdentity);
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
    const apiResults = caseMetrics(apiSamples);
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
          warmups:           WARMUPS,
          samples:           SAMPLES,
          concurrency:       1,
          warmCache:         true,
          seed:              SEED,
          apiInterleaveSeed: SEED,
          sqlCapture:        'one in-process preflight per case; diagnostic durations only, no repeated SQL latency sampling',
          percentileNote:    'P95 is exploratory with 20 samples per case; use raw samples and P50 for routine comparisons',
          identityNote:      'Identity compares the sorted page id set: the default name+ order is not total, so PostgreSQL may return tied names in a different physical order between executions; per-case orderStable records whether the observed order was in fact stable.',
          sqlTiming:         'benchmark-only Postgres.js unsafe query thenable to resolution, including client driver result decoding; excludes Drizzle response mapping',
          apiTiming:         'external fetch start through response JSON parsing completion',
        },
        latestSemantics: 'Global maximum hearthstone.patches.build_number, matching current PG search behavior.',
      },
      cases,
      preflight:    cases.map(benchmarkCase => ({ caseId: benchmarkCase.id, result: expectedResults.get(benchmarkCase.id), apiResult: apiPreflight.get(benchmarkCase.id) })),
      measurements: {
        apiEndToEnd: apiResults,
        sqlObservations,
      },
      explainAnalyze: plans,
    };

    await Bun.$`mkdir -p ${OUTPUT_ROOT}`;
    const filename = `hearthstone-pg-baseline-${startedAt.replaceAll(':', '-').replaceAll('.', '-')}.json`;
    const outputPath = resolve(OUTPUT_ROOT, filename);
    await Bun.write(outputPath, serialize(report));

    console.log(`Saved raw baseline artifact: ${outputPath}`);
    for (const item of apiResults) {
      console.log(`API ${item.caseId}: p50=${item.metrics.p50Ms?.toFixed(3)}ms p95=${item.metrics.p95Ms?.toFixed(3)}ms sd=${item.metrics.standardDeviationMs.toFixed(3)}ms n=${item.metrics.samples}`);
    }
    console.log('P95 is exploratory with 20 samples per case; raw samples are preserved.');
    for (const item of sqlObservations) {
      console.log(`SQL diagnostic ${item.caseId} #${item.statementIndex}: ${item.durationMs.toFixed(3)}ms (single preflight observation)`);
    }

    const planErrors = plans.filter(plan => plan.error != null);
    if (planErrors.length > 0) throw new Error(`${planErrors.length} EXPLAIN ANALYZE plan(s) failed; raw artifact preserved at ${outputPath}`);
  } finally {
    await refreshClient.end();
    await instrumented.client.end();
    if (api != null) {
      api.child.kill('SIGTERM');
      await Promise.race([api.child.exited, Bun.sleep(5_000)]);
      if (api.child.exitCode == null) api.child.kill('SIGKILL');
    }
  }
}

if (import.meta.main) {
  await main();
}
