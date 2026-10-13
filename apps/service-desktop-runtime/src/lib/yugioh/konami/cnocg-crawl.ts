import { inArray } from 'drizzle-orm';

import { CnocgCards } from '@tcg-cards/db/schema/local/yugioh';

import { crawlAdaptive, type AdaptiveCrawlOptions, type AdaptiveCrawlSource } from './crawl';
import { fetchCnocgDetail } from './cnocg-api';
import type { CachedRowState, CrawlReport } from './ttl';

import type { YugiohLocalDb } from '../yugioh-local-db';

/** Cache-state rows are preloaded in cid chunks of this size. */
const CACHE_CHUNK = 5000;

const cnocgSource: AdaptiveCrawlSource<number> = {
  async loadCacheStates(database, cids) {
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
    return cacheState;
  },

  fetch(cid, fetchImpl) {
    return fetchCnocgDetail(cid, { fetchImpl });
  },

  save(database, cid, row) {
    return database.insert(CnocgCards).values({
      cid,
      url:         row.url,
      data:        row.data as never,
      cacheDays:   row.cacheDays,
      contentHash: row.hash,
      expiresAt:   new Date(Date.now() + row.cacheDays * 86400000),
    }).onConflictDoUpdate({
      target: CnocgCards.cid,
      set:    {
        url:         row.url,
        data:        row.data as never,
        cacheDays:   row.cacheDays,
        contentHash: row.hash,
        expiresAt:   new Date(Date.now() + row.cacheDays * 86400000),
      },
    });
  },
};

/**
 * Crawl the CNOCG official database for the given cids into the local cache,
 * with adaptive-TTL skipping: rows still inside their cache window (or kept by
 * the level) are counted without any request.
 */
export async function crawlCnocg(
  database: YugiohLocalDb,
  cids: number[],
  opts: AdaptiveCrawlOptions = {},
): Promise<CrawlReport> {
  return crawlAdaptive(database, cids, cnocgSource, opts);
}
