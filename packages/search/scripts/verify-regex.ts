import { file, write } from 'bun';
import { Database } from 'bun:sqlite';
import { PgDialect, pgTable, text as pgText } from 'drizzle-orm/pg-core';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { text } from '../src/server/command/builtin/text';
import { analyzeRegex, pgRegexSource } from '../src/regex';
import type { TextCondition } from '../src/regex';
import { compileTextCondition } from '../src/server/regex';

const patterns = [
  'draw', 'draw|discard', '(draw|discard) card', 'draw.*card', 'draw.*?card',
  '(draw)?card', '(draw)*card', '(draw)+card', '(draw){0,2}card', '(draw){2,3}card',
  'draw?', '(draw|)card?', '^draw$', 'draw$|^card', 'draw\\|card', '100%_',
  '[a-z]draw', '\\bdraw', '(?=draw)draw', '(draw).*\\1', '.*',
];
const values = [null, '', 'draw', 'DRAW', 'discard', 'draw card', 'card before draw',
  'draw\ncard', 'draw\ndraw', 'drawdrawcard', 'car', 'dra', 'draw|card', '100%_',
  '100xy', 'redraw', 'draw K card', '抽牌', 'ſdraw', 'draw\rcard'];
const column = pgTable('probe', { value: pgText('value') }).value;
const pg = new PgDialect();
const sqliteDialect = new SQLiteSyncDialect();

/** Quotes only controlled probe data for a standalone read-only psql script. */
function literal(value: unknown): string {
  return value == null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll('\'', '\'\'')}'`;
}

/** Renders the actual PG text handler with its bound values for replay through psql. */
function inline(query: SQL): string {
  const compiled = pg.sqlToQuery(query);
  return compiled.sql.replace(/\$(\d+)/g, (_, index) => literal(compiled.params[Number(index) - 1]));
}

/** Compiles necessary facts to PG solely for measuring prefilter overhead on the real corpus. */
function pgCondition(condition: TextCondition): SQL {
  if (condition.kind === 'contains') {
    const escaped = condition.value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
    return sql`text ILIKE ${`%${escaped}%`}`;
  }
  return sql`(${sql.join(condition.exprs.map(pgCondition), sql.raw(condition.kind === 'and' ? ' AND ' : ' OR '))})`;
}

/** Parses successive JSON objects and EXPLAIN arrays despite psql's multiline JSON formatting. */
function jsonValues(input: string): unknown[] {
  const result: unknown[] = [];
  let start = -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index]!;
    if (quoted) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        quoted = false;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    }
    if (char === '{' || char === '[') {
      if (depth++ === 0) {
        start = index;
      }
    }
    if (char === '}' || char === ']') {
      if (--depth === 0) {
        result.push(JSON.parse(input.slice(start, index + 1)));
      }
    }
  }
  return result;
}

