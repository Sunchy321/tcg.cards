import { resolve } from 'node:path';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { deriveMagicNamePinyin } from '../src/lib/magic/project/pinyin';
import { rebuildMagicSearchData } from '../src/lib/magic/project/search-data';

const sampleCount = 20;
const warmupCount = 2;
const randomSeed = 20261031;

/** Describes one deterministic pinyin query against a projected search field. */
type SearchCase = {
  id:     string;
  column: 'name_pinyin' | 'name_initials';
  query:  string;
  mode:   'exact' | 'prefix' | 'contains';
};

/** Distinguishes recomputation from lookup in the search projection. */
type SearchPath = 'reference' | 'projection';

/** Restricts this benchmark runner to the documented local database. */
function localDatabaseUrl(configuredUrl: string) {
  const url = new URL(configuredUrl);
  if (url.pathname !== '/local' || url.port !== '5432') {
    throw new Error('This pinyin benchmark is locked to localhost:5432/local.');
  }
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error('This pinyin benchmark refuses non-local database hosts.');
  }
  url.hostname = '127.0.0.1';
  return url.toString();
}

/** Builds the PostgreSQL pattern for one exact, prefix, or substring case. */
function queryPattern(searchCase: SearchCase) {
  const escaped = searchCase.query.replace(/[%_]/g, '\\$&');
  return searchCase.mode === 'exact'
    ? escaped
    : searchCase.mode === 'prefix'
      ? `${escaped}%`
      : `%${escaped}%`;
}

/** Returns the nearest-rank percentile for a sample set. */
function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? 0;
}

/** Shuffles one array with a stable seed for repeatable interleaving. */
function shuffle<T>(values: T[], nextRandom: () => number): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = Math.floor(nextRandom() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other]!, shuffled[index]!];
  }
  return shuffled;
}

/** Derives stable per-card identities for result equivalence checks. */
function identity(row: { card_id: string, version: string }) {
  return JSON.stringify([row.card_id, row.version]);
}

const configuredUrl = process.env.DATABASE_URL;
if (configuredUrl == null) throw new Error('DATABASE_URL is missing; load ../../scripts/.env.');

const databaseUrl = localDatabaseUrl(configuredUrl);
const client = postgres(databaseUrl, { max: 1, connect_timeout: 5 });
const database = drizzle({ client });
const artifactRoot = resolve(import.meta.dir, '../../../.scratch/search-acceleration/benchmark-artifacts');

