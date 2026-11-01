import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { nodeSqliteD1Binding } from '#search/server/node-sqlite-d1';
import Parser from '#search/parser';
import { simplify } from '#search/parser/simplify';
import { resolveQueryRequest } from '#search/server/logical';
import { regexCommands } from '#search/server/regex';
import type { CommonServerCommand } from '#search/server/command';
import type { QueryRequest } from '#search/logical';
import { locale } from '@tcg-cards/model/magic/schema/basic';
import { setMagicSearchManifest } from '../server/search/accelerated-adapter';
import type { MagicSearchOptions } from '../server/search/accelerated-adapter';
import { MagicD1SearchAdapter } from '../server/search/d1/adapter';
import * as commands from '../server/search/command-list';

// The approved sampling protocol: concurrency 1, two warmup rounds, twenty
// formal samples per case, fixed-seed interleaved ordering.
const WARMUPS = 2;
const SAMPLES = 20;
const SEED = 0x5eed;
const PAGE_SIZE = 20;
// Resolved from the working directory because bun build rewrites
// import.meta.dirname to the bundle output directory.
const OUTPUT_ROOT = resolve(process.cwd(), '../../.scratch/search-acceleration/benchmark-artifacts');

/** Defines one fixed local query with its search options. */
type LocalCase = {
  id:       string;
  coverage: string;
  q:        string;
  page:     number;
};

// The first eight cases mirror the PG runner set; cases named `local` use
// D1-supported fields so pagination cost is measurable where `type:` is not
// yet covered by the local projection.
const cases: LocalCase[] = [
  { id: 'name', coverage: '名字', q: 'n:"Black Lotus"', page: 1 },
  { id: 'body-text', coverage: '正文', q: 'o:"draw a card"', page: 1 },
  { id: 'cost-attributes', coverage: '费用/属性', q: 'mv=1 c:U', page: 1 },
  { id: 'nested-logic', coverage: '嵌套逻辑', q: 't:creature (c:U|c:B) -mv:0', page: 1 },
  { id: 'rarity-existence-short', coverage: '稀有度存在性', q: 'r~:c', page: 1 },
  { id: 'rarity-existence-long', coverage: '稀有度存在性', q: 'rarity~:common', page: 1 },
  { id: 'rarity-existence-negative', coverage: '稀有度存在性/否定', q: '-r~:c', page: 1 },
  { id: 'rarity-existence-and', coverage: '稀有度存在性/独立见证 AND', q: 'r~:c r~:r', page: 1 },
  { id: 'rarity-existence-or', coverage: '稀有度存在性/OR', q: 'r~:c | r~:r', page: 1 },
  { id: 'ordinary-rarity', coverage: '普通印刷稀有度', q: 'rarity:r', page: 1 },
  { id: 'ambit-local', coverage: 'ambit（本地覆盖变体）', q: 'ambit:primary mv<=20', page: 1 },
  { id: 'pagination-local-first', coverage: '分页/count：首屏（本地覆盖变体）', q: 'mv<=20', page: 1 },
  { id: 'pagination-local-deep', coverage: '分页/count：深页（本地覆盖变体）', q: 'mv<=20', page: 100 },
  { id: 'pagination-empty', coverage: '分页/count：空页', q: 'n:"Black Lotus"', page: 2 },
  { id: 'hard-regex', coverage: '困难查询', q: 'o:/draw.{0,24}card/', page: 1 },
];

/** Records the identity fields compared across repeated requests. */
type ResultIdentity = {
  total:     number;
  page:      number;
  totalPage: number;
  ids:       string[];
  ambit:     string;
};

/** Serializes artifacts deterministically. */
function serialize(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => typeof item === 'bigint' ? item.toString() : item);
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

/** Summarizes latency samples for one case. */
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

/** Shuffles supported cases within each round using a fixed seed. */
function interleavedSchedule(supported: LocalCase[], repetitions: number, seed: number) {
  const random = seededRandom(seed);
  const schedule: Array<{ localCase: LocalCase, iteration: number }> = [];
  for (let iteration = 1; iteration <= repetitions; iteration++) {
    const shuffled = [...supported];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
    }
    for (const localCase of shuffled) schedule.push({ localCase, iteration });
  }
  return schedule;
}

/** Rejects identity drift between repeated executions of one case. */
function assertSameIdentity(expected: ResultIdentity, actual: ResultIdentity, caseId: string) {
  if (serialize(expected) !== serialize(actual)) {
    throw new Error(`${caseId} result changed during the run: expected ${serialize(expected)}, received ${serialize(actual)}`);
  }
}

function readOnlyUri(path: string): string {
  return `${pathToFileURL(resolve(path)).href}?mode=ro`;
}