const mode = process.argv[2];
const path = process.argv[3];
if (path == null || !['--sql', '--verify'].includes(mode ?? '')) {
  throw new Error('Use --sql <output.sql> or --verify <psql-output> [report.json].');
}
if (mode === '--sql') {
  const lines = ['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;', 'SET LOCAL statement_timeout = \'30s\';',
    'SELECT json_build_object(\'server\', version(), \'database\', current_database(), \'collation\', datcollate) FROM pg_database WHERE datname = current_database();'];
  let id = 0;
  for (const source of patterns) {
    for (const operator of [':', '='] as const) {
      for (const multiline of [false, true]) {
        const predicate = text.call({ column: () => column, args: { value: new RegExp(source), operator, qualifier: [] }, ctx: { table: {}, meta: { multiline } } });
        lines.push(`SELECT json_build_object('probe', ${id++}, 'results', json_agg(${inline(predicate)})) FROM (VALUES ${values.map(value => `(${literal(value)}::text)`).join(',')}) AS probe(value);`);
      }
    }
  }
  const workloads = ['draw', 'draw|discard', 'draw.*card', 'damage.*minion', '^a', 'zzzz.*card', '[a-z]draw'].map(source => {
    const analysis = analyzeRegex(source);
    const predicate = inline(sql`regexp_like(text, ${pgRegexSource(source)}, 'mi')`);
    const candidate = analysis.type === 'original' ? 'TRUE' : inline(pgCondition(analysis.condition));
    lines.push(`SELECT json_build_object('benchmark', ${literal(source)}, 'type', ${literal(analysis.type)}, 'rows', count(*), 'asciiRows', count(*) FILTER (WHERE text !~ '[^\\x01-\\x7f]'), 'candidates', count(*) FILTER (WHERE ${candidate}), 'matches', count(*) FILTER (WHERE ${predicate}), 'misses', count(*) FILTER (WHERE (${predicate}) AND NOT (${candidate}))) FROM hearthstone.search_card_localizations WHERE deleted_at IS NULL AND lang = 'en';`);
    return { source, analysis, predicate, candidate };
  });
  let seed = 20261101;
  // Two warmup rounds precede twenty measured rounds; the seed fixes workload interleaving.
  for (let round = 0; round < 22; round++) {
    const shuffled = [...workloads];
    for (let index = shuffled.length - 1; index > 0; index--) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const other = seed % (index + 1);
      [shuffled[index], shuffled[other]] = [shuffled[other]!, shuffled[index]!];
    }
    for (const { source, analysis, predicate, candidate } of shuffled) {
      const optimized = analysis.type === 'exact' ? 'converted' : analysis.type === 'candidate' ? 'prefilter' : 'control';
      for (const route of round % 2 === 0 ? ['pg', optimized] : [optimized, 'pg']) {
        const where = route === 'pg' || analysis.type === 'original'
          ? predicate
          : analysis.type === 'exact' ? candidate : `(${candidate}) AND (${predicate})`;
        lines.push(`SELECT json_build_object('sample', ${literal(source)}, 'round', ${round}, 'route', ${literal(route)});`);
        lines.push(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON, TIMING OFF) SELECT count(*) FROM hearthstone.search_card_localizations WHERE deleted_at IS NULL AND lang = 'en' AND (${where});`);
      }
    }
  }
  lines.push('ROLLBACK;');
  await write(path, lines.join('\n') + '\n');
} else {
  const rows = jsonValues(await file(path).text()) as Array<Record<string, unknown>>;
  const sqlite = new Database(':memory:');
  let probes = 0;
  let checked = 0;
  let exact = 0;
  let candidate = 0;
  let previous: Record<string, unknown> | undefined;
  const samples: Record<string, Record<string, number[]>> = {};
  const benchmarks: unknown[] = [];
  for (const row of rows) {
    if (row.probe != null) {
      const index = Number(row.probe);
      const source = patterns[Math.floor(index / 4)]!;
      const operator = index % 4 < 2 ? ':' : '=';
      const analysis = analyzeRegex(source);
      probes += values.length;
      if (analysis.type === 'original') {
        continue;
      }
      const isExact = analysis.type === 'exact' && operator === ':';
      for (let offset = 0; offset < values.length; offset++) {
        const value = values[offset];
        // eslint-disable-next-line no-control-regex -- Exclude control bytes outside the certified ASCII corpus.
        if (value != null && /[^\x01-\x7f]/.test(value)) {
          continue;
        }
        const query = sqliteDialect.sqlToQuery(compileTextCondition(analysis.condition, sql`${value}`));
        const result = sqlite.query(`SELECT ${query.sql}`).values(...query.params as never[])[0]![0];
        const expected = (row.results as Array<boolean | null>)[offset];
        if ((isExact && result !== (expected == null ? null : Number(expected))) || (expected === true && result !== 1)) {
          throw new Error(`Mismatch: ${JSON.stringify({ source, operator, value, result, expected })}`);
        }
        checked++;
        if (isExact) {
          exact++;
        } else {
          candidate++;
        }
      }
    } else if (row.benchmark != null) {
      if (Number(row.misses) !== 0) {
        throw new Error('Real corpus candidate false negative.');
      }
      benchmarks.push(row);
    } else if (row.sample != null) {
      previous = row;
    } else if (Array.isArray(row) && previous != null) {
      if (Number(previous.round) >= 2) {
        const routes = samples[String(previous.sample)] ??= {};
        (routes[String(previous.route)] ??= []).push(Number(row[0]['Execution Time']));
      }
      previous = undefined;
    }
  }
  sqlite.close();
  /** Returns empirical percentiles without inventing interpolation or traffic weights. */
  const percentile = (values: number[], fraction: number): number => [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1]!;
  const report = { environment: rows[0], probes, checked, exact, candidate, benchmarks,
    samples, timing:      Object.fromEntries(Object.entries(samples).map(([source, routes]) => [source,
      Object.fromEntries(Object.entries(routes).map(([route, values]) => [route, { n: values.length, p50: percentile(values, 0.5), p95: percentile(values, 0.95) }]))])),
    limits: 'PG SQL timings only; prefilter runs in PG. Production D1 requires whole-source ASCII evidence and may fall back. No remote D1 or API performance claim.',
  };
  if (probes !== patterns.length * 4 * values.length || Object.keys(samples).length !== 7
    || Object.values(samples).some(routes => Object.keys(routes).length !== 2 || Object.values(routes).some(values => values.length !== 20))) {
    throw new Error('Incomplete reference or benchmark output.');
  }
  await write(process.argv[4] ?? `${path}.report.json`, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ probes, checked, exact, candidate, timing: report.timing }) + '\n');
}
