import { resolve } from 'node:path';

import { runWithDb } from '@tcg-cards/db/db';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { search } from '../server/search/index.ts';
import { refreshMagicSearchManifest } from '../server/search/accelerated-adapter';

// Ticket 04 carryover measurement requested for ticket 14: application-side
// phase timing and a CPU profile for the Magic PG search path. Segmentation
// records planning, whole-action and per-statement SQL durations so the
// non-SQL application share is visible; the CPU profile is produced by
// running this bundle under `node --cpu-prof` (see package.json script).

const WARMUP_ROUNDS = 3;
const SAMPLED_ROUNDS = Number(process.env.BENCH_PROFILE_ROUNDS ?? 20);
// Resolved from the working directory because bun build rewrites
// import.meta.dirname to the bundle output directory.
const OUTPUT_ROOT = resolve(process.cwd(), '../../.scratch/search-acceleration/benchmark-artifacts');

type ProfileCase = { id: string, q: string, page: number };

const cases: ProfileCase[] = [
  { id: 'name', q: 'n:"Black Lotus"', page: 1 },
  { id: 'cost-attributes', q: 'mv=1 c:U', page: 1 },
  { id: 'body-text', q: 'o:"draw a card"', page: 1 },
  { id: 'nested-logic', q: 't:creature (c:U|c:B) -mv:0', page: 1 },
  { id: 'ambit', q: 'ambit:primary t:creature', page: 1 },
  { id: 'pagination-first', q: 't:creature', page: 1 },
  { id: 'pagination-deep', q: 't:creature', page: 100 },
  { id: 'pagination-empty', q: 'n:"Black Lotus"', page: 2 },
  { id: 'hard-regex', q: 'o:/draw.{0,24}card/', page: 1 },
];

/** Records one instrumented SQL round trip. */
type SqlObservation = { caseId: string, statementIndex: number, sql: string, durationMs: number };

let currentCase: string | null = null;
let statementIndex = 0;
const observations: SqlObservation[] = [];

function serialize(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => typeof item === 'bigint' ? item.toString() : item);
}

function withWorkMem(databaseUrl: string): string {
  const workMem = process.env.BENCH_WORK_MEM ?? '1GB';
  const separator = databaseUrl.includes('?') ? '&' : '?';
  return `${databaseUrl}${separator}options=${encodeURIComponent(`-c work_mem=${workMem}`)}`;
}

