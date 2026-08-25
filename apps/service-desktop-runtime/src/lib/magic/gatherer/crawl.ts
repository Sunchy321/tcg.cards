import { eq, sql } from 'drizzle-orm';

import { db } from '@tcg-cards/db/db';
import { Gatherer } from '@tcg-cards/db/schema/local/magic';

const CACHE_LEVELS = [7, 30, 60, 180, 365];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

type Db = typeof db;

/** Crawl granularity: which rows to process this run. */
export type CrawlLevel = 'fill' | 'refresh' | 'refresh_all' | 'force';
export const CRAWL_LEVELS: CrawlLevel[] = ['fill', 'refresh', 'refresh_all', 'force'];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function shouldSkip(row: { data: unknown, expiresAt: Date } | undefined, level: CrawlLevel, now: Date): boolean {
  if (!row) return false;
  switch (level) {
  case 'fill': return true; // any existing row → skip
  case 'refresh': return row.data === null || row.expiresAt > now; // skip 404s and fresh non-null
  case 'refresh_all': return row.expiresAt > now; // skip only fresh rows
  case 'force': return false;
  }
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
  const res = await fetch(`https://gatherer.wizards.com/Pages/Card/Details.aspx?multiverseid=${multiverseId}`, {
    headers:  { 'User-Agent': UA, 'Accept': 'text/html' },
    redirect: 'follow',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Gatherer HTTP ${res.status} for ${multiverseId}`);
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
 * changed rows reset to 7; 404s are cached as null with the max window.
 */
export async function crawlOne(database: Db, multiverseId: number, level: CrawlLevel = 'refresh'): Promise<'fetched' | 'not_found' | 'skipped' | 'error'> {
  const existing = await database.select().from(Gatherer).where(eq(Gatherer.multiverseId, multiverseId)).limit(1);
  if (shouldSkip(existing[0], level, new Date())) return 'skipped';

  try {
    const result = await fetchCard(multiverseId);
    if (result === null) {
      await upsertCache(database, multiverseId, { url: null, data: null, cacheDays: 365, hash: 'not_found' });
      return 'not_found';
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
  } catch {
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
  fetched:  number;
  notFound: number;
  skipped:  number;
  errors:   number;
}

/** Crawl the continuous multiverseId range [from, to] with bounded concurrency. */
export async function crawlRange(
  database: Db,
  from: number,
  to: number,
  opts: { level?: CrawlLevel, concurrency?: number, delayMs?: number, onProgress?: (done: number, total: number) => void } = {},
): Promise<CrawlReport> {
  const { level = 'refresh', concurrency = 4, delayMs = 100, onProgress } = opts;
  const total = to - from + 1;
  const counts: CrawlReport = { fetched: 0, notFound: 0, skipped: 0, errors: 0 };
  let next = from;
  let done = 0;

  async function worker() {
    while (true) {
      const mid = next++;
      if (mid > to) break;
      const r = await crawlOne(database, mid, level);
      counts[r === 'error' ? 'errors' : r === 'not_found' ? 'notFound' : r]++;
      done++;
      onProgress?.(done, total);
      if (delayMs) await sleep(delayMs);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return counts;
}
