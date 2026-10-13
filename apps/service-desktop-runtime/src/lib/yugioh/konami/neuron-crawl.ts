import { and, eq, inArray } from 'drizzle-orm';

import { NeuronCards } from '@tcg-cards/db/schema/local/yugioh';

import { crawlAdaptive, type AdaptiveCrawlOptions, type AdaptiveCrawlSource } from './crawl';
import { fetchNeuronDetail } from './neuron-detail';
import type { CachedRowState, CrawlReport } from './ttl';

import type { YugiohLocalDb } from '../yugioh-local-db';

/** Cache-state rows are preloaded in cid chunks of this size. */
const CACHE_CHUNK = 5000;

/**
 * Builds the per-locale adaptive crawl source for the Neuron detail pages.
 * A card can legitimately have no entry for a locale (a regional DB only
 * carries the cards released there), and that verdict can change when a
 * localization lands — so a miss is recorded as a negative row with a short
 * 30-day window, re-checked by the refreshing crawl levels.
 */
export function neuronSource(locale: string): AdaptiveCrawlSource<number> {
  return {
    missCacheDays: 30,
    async loadCacheStates(database, cids) {
      const cacheState = new Map<number, CachedRowState>();
      for (let from = 0; from < cids.length; from += CACHE_CHUNK) {
        const chunk = cids.slice(from, from + CACHE_CHUNK);
        const rows = await database.select({
          cid:         NeuronCards.cid,
          hasData:     NeuronCards.data,
          expiresAt:   NeuronCards.expiresAt,
          cacheDays:   NeuronCards.cacheDays,
          contentHash: NeuronCards.contentHash,
        }).from(NeuronCards).where(and(eq(NeuronCards.locale, locale), inArray(NeuronCards.cid, chunk)));
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
      return fetchNeuronDetail(cid, locale, { fetchImpl });
    },

    save(database, cid, row) {
      return database.insert(NeuronCards).values({
        cid,
        locale,
        url:         row.url,
        data:        row.data as never,
        cacheDays:   row.cacheDays,
        contentHash: row.hash,
        expiresAt:   new Date(Date.now() + row.cacheDays * 86400000),
      }).onConflictDoUpdate({
        target: [NeuronCards.cid, NeuronCards.locale],
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
}

/**
 * Crawl the Neuron detail pages of the given cids for one locale into the
 * local cache, with adaptive-TTL skipping: rows still inside their cache
 * window (or kept by the level) are counted without any request.
 */
export async function crawlNeuron(
  database: YugiohLocalDb,
  cids: number[],
  locale: string,
  opts: AdaptiveCrawlOptions = {},
): Promise<CrawlReport> {
  return crawlAdaptive(database, cids, neuronSource(locale), opts);
}