try {
  const [databaseTarget] = await client.unsafe<{ database_name: string }[]>('SELECT current_database() AS database_name');
  if (databaseTarget?.database_name !== 'local') {
    throw new Error('Refusing to benchmark because PostgreSQL did not connect to the local database.');
  }

  const [relations] = await client.unsafe<{ cards: string | null, parts: string | null, localizations: string | null }[]>(`
    SELECT
      to_regclass('magic.search_cards')::text AS cards,
      to_regclass('magic.search_card_parts')::text AS parts,
      to_regclass('magic.search_card_part_localizations')::text AS localizations
  `);
  if (relations?.cards == null || relations.parts == null || relations.localizations == null) {
    throw new Error('The local Magic search projection is incomplete; no schema changes were made.');
  }

  const existingColumns = await client.unsafe<{ column_name: string, udt_name: string, is_nullable: string }[]>(`
    SELECT column_name, udt_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'magic'
      AND table_name = 'search_cards'
      AND column_name IN ('name_pinyin', 'name_initials')
  `);
  for (const column of existingColumns) {
    if (column.udt_name !== '_text' || column.is_nullable !== 'NO') {
      throw new Error(`Existing search_cards.${column.column_name} must be a NOT NULL text[] column.`);
    }
  }

  const existing = new Set(existingColumns.map(column => column.column_name));
  const columnSetupStartedAt = performance.now();
  if (!existing.has('name_pinyin')) {
    await client.unsafe('ALTER TABLE magic.search_cards ADD COLUMN name_pinyin text[] NOT NULL DEFAULT ARRAY[]::text[]');
  }
  if (!existing.has('name_initials')) {
    await client.unsafe('ALTER TABLE magic.search_cards ADD COLUMN name_initials text[] NOT NULL DEFAULT ARRAY[]::text[]');
  }
  const columnSetupDurationMs = performance.now() - columnSetupStartedAt;

  const rebuildStartedAt = performance.now();
  await rebuildMagicSearchData(database);
  const rebuildDurationMs = performance.now() - rebuildStartedAt;

  const localizedNames = await client.unsafe<{ card_id: string, version: string, locale: 'zhs' | 'zht', name: string }[]>(`
    SELECT l.card_id, l.version, l.locale::text AS locale, l.loc_name AS name
    FROM magic.card_localizations l
    JOIN magic.cards c ON c.card_id = l.card_id AND c.version = l.version
    WHERE l.deleted_at IS NULL
      AND c.deleted_at IS NULL
      AND l.locale IN ('zhs'::magic.locale, 'zht'::magic.locale)
    ORDER BY l.card_id, l.version, l.locale, l.source
  `);
  const targetIndex = localizedNames.length === 0 ? -1 : randomSeed % localizedNames.length;
  let target: { full: string, initials: string } | undefined;
  for (let offset = 0; offset < localizedNames.length; offset++) {
    const row = localizedNames[(targetIndex + offset) % localizedNames.length]!;
    const derived = deriveMagicNamePinyin(row.name, row.locale);
    if (derived.full.length >= 8 && derived.initials.length >= 2) {
      target = { full: derived.full, initials: derived.initials };
      break;
    }
  }
  if (target == null) throw new Error('The local snapshot has no suitable active zhs/zht name for a pinyin benchmark.');

  const containsStart = Math.max(3, Math.floor((target.full.length - 3) / 2));
  const cases: SearchCase[] = [
    { id: 'full-exact', column: 'name_pinyin', query: target.full, mode: 'exact' },
    { id: 'full-prefix', column: 'name_pinyin', query: target.full.slice(0, 3), mode: 'prefix' },
    { id: 'full-contains', column: 'name_pinyin', query: target.full.slice(containsStart, containsStart + 3), mode: 'contains' },
    { id: 'initials-contains', column: 'name_initials', query: target.initials.slice(0, 2), mode: 'contains' },
  ];

  /** Recomputes pinyin from active source names for the reference path. */
  async function referenceMatches(searchCase: SearchCase) {
    const rows = await client.unsafe<{ card_id: string, version: string, locale: 'zhs' | 'zht', name: string }[]>(`
      SELECT l.card_id, l.version, l.locale::text AS locale, l.loc_name AS name
      FROM magic.card_localizations l
      JOIN magic.cards c ON c.card_id = l.card_id AND c.version = l.version
      WHERE l.deleted_at IS NULL
        AND c.deleted_at IS NULL
        AND l.locale IN ('zhs'::magic.locale, 'zht'::magic.locale)
    `);
    const matches = new Set<string>();
    for (const row of rows) {
      const derived = deriveMagicNamePinyin(row.name, row.locale);
      const value = searchCase.column === 'name_pinyin' ? derived.full : derived.initials;
      const matched = searchCase.mode === 'exact'
        ? value === searchCase.query
        : searchCase.mode === 'prefix'
          ? value.startsWith(searchCase.query)
          : value.includes(searchCase.query);
      if (matched) matches.add(identity(row));
    }
    return matches;
  }

  /** Reads matching card identities from the generated search projection. */
  async function projectionMatches(searchCase: SearchCase) {
    const rows = await client.unsafe<{ card_id: string, version: string }[]>(`
      SELECT s.card_id, s.version
      FROM magic.search_cards s
      WHERE s.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM unnest(s.${searchCase.column}) AS pinyin(value)
          WHERE pinyin.value ILIKE $1
        )
    `, [queryPattern(searchCase)]);
    return new Set(rows.map(identity));
  }

  const correctness = [];
  for (const searchCase of cases) {
    const [reference, projection] = await Promise.all([
      referenceMatches(searchCase),
      projectionMatches(searchCase),
    ]);
    const onlyReference = [...reference].filter(key => !projection.has(key)).slice(0, 10);
    const onlyProjection = [...projection].filter(key => !reference.has(key)).slice(0, 10);
    correctness.push({
      caseId:       searchCase.id,
      matchedCards: reference.size,
      equivalent:   onlyReference.length === 0 && onlyProjection.length === 0,
      onlyReference,
      onlyProjection,
    });
  }
  if (correctness.some(result => !result.equivalent)) {
    const mismatchPath = resolve(artifactRoot, `magic-pinyin-correctness-${new Date().toISOString().replaceAll(':', '-')}.json`);
    await Bun.write(mismatchPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      dataset:     { activeLocalizedNames: localizedNames.length },
      cases,
      correctness,
    }, null, 2));
    throw new Error(`Pinyin reference and projection results differ: ${JSON.stringify(correctness)}`);
  }

  const timings: { caseId: string, path: SearchPath, iteration: number, elapsedMs: number }[] = [];
  /** Measures one sequential reference or projection query. */
  const execute = async (phase: 'warmup' | 'sample', searchCase: SearchCase, path: SearchPath, iteration: number) => {
    const startedAt = performance.now();
    if (path === 'reference') await referenceMatches(searchCase);
    else await projectionMatches(searchCase);
    const elapsedMs = performance.now() - startedAt;
    if (phase === 'sample') timings.push({ caseId: searchCase.id, path, iteration, elapsedMs });
  };

  let seed = randomSeed;
  const nextRandom = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  for (const searchCase of cases) {
    for (let iteration = 0; iteration < warmupCount; iteration++) {
      for (const path of shuffle<SearchPath>(['reference', 'projection'], nextRandom)) {
        await execute('warmup', searchCase, path, iteration);
      }
    }
  }
  for (let iteration = 0; iteration < sampleCount; iteration++) {
    for (const searchCase of shuffle(cases, nextRandom)) {
      for (const path of shuffle<SearchPath>(['reference', 'projection'], nextRandom)) {
        await execute('sample', searchCase, path, iteration);
      }
    }
  }

  const [metadata] = await client.unsafe<{ [key: string]: string }[]>(`
    SELECT version() AS postgres_version,
      count(*)::text AS active_search_cards,
      COALESCE(sum(pg_column_size(name_pinyin)), 0)::text AS pinyin_field_bytes,
      COALESCE(sum(pg_column_size(name_initials)), 0)::text AS initials_field_bytes,
      COALESCE(sum(pg_column_size(name_pinyin) + pg_column_size(name_initials)), 0)::text AS derived_field_bytes,
      pg_total_relation_size('magic.search_cards')::text AS search_cards_total_bytes
    FROM magic.search_cards
    WHERE deleted_at IS NULL
  `);
  const explain = await client.unsafe(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT s.card_id, s.version
      FROM magic.search_cards s
      WHERE s.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM unnest(s.name_pinyin) AS pinyin(value)
          WHERE pinyin.value ILIKE $1
        )`,
    [queryPattern(cases[2]!)],
  );

  const summary = cases.map(searchCase => {
    const stats = (path: SearchPath) => {
      const values = timings
        .filter(item => item.caseId === searchCase.id && item.path === path)
        .map(item => item.elapsedMs);
      return {
        samples: values.length,
        p50Ms:   percentile(values, 0.5),
        p95Ms:   percentile(values, 0.95),
        minMs:   Math.min(...values),
        maxMs:   Math.max(...values),
      };
    };
    return { caseId: searchCase.id, mode: searchCase.mode, path: { reference: stats('reference'), projection: stats('projection') } };
  });

  const timestamp = new Date().toISOString().replaceAll(':', '-');
  const jsonPath = resolve(artifactRoot, `magic-pinyin-search-${timestamp}.json`);
  const reportPath = resolve(artifactRoot, `magic-pinyin-search-report-${timestamp}.md`);
  const evidence = {
    generatedAt: new Date().toISOString(),
    environment: { database: 'local', postgresVersion: metadata?.postgres_version, concurrency: 1, warmups: warmupCount, samples: sampleCount, randomSeed },
    dataset:     { activeLocalizedNames: localizedNames.length, activeSearchCards: Number(metadata?.active_search_cards) },
    correctness,
    columnSetupDurationMs,
    rebuildDurationMs,
    storage:     {
      pinyinFieldBytes:      Number(metadata?.pinyin_field_bytes),
      initialsFieldBytes:    Number(metadata?.initials_field_bytes),
      derivedFieldBytes:     Number(metadata?.derived_field_bytes),
      searchCardsTotalBytes: Number(metadata?.search_cards_total_bytes),
      note:                  'Derived field bytes are pg_column_size totals; table bytes include the full search_cards table and its existing indexes, not a before/after delta.',
    },
    cases,
    timings:           { summary, samples: timings },
    projectionExplain: explain[0]?.['QUERY PLAN'] ?? explain,
  };
  await Bun.write(jsonPath, JSON.stringify(evidence, null, 2));
  await Bun.write(reportPath, [
    '# 万智牌拼音搜索参考对照',
    '',
    `- 生成时间：${evidence.generatedAt}`,
    `- 数据库：本地 PostgreSQL；版本：${metadata?.postgres_version}`,
    `- 名称行：${localizedNames.length}；加速卡行：${metadata?.active_search_cards}`,
    `- 并发：1；预热：每路径每案例 ${warmupCount} 次；正式样本：每路径每案例 ${sampleCount} 次；固定种子：${randomSeed}`,
    `- 结果身份集合一致：${correctness.every(result => result.equivalent) ? '是' : '否'}`,
    `- 本地字段准备耗时：${columnSetupDurationMs.toFixed(2)} ms（只统计缺失列的实际添加）`,
    `- 完整搜索投影重建耗时：${rebuildDurationMs.toFixed(2)} ms（包括拼音派生）`,
    `- 派生字段 payload：${metadata?.derived_field_bytes} bytes（`
    + `全拼 ${metadata?.pinyin_field_bytes} bytes，首字母 ${metadata?.initials_field_bytes} bytes）`,
    `- search_cards 总大小：${metadata?.search_cards_total_bytes} bytes；该值包含整张表及现有索引，不是新增差值。`,
    '',
    '| 案例 | 直接参考 P50/P95 (ms) | 加速投影 P50/P95 (ms) |',
    '| --- | ---: | ---: |',
    ...summary.map(row => `| ${row.caseId} | ${row.path.reference.p50Ms.toFixed(2)} / ${row.path.reference.p95Ms.toFixed(2)} | ${row.path.projection.p50Ms.toFixed(2)} / ${row.path.projection.p95Ms.toFixed(2)} |`),
    '',
    '参考路径每次从活动卡牌本地化表读取 zhs/zht 名称，并在应用端重新生成拼音；投影路径在实际 `magic.search_cards` 上用数组子串匹配。两者使用同一数据快照与拼音函数。本报告是新能力的结构对照，不作为旧生产功能的加速倍数。P95 基于每案例 20 个样本，仅作探索性观察。',
    '',
    `原始样本与 EXPLAIN：\`${jsonPath}\``,
  ].join('\n'));
  console.log(`Pinyin search benchmark complete. Report: ${reportPath}`);
} finally {
  await client.end();
}