function readMeta(database: DatabaseSync, schema: 'search_base' | 'search_locale', key: string): string {
  const row = database.prepare(`SELECT value FROM ${schema}.magic_search_meta WHERE key = ?`).get(key);
  if (typeof row?.value !== 'string') {
    throw new Error(`Missing Magic package metadata: ${schema}.${key}`);
  }
  return row.value;
}

function assertPackages(database: DatabaseSync, requestedLocale: string): string {
  const baseVersion = readMeta(database, 'search_base', 'data_version');
  const localeVersion = readMeta(database, 'search_locale', 'data_version');
  if (baseVersion !== localeVersion
    || readMeta(database, 'search_base', 'package_role') !== 'base'
    || readMeta(database, 'search_locale', 'package_role') !== 'locale'
    || readMeta(database, 'search_locale', 'locale') !== requestedLocale) {
    throw new Error('Magic local search packages have mismatched versions, roles, or locale.');
  }
  return baseVersion;
}

function createSearchViews(database: DatabaseSync): void {
  database.exec(`
    CREATE TEMP VIEW magic_search_cards AS SELECT * FROM search_base.magic_search_cards;
    CREATE TEMP VIEW magic_search_card_parts AS SELECT * FROM search_base.magic_search_card_parts;
    CREATE TEMP VIEW magic_search_card_values AS SELECT * FROM search_base.magic_search_card_values;
    CREATE TEMP VIEW magic_search_part_values AS SELECT * FROM search_base.magic_search_part_values;
    CREATE TEMP VIEW magic_search_candidates AS SELECT * FROM search_locale.magic_search_candidates;
    CREATE TEMP VIEW magic_search_card_part_localizations AS SELECT * FROM search_locale.magic_search_card_part_localizations;
    CREATE TEMP VIEW magic_search_meta AS
      SELECT key, value FROM search_base.magic_search_meta
      UNION ALL
      SELECT key, value FROM search_locale.magic_search_meta
      WHERE key NOT IN ('data_version', 'schema_version', 'ready', 'package_role');
  `);
}

/** Extracts the compared identity from one essential local result. */
function getIdentity(result: { result?: Array<{ cardId?: unknown }>, total?: number, page?: number, totalPage?: number, ambit?: string }, caseId: string): ResultIdentity {
  if (!Array.isArray(result.result) || typeof result.total !== 'number') {
    throw new Error(`${caseId} returned an unexpected local result: ${serialize(result).slice(0, 300)}`);
  }
  return {
    total:     result.total,
    page:      result.page ?? 1,
    totalPage: result.totalPage ?? 0,
    ids:       result.result.map(row => typeof row.cardId === 'string' ? row.cardId : ''),
    ambit:     result.ambit ?? '',
  };
}

