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

/**
 * Adaptive-cache crawl loop shared by the Konami crawlers (CNOCG, Neuron).
 * Callers describe HOW to read/write the cache and fetch one key; this module
 * owns the gatherer semantics: bulk cache-state preload, TTL skip decisions,
 * bounded worker pool, one politeness delay per real request, negative-cache
 * rows for confirmed misses, and per-outcome tallies.
 */

/** How the crawl loop touches one source's cache table and endpoint. */
export interface AdaptiveCrawlSource<K> {
  /** Bulk-loads light cache state for the keys (no data blobs). */
  loadCacheStates(database: YugiohLocalDb, keys: K[]): Promise<Map<K, CachedRowState>>;
  /**
   * Fetches one key. Returns null for a confirmed miss; throws on transient
   * failures (counted as errors).
   */
  fetch(key: K, fetchImpl: typeof fetch): Promise<{ url: string | null, data: unknown } | null>;
  /** Persists one fetched payload (or negative row) to the cache table. */
  save(
    database: YugiohLocalDb,
    key: K,
    row: { url: string | null, data: unknown, cacheDays: number, hash: string },
  ): Promise<unknown>;
  /**
   * Days a confirmed miss is trusted before a refreshing level may re-check
   * it. Misses are recorded as negative rows (data null) so the cache
   * distinguishes "never fetched" from "fetched, source has no entry";
   * a re-confirmed miss renews its window. Null keeps misses out of the
   * cache entirely. Defaults to 365.
   */
  missCacheDays?: number | null;
}

export interface AdaptiveCrawlOptions {
  level?:       CrawlLevel;
  concurrency?: number;
  delayMs?:     number;
  stopEvery?:   number;
  shouldStop?:  () => boolean | Promise<boolean>;
  onProgress?:  (done: number, total: number, counts: CrawlReport) => void;
  fetchImpl?:   typeof fetch;
}

/**
 * Crawls the given keys into the source's cache with adaptive-TTL skipping:
 * rows still inside their cache window (or kept by the level) are counted
 * without any request.
 */
export async function crawlAdaptive<K>(
  database: YugiohLocalDb,
  keys: K[],
  source: AdaptiveCrawlSource<K>,
  opts: AdaptiveCrawlOptions = {},
): Promise<CrawlReport> {
  const {
    level = 'refresh',
    concurrency = 1,
    delayMs = 500,
    stopEvery = 10,
    shouldStop,
    onProgress,
    fetchImpl = fetch,
  } = opts;
  const total = keys.length;
  const counts = emptyCrawlReport();

  // Preload the cache state for every key up front (light columns only, no
  // data blob) so the per-key loop never queries the database for the decision.
  const cacheState = await source.loadCacheStates(database, keys);

  let next = 0;
  let done = 0;
  let stopped = false;

  async function worker() {
    while (true) {
      if (stopped) break;
      const index = next++;
      if (index >= keys.length) break;
      const outcome = await crawlOne(database, keys[index]!, level, delayMs, cacheState, source, fetchImpl);
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
 * Crawl one key with adaptive caching. A confirmed miss is recorded as a
 * negative row (data null, hash `not_found`) so the cache stays a complete
 * record of what was checked: the table distinguishes "never fetched" from
 * "fetched, source has no entry". The row is written on first discovery and
 * renewed on re-confirmation (which only the refreshing levels reach), so
 * `missCacheDays` means "trusted for N days". A miss never overwrites a row
 * that holds data.
 */
async function crawlOne<K>(
  database: YugiohLocalDb,
  key: K,
  level: CrawlLevel,
  delayMs: number,
  cacheState: Map<K, CachedRowState>,
  source: AdaptiveCrawlSource<K>,
  fetchImpl: typeof fetch,
): Promise<CrawlOutcome> {
  const existing = cacheState.get(key);
  const outcome = existing ? cachedOutcome(existing, level, new Date()) : null;
  if (outcome) return outcome; // cached row: no request, no rate-limit delay

  if (delayMs > 0) await sleep(delayMs); // rate-limit actual requests to the source

  try {
    const result = await source.fetch(key, fetchImpl);
    if (result === null) {
      const missCacheDays = source.missCacheDays === undefined ? 365 : source.missCacheDays;
      // Record the miss; renew a re-confirmed one. Keys already holding data
      // are left untouched — a transient miss must not wipe fetched rows.
      if (missCacheDays !== null && (existing == null || !existing.hasData)) {
        await source.save(database, key, { url: null, data: null, cacheDays: missCacheDays, hash: 'not_found' });
      }
      return 'notFound';
    }

    const hash = JSON.stringify(result.data);
    const cacheDays = existing?.hasData && existing.contentHash === hash
      ? nextLevel(existing.cacheDays)
      : 7;
    await source.save(database, key, { url: result.url, data: result.data, cacheDays, hash });
    return 'fetched';
  } catch (err) {
    console.warn(`[konami-crawl] crawl error for key=${String(key)}:`, err);
    return 'error';
  }
}
