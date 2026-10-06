import { inArray } from 'drizzle-orm';

import { CnocgCards } from '@tcg-cards/db/schema/local/yugioh';

import { fetchCnocgDetail } from './cnocg-api';
import { sleep } from './common';
import {
  cachedOutcome,
  emptyCrawlReport,
  nextLevel,
  type CachedRowState,
  type CrawlLevel,
  type CrawlOutcome,
  type CrawlReport,
} from './ttl';

import type { YugiohLocalDb } from '../yugioh-local-db';

/** Cache-state rows are preloaded in cid chunks of this size. */
const CACHE_CHUNK = 5000;

/**
 * Crawl the CNOCG official database for the given cids into the local cache,
 * with adaptive-TTL skipping: rows still inside their cache window (or kept by
 * the level) are counted without any request. Bounded worker pool, one
 * politeness delay per real request, errors counted instead of fatal.
 */
export async function crawlCnocg(
  database: YugiohLocalDb,
  cids: number[],
  opts: {
    level?:       CrawlLevel;
    concurrency?: number;
    delayMs?:     number;
    stopEvery?:   number;
    shouldStop?:  () => boolean | Promise<boolean>;
    onProgress?:  (done: number, total: number, counts: CrawlReport) => void;
    fetchImpl?:   typeof fetch;
  } = {},
): Promise<CrawlReport> {
  const {
    level = 'refresh',
    concurrency = 1,
    delayMs = 500,
    stopEvery = 10,
    shouldStop,
    onProgress,
    fetchImpl,
  } = opts;
  const total = cids.length;
  const counts = emptyCrawlReport();

  // Preload the cache state for every cid up front (light columns only, no
  // data blob) so the per-cid loop never queries the database for the decision.
  const cacheState = new Map<number, CachedRowState>();
  for (let from = 0; from < cids.length; from += CACHE_CHUNK) {
    const chunk = cids.slice(from, from + CACHE_CHUNK);
    const rows = await database.select({
      cid:         CnocgCards.cid,
      hasData:     CnocgCards.data,
      expiresAt:   CnocgCards.expiresAt,
      cacheDays:   CnocgCards.cacheDays,
      contentHash: CnocgCards.contentHash,
    }).from(CnocgCards).where(inArray(CnocgCards.cid, chunk));
    for (const row of rows) {
      cacheState.set(row.cid, {
        hasData:     row.hasData !== null,
        expiresAt:   row.expiresAt,
        cacheDays:   row.cacheDays,
        contentHash: row.contentHash,
      });
    }
  }

  let next = 0;
  let done = 0;
  let stopped = false;

  async function worker() {
    while (true) {
      if (stopped) break;
      const index = next++;
      if (index >= cids.length) break;
      const outcome = await crawlOneCnocg(database, cids[index]!, level, delayMs, cacheState, fetchImpl);
      counts[outcome === 'error' ? 'errors' : outcome]++;
      done++;
      onProgress?.(done, total, counts);
      // Poll the cancel/pause request periodically so a stop takes effect promptly.
      if (shouldStop && done % stopEvery === 0 && (await shouldStop())) stopped = true;
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return counts;
}

/**
 * Crawl one cid with adaptive caching. A source miss is cached as a negative
 * row (365 days, hash `not_found`) only when nothing was cached yet — existing
 * rows are never overwritten by a miss.
 */
async function crawlOneCnocg(
  database: YugiohLocalDb,
  cid: number,
  level: CrawlLevel,
  delayMs: number,
  cacheState: Map<number, CachedRowState>,
  fetchImpl?: typeof fetch,
): Promise<CrawlOutcome> {
  const existing = cacheState.get(cid);
  const outcome = existing ? cachedOutcome(existing, level, new Date()) : null;
  if (outcome) return outcome; // cached row: no request, no rate-limit delay

  if (delayMs > 0) await sleep(delayMs); // rate-limit actual requests to the API

  try {
    const result = await fetchCnocgDetail(cid, { fetchImpl });
    if (result === null) {
      // A confirmed miss must never wipe cached data: persist the negative
      // result only for cids we had nothing cached for.
      if (existing == null) {
        await upsertCnocgCache(database, cid, { url: null, data: null, cacheDays: 365, hash: 'not_found' });
      }
      return 'notFound';
    }

    const hash = JSON.stringify(result.data);
    const cacheDays = existing?.hasData && existing.contentHash === hash
      ? nextLevel(existing.cacheDays)
      : 7;
    await upsertCnocgCache(database, cid, { url: result.url, data: result.data, cacheDays, hash });
    return 'fetched';
  } catch (err) {
    console.warn(`[konami-cnocg] crawl error for cid=${cid}:`, err);
    return 'error';
  }
}

function upsertCnocgCache(
  database: YugiohLocalDb,
  cid: number,
  row: { url: string | null, data: unknown, cacheDays: number, hash: string },
) {
  const expiresAt = new Date(Date.now() + row.cacheDays * 86400000);
  return database.insert(CnocgCards).values({
    cid,
    url:         row.url,
    data:        row.data as never,
    cacheDays:   row.cacheDays,
    contentHash: row.hash,
    expiresAt,
  }).onConflictDoUpdate({
    target: CnocgCards.cid,
    set:    { url: row.url, data: row.data as never, cacheDays: row.cacheDays, contentHash: row.hash, expiresAt },
  });
}
