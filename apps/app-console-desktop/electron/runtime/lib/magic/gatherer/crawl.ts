import { and, eq, gte, lte, sql } from 'drizzle-orm';

import { db } from '@tcg-cards/db/db';
import { Gatherer } from '@tcg-cards/db/schema/local/magic';

const CACHE_LEVELS = [7, 30, 60, 180, 365];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

type Db = typeof db;

/** Crawl granularity: which rows to process this run. */
export type CrawlLevel = 'fill' | 'refresh' | 'refresh_all' | 'force';
export const CRAWL_LEVELS: CrawlLevel[] = ['fill', 'refresh', 'refresh_all', 'force'];

/**
 * Per-id crawl outcome, fed into the live progress breakdown.
 *
 * Network-result outcomes (the task actually requested the id this run):
 * - `fetched`   — got card data.
 * - `notFound`  — the request came back 404.
 * - `error`     — the request failed.
 *
 * Database-entry outcomes (the cache is used as-is, no request):
 * - `fresh`        — valid cached data.
 * - `localMissing` — a cached 404.
 *
 * A row belongs to the DB group whenever the task does not re-request it, even
 * if its cache is expired. This split applies to every crawl-type task.
 */
export type CrawlOutcome = 'fresh' | 'localMissing' | 'fetched' | 'notFound' | 'error';

/** Lightweight cache state loaded in bulk for the per-id skip decision. */
export interface CachedRowState {
  hasData:   boolean;
  expiresAt: Date;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Outcome for an already-cached row under the given level, or null when the row
 * should be re-fetched. A cached 404 that the level never re-checks is
 * `localMissing` (fresh or expired); a valid row still within its cache window
 * is `fresh`. `notFound` only ever comes from a 404 re-fetched this run.
 */
function cachedOutcome(row: CachedRowState, level: CrawlLevel, now: Date): CrawlOutcome | null {
  if (level === 'force') return null; // refetch regardless
  // Cached 404s the level never re-checks are "locally missing", fresh or expired.
  if (!row.hasData) {
    if (level === 'refresh' || level === 'fill') return 'localMissing';
    if (row.expiresAt > now) return 'localMissing'; // refresh_all skips fresh rows
    return null; // refresh_all re-checks expired 404s
  }
  // Valid rows:
  if (row.expiresAt > now) return 'fresh'; // still within the cache window
  if (level === 'fill') return 'fresh'; // fill keeps existing rows regardless of expiry
  return null; // expired valid → refetch
}

/** Highest multiverseId across all scryfall cards (upper bound of the crawl range). */
export async function getMaxMultiverseId(database: Db = db): Promise<number> {
  const result = await database.execute(
    sql`SELECT MAX(m) AS max FROM (SELECT unnest(multiverse_ids) AS m FROM magic_data.scryfall_cards) t`,
  );
  const row = result[0] as { max: number | null } | undefined;
  return row?.max ?? 0;
}

function extractJsonObject(str: string, start: number): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < str.length; i++) {
    const c = str[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) return str.slice(start, i + 1);
      }
    }
  }
  return null;
}

/** Extract all CardData payloads from the RSC flight data embedded in the HTML. */
export function extractCardData(html: string): Record<string, unknown>[] {
  const chunks: { id: number, data: string }[] = [];
  const re = /self\.__next_f\.push\(\[(\d+),"((?:[^"\\]|\\.)*)"\]\)/g;
  let m;
  while ((m = re.exec(html)) !== null) chunks.push({ id: Number(m[1]), data: m[2] });
  const decoded = chunks.sort((a, b) => a.id - b.id)
    .map(c => JSON.parse(`"${c.data}"`) as string)
    .join('');

  const cards: Record<string, unknown>[] = [];
  let from = 0;
  while (true) {
    const idx = decoded.indexOf('"kind":"CardData"', from);
    if (idx === -1) break;
    let open = idx;
    while (open >= 0 && decoded[open] !== '{') open--;
    if (open < 0) break;
    const obj = extractJsonObject(decoded, open);
    if (!obj) break;
    try {
      cards.push(JSON.parse(obj) as Record<string, unknown>);
    } catch { /* skip */ }
    from = idx + 1;
  }
  return cards;
}