/** Captures per-statement durations without changing query behavior. */
function createInstrumentedDb(databaseUrl: string) {
  const client = postgres(withWorkMem(databaseUrl), { max: 1, application_name: 'search-app-profile-magic' });
  const unsafe = client.unsafe.bind(client);
  const instrumented = new Proxy(client, {
    get(target, property) {
      if (property === 'unsafe') {
        return (statement: string, params: unknown[] = [], options?: unknown) => {
          const startedAt = performance.now();
          const record = () => {
            if (currentCase == null) return;
            observations.push({ caseId: currentCase, statementIndex: statementIndex++, sql: statement, durationMs: performance.now() - startedAt });
          };
          const query = unsafe(statement, params, options as any);
          return new Proxy(query, {
            get(queryTarget, queryProperty) {
              if (queryProperty === 'then') {
                return (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
                  (queryTarget as any).then(
                    (value: unknown) => {
                      record();
                      return onFulfilled?.(value) ?? value;
                    },
                    (error: unknown) => {
                      record();
                      if (onRejected != null) return onRejected(error);
                      throw error;
                    },
                  );
              }
              const value = Reflect.get(queryTarget, queryProperty, queryTarget);
              return typeof value === 'function' ? value.bind(queryTarget) : value;
            },
          });
        };
      }
      return Reflect.get(target, property, target);
    },
  });
  return { client, db: drizzle({ client: instrumented }) };
}

/** Sums recorded SQL time for one case. */
function sqlSummary(caseId: string) {
  const entries = observations.filter(entry => entry.caseId === caseId);
  return {
    statements:   entries.length,
    sqlMs:        entries.reduce((sum, entry) => sum + entry.durationMs, 0),
    perStatement: entries.map(entry => ({ index: entry.statementIndex, ms: Number(entry.durationMs.toFixed(3)), head: entry.sql.slice(0, 72) })),
  };
}

async function main(): Promise<void> {
  const configured = process.env.DATABASE_URL;
  if (configured == null) throw new Error('DATABASE_URL missing; run through benchmark:search:app-profile.');
  const parsed = new URL(configured);
  if (parsed.hostname === 'localhost' || parsed.hostname === '::1') parsed.hostname = '127.0.0.1';
  const databaseUrl = parsed.toString();

  const instrumented = createInstrumentedDb(databaseUrl);
  const refreshClient = postgres(withWorkMem(databaseUrl), { max: 1, application_name: 'search-app-profile-magic-refresh' });
  const refreshDb = drizzle({ client: refreshClient });

  try {
    await runWithDb(refreshDb, () => refreshMagicSearchManifest());

    const results: Array<Record<string, unknown>> = [];
    for (const profileCase of cases) {
      currentCase = profileCase.id;
      statementIndex = 0;

      for (let round = 0; round < WARMUP_ROUNDS; round++) {
        await runWithDb(instrumented.db, () => search.search('search', profileCase.q, {
          page: profileCase.page, pageSize: 20, lang: 'en', groupBy: 'card', orderBy: 'id+', dsl: profileCase.q,
        }));
      }
      observations.length = 0;
      statementIndex = 0;

      const samples: number[] = [];
      let lastRows: unknown = null;
      for (let round = 0; round < SAMPLED_ROUNDS; round++) {
        const startedAt = performance.now();
        const result = await runWithDb(instrumented.db, () => search.search('search', profileCase.q, {
          page: profileCase.page, pageSize: 20, lang: 'en', groupBy: 'card', orderBy: 'id+', dsl: profileCase.q,
        })) as { result?: { result?: unknown[] } };
        samples.push(performance.now() - startedAt);
        lastRows = result;
      }

      const sql = sqlSummary(profileCase.id);
      const totalMs = samples.reduce((sum, value) => sum + value, 0) / samples.length;
      // SQL durations accumulate across every sampled round; the per-round
      // share is what compares against the mean total.
      const sqlPerRoundMs = sql.sqlMs / SAMPLED_ROUNDS;
      const serialized = JSON.stringify(lastRows);
      const serializationMs = (() => {
        const startedAt = performance.now();
        JSON.stringify(lastRows);
        return performance.now() - startedAt;
      })();

      results.push({
        caseId:        profileCase.id,
        q:             profileCase.q,
        page:          profileCase.page,
        rounds:        SAMPLED_ROUNDS,
        meanTotalMs:   totalMs,
        sql,
        sqlPerRoundMs,
        appNonSqlMs:   totalMs - sqlPerRoundMs,
        serialization: { bytes: serialized.length, ms: serializationMs },
      });
      currentCase = null;
    }

    const report = {
      schemaVersion: 1,
      game:          'magic',
      capturedAt:    new Date().toISOString(),
      purpose:       'Ticket 04 carryover: application-side segmentation for the Magic PG search action (ticket 14)',
      measurement:   {
        warmupRounds:  WARMUP_ROUNDS,
        sampledRounds: SAMPLED_ROUNDS,
        note:          'mean of in-process search.search calls through the instrumented client; SQL durations cover round trips to resolution; appNonSqlMs = meanTotalMs - sqlMs includes planning, compilation, mapping and event-loop overhead',
        workMem:       process.env.BENCH_WORK_MEM ?? '1GB',
      },
      cases: results,
    };

    const outputPath = resolve(OUTPUT_ROOT, 'magic-app-segmentation.json');
    await import('node:fs/promises').then(fs => fs.mkdir(OUTPUT_ROOT, { recursive: true }));
    await import('node:fs/promises').then(fs => fs.writeFile(outputPath, `${serialize(report)}\n`, 'utf8'));
    console.log(`Saved app segmentation artifact: ${outputPath}`);
    for (const entry of results) {
      console.log(`${entry.caseId}: total=${(entry.meanTotalMs as number).toFixed(1)}ms sql/round=${(entry.sqlPerRoundMs as number).toFixed(1)}ms app=${(entry.appNonSqlMs as number).toFixed(1)}ms stmts/round=${((entry.sql as { statements: number }).statements / SAMPLED_ROUNDS).toFixed(1)}`);
    }
  } finally {
    await refreshClient.end();
    await instrumented.client.end();
  }
}

await main();