/** Samples the supported cases and records coverage gaps for the rest. */
async function main(): Promise<void> {
  const [basePath, localePath, requestedLocale] = process.argv.slice(2);
  if (basePath == null || localePath == null || requestedLocale == null) {
    throw new Error('Usage: benchmark:search:local <base.sqlite> <locale.sqlite> <locale>');
  }
  if (!locale.options.includes(requestedLocale as (typeof locale.options)[number])) {
    throw new Error(`Unsupported Magic locale: ${requestedLocale}`);
  }

  const database = new DatabaseSync(':memory:');
  const adapter = new MagicD1SearchAdapter();
  const runStartedAt = new Date().toISOString();
  try {
    database.prepare('ATTACH DATABASE ? AS search_locale').run(readOnlyUri(localePath));
    database.prepare('ATTACH DATABASE ? AS search_base').run(readOnlyUri(basePath));
    const dataVersion = assertPackages(database, requestedLocale);
    createSearchViews(database);
    database.exec('PRAGMA query_only = ON');

    // Unpublished exports carry no release identity; the user approved an
    // empty releaseHash here (matching the packages' empty release_hash) so
    // the local entry can be measured before ticket 13 wires the installer.
    setMagicSearchManifest({ dataVersion, releaseHash: '', typeSymbols: [], tagOwners: {} });
    const rssAfterAttach = process.memoryUsage().rss;

    const options = (localCase: LocalCase): MagicSearchOptions => ({
      dsl:      localCase.q,
      lang:     requestedLocale as MagicSearchOptions['lang'],
      page:     localCase.page,
      pageSize: PAGE_SIZE,
      groupBy:  'card',
      orderBy:  'id+',
      d1:       nodeSqliteD1Binding(database) as MagicSearchOptions['d1'],
    });
    const buildRequest = (localCase: LocalCase): QueryRequest => resolveQueryRequest(
      simplify(new Parser(localCase.q).parse()),
      Object.values(commands) as CommonServerCommand[],
      {
        group:    'card',
        sort:     [{ kind: 'request', field: 'order', value: 'id+' }],
        lang:     requestedLocale,
        page:     localCase.page,
        pageSize: PAGE_SIZE,
      },
    );
    const execute = (localCase: LocalCase) => adapter.executeEssentialLocal(buildRequest(localCase), options(localCase), {
      base:   'search_base',
      locale: 'search_locale',
    });

    const caseResults: Array<Record<string, unknown>> = [];
    const supported: LocalCase[] = [];
    for (const localCase of cases) {
      try {
        if (regexCommands(buildRequest(localCase).filter).length > 0) {
          caseResults.push({ caseId: localCase.id, coverage: localCase.coverage, status: 'unsupported', reason: 'Local regex matching is not enabled until its text capability scope is approved.' });
          continue;
        }
        const plan = adapter.plan(buildRequest(localCase));
        if (plan.type !== 'exact') {
          caseResults.push({
            caseId:   localCase.id,
            coverage: localCase.coverage,
            status:   'unsupported',
            reason:   plan.type === 'candidate' ? plan.uncovered : plan.reason,
          });
          continue;
        }
        const expected = getIdentity(await execute(localCase), localCase.id);
        caseResults.push({ caseId: localCase.id, coverage: localCase.coverage, status: 'exact', preflight: expected });
        supported.push(localCase);
      } catch (error) {
        caseResults.push({
          caseId:   localCase.id,
          coverage: localCase.coverage,
          status:   'unsupported',
          reason:   error instanceof Error ? error.message : String(error),
        });
      }
    }

    const samples = new Map<string, Array<{ iteration: number, durationMs: number, identity: ResultIdentity }>>();
    for (const { localCase, iteration } of interleavedSchedule(supported, WARMUPS, SEED)) {
      assertSameIdentity(caseResults.find(entry => entry.caseId === localCase.id)!.preflight as ResultIdentity, getIdentity(await execute(localCase), localCase.id), localCase.id);
      void iteration;
    }
    for (const { localCase, iteration } of interleavedSchedule(supported, SAMPLES, SEED)) {
      const startedAt = performance.now();
      const identity = getIdentity(await execute(localCase), localCase.id);
      const durationMs = performance.now() - startedAt;
      assertSameIdentity(caseResults.find(entry => entry.caseId === localCase.id)!.preflight as ResultIdentity, identity, localCase.id);
      const entries = samples.get(localCase.id) ?? [];
      entries.push({ iteration, durationMs, identity });
      samples.set(localCase.id, entries);
    }

    for (const localCase of supported) {
      const entries = samples.get(localCase.id) ?? [];
      caseResults.find(entry => entry.caseId === localCase.id)!.metrics = summarize(entries.map(entry => entry.durationMs));
      caseResults.find(entry => entry.caseId === localCase.id)!.rawSamples = entries;
    }

    const baseBytes = (await stat(basePath)).size;
    const localeBytes = (await stat(localePath)).size;
    const report = {
      schemaVersion: 1,
      game:          'magic',
      startedAt:     runStartedAt,
      completedAt:   new Date().toISOString(),
      locale:        requestedLocale,
      dataVersion,
      packages:      { base: { path: resolve(basePath), bytes: baseBytes }, locale: { path: resolve(localePath), bytes: localeBytes } },
      environment:   {
        runtime:                     `Node ${process.version}`,
        platform:                    process.platform,
        architecture:                process.arch,
        sqliteAttached:              true,
        memoryRssAfterAttachBytes:   rssAfterAttach,
        memoryRssAfterSamplingBytes: process.memoryUsage().rss,
      },
      measurement: {
        warmups:        WARMUPS,
        samples:        SAMPLES,
        concurrency:    1,
        warmCache:      true,
        seed:           SEED,
        timing:         'adapter executeEssentialLocal call from request compile through essential result mapping; excludes process start and ATTACH',
        percentileNote: `P95 is exploratory with ${SAMPLES} samples per case`,
      },
      cases: caseResults,
    };

    const startedIso = report.startedAt.replaceAll(':', '-').replaceAll('.', '-');
    const outputPath = resolve(OUTPUT_ROOT, `magic-local-${requestedLocale}-${startedIso}.json`);
    await mkdir(OUTPUT_ROOT, { recursive: true });
    await writeFile(outputPath, `${serialize(report)}\n`, 'utf8');
    console.log(`Saved local benchmark artifact: ${outputPath}`);
    for (const entry of caseResults) {
      const metrics = entry.metrics as { p50Ms: number | null, p95Ms: number | null, samples: number } | undefined;
      console.log(`${entry.status === 'exact' ? 'exact' : 'unsupported'} ${entry.caseId}${metrics != null ? `: p50=${metrics.p50Ms?.toFixed(2)}ms p95=${metrics.p95Ms?.toFixed(2)}ms n=${metrics.samples}` : ''}`);
    }
  } finally {
    setMagicSearchManifest(null);
    database.close();
  }
}

await main();