/** Fetch one card page by multiverseId; returns redirected url + all CardData, or null on 404. */
export async function fetchCard(multiverseId: number): Promise<{ url: string, cards: Record<string, unknown>[] } | null> {
  // Bound the request so a hanging Gatherer response cannot freeze the crawl.
  const res = await fetch(`https://gatherer.wizards.com/Pages/Card/Details.aspx?multiverseid=${multiverseId}`, {
    headers:  { 'User-Agent': UA, 'Accept': 'text/html' },
    redirect: 'follow',
    signal:   AbortSignal.timeout(10000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Gatherer HTTP ${res.status} for ${multiverseId}`);
  // A card page that redirects to the site root means the card is gone: Gatherer
  // serves the search homepage instead of a 404, so treat it as not-found.
  if (new URL(res.url).pathname === '/') return null;
  const html = await res.text();
  const cards = extractCardData(html);
  if (cards.length === 0) throw new Error(`No CardData for ${multiverseId}`);
  return { url: res.url, cards };
}

function nextLevel(currentDays: number): number {
  const idx = CACHE_LEVELS.indexOf(currentDays);
  return CACHE_LEVELS[Math.min(idx + 1, CACHE_LEVELS.length - 1)] ?? 365;
}

/**
 * Crawl one multiverseId with adaptive caching. A single fetch returns CardData
 * for all printings + languages of the card, so every returned CardData is
 * cached under its own multiverseId. Stable rows escalate 7→30→60→180→365 days,
 * changed rows reset to 7; a confirmed 404 is cached as null only when nothing
 * was cached yet — existing rows are never overwritten by a 404.
 */
export async function crawlOne(
  database: Db,
  multiverseId: number,
  level: CrawlLevel = 'refresh',
  delayMs: number = 0,
  cacheState?: Map<number, CachedRowState>,
): Promise<CrawlOutcome> {
  const existing = cacheState
    ? cacheState.get(multiverseId)
    : await database.select({
      hasData:   sql<boolean>`${Gatherer.data} IS NOT NULL`,
      expiresAt: Gatherer.expiresAt,
    }).from(Gatherer).where(eq(Gatherer.multiverseId, multiverseId)).limit(1).then(r => r[0]);
  const outcome = existing ? cachedOutcome(existing, level, new Date()) : null;
  if (outcome) return outcome; // cached row: no request, no rate-limit delay

  if (delayMs) await sleep(delayMs); // rate-limit actual requests to the site

  try {
    const result = await fetchCard(multiverseId);
    if (result === null) {
      // A confirmed 404 must never wipe cached data: persist the null result only
      // for ids we had nothing cached for; existing rows stay exactly as they are.
      if (existing == null) {
        await upsertCache(database, multiverseId, { url: null, data: null, cacheDays: 365, hash: 'not_found' });
      }
      return 'notFound';
    }

    for (const card of result.cards) {
      const cardMid = card.multiverseId;
      if (typeof cardMid !== 'number') continue;
      const hash = JSON.stringify(card);
      const prev = await database.select().from(Gatherer).where(eq(Gatherer.multiverseId, cardMid)).limit(1);
      const cacheDays = prev[0]?.contentHash === hash ? nextLevel(prev[0]?.cacheDays ?? 7) : 7;
      await upsertCache(database, cardMid, { url: result.url, data: card as never, cacheDays, hash });
    }
    return 'fetched';
  } catch (err) {
    console.warn(`[gatherer] crawl error for multiverseId=${multiverseId}:`, err);
    return 'error';
  }
}

function upsertCache(
  database: Db,
  multiverseId: number,
  row: { url: string | null, data: unknown, cacheDays: number, hash: string },
): Promise<unknown> {
  const expiresAt = new Date(Date.now() + row.cacheDays * 86400000);
  return database.insert(Gatherer).values({
    multiverseId,
    url:         row.url,
    data:        row.data as never,
    cacheDays:   row.cacheDays,
    contentHash: row.hash,
    expiresAt,
  }).onConflictDoUpdate({
    target: [Gatherer.multiverseId],
    set:    { url: row.url, data: row.data as never, cacheDays: row.cacheDays, contentHash: row.hash, expiresAt },
  });
}

export interface CrawlReport {
  fresh:        number;
  localMissing: number;
  fetched:      number;
  notFound:     number;
  errors:       number;
}

/** Crawl the continuous multiverseId range [from, to] with bounded concurrency. */
export async function crawlRange(
  database: Db,
  from: number,
  to: number,
  opts: {
    level?:       CrawlLevel;
    concurrency?: number;
    delayMs?:     number;
    stopEvery?:   number;
    shouldStop?:  () => boolean | Promise<boolean>;
    onProgress?:  (done: number, total: number, counts: CrawlReport) => void;
  } = {},
): Promise<CrawlReport> {
  const { level = 'refresh', concurrency = 4, delayMs = 100, stopEvery = 50, shouldStop, onProgress } = opts;
  const total = to - from + 1;
  const counts: CrawlReport = { fresh: 0, localMissing: 0, fetched: 0, notFound: 0, errors: 0 };
  // Preload the cache state for the whole range in one query (light columns only,
  // no data blob) so the per-id loop never queries the database to check the cache.
  const cacheState = new Map<number, CachedRowState>();
  const cached = await database.select({
    multiverseId: Gatherer.multiverseId,
    hasData:      sql<boolean>`${Gatherer.data} IS NOT NULL`,
    expiresAt:    Gatherer.expiresAt,
  }).from(Gatherer).where(and(gte(Gatherer.multiverseId, from), lte(Gatherer.multiverseId, to)));
  for (const row of cached) {
    cacheState.set(row.multiverseId, { hasData: row.hasData, expiresAt: row.expiresAt });
  }

  let next = from;
  let done = 0;
  let stopped = false;

  async function worker() {
    while (true) {
      if (stopped) break;
      const mid = next++;
      if (mid > to) break;
      const r = await crawlOne(database, mid, level, delayMs, cacheState);
      counts[r === 'error' ? 'errors' : r]++;
      done++;
      onProgress?.(done, total, counts);
      // Poll the cancel/pause request periodically so a stop takes effect promptly.
      if (shouldStop && done % stopEvery === 0 && (await shouldStop())) stopped = true;
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return counts;
}
