import { describe, expect, test } from 'bun:test';

import { crawlAdaptive, type AdaptiveCrawlSource } from './crawl';
import type { CachedRowState } from './ttl';

import type { YugiohLocalDb } from '../yugioh-local-db';

interface SavedRow {
  key: number;
  row: { url: string | null, data: unknown, cacheDays: number, hash: string };
}

/** Source stub: fixed cache state, fixed fetch result, recorded saves. */
function makeSource(opts: {
  cache?:         Map<number, CachedRowState>;
  fetchResult?:   { url: string | null, data: unknown } | null;
  missCacheDays?: number | null;
}) {
  const saved: SavedRow[] = [];
  let fetchCalls = 0;
  const source: AdaptiveCrawlSource<number> = {
    missCacheDays:   opts.missCacheDays,
    loadCacheStates: async () => opts.cache ?? new Map(),
    fetch:           async () => {
      fetchCalls++;
      return opts.fetchResult === undefined ? null : opts.fetchResult;
    },
    save: async (_db, key, row) => {
      saved.push({ key, row });
    },
  };
  return { source, saved, fetchCalls: () => fetchCalls };
}

const db = {} as unknown as YugiohLocalDb;
const past = new Date('2020-01-01T00:00:00Z');
const future = new Date('2099-01-01T00:00:00Z');

const negativeRow = (expiresAt: Date): CachedRowState => ({
  hasData:     false,
  expiresAt,
  cacheDays:   30,
  contentHash: 'not_found',
});

const dataRow = (expiresAt: Date): CachedRowState => ({
  hasData:     true,
  expiresAt,
  cacheDays:   30,
  contentHash: 'some-hash',
});

describe('miss recording', () => {
  test('a first-time miss is recorded as a negative row with the source window', async () => {
    const { source, saved } = makeSource({ missCacheDays: 30, fetchResult: null });
    const counts = await crawlAdaptive(db, [7], source, { delayMs: 0 });

    expect(counts.notFound).toBe(1);
    expect(saved).toEqual([{ key: 7, row: { url: null, data: null, cacheDays: 30, hash: 'not_found' } }]);
  });

  test('without an explicit window a miss is still recorded, defaulting to 365 days', async () => {
    const { source, saved } = makeSource({ fetchResult: null });
    await crawlAdaptive(db, [7], source, { delayMs: 0 });
    expect(saved[0]!.row.cacheDays).toBe(365);
  });

  test('a re-confirmed miss renews the negative row window', async () => {
    const cache = new Map([[7, negativeRow(past)]]);
    const { source, saved } = makeSource({ missCacheDays: 30, cache, fetchResult: null });
    const counts = await crawlAdaptive(db, [7], source, { delayMs: 0, level: 'refresh_all' });

    expect(counts.notFound).toBe(1);
    expect(saved).toEqual([{ key: 7, row: { url: null, data: null, cacheDays: 30, hash: 'not_found' } }]);
  });

  test('a miss never overwrites a row that holds data', async () => {
    const cache = new Map([[7, dataRow(past)]]);
    const { source, saved } = makeSource({ missCacheDays: 30, cache, fetchResult: null });
    const counts = await crawlAdaptive(db, [7], source, { delayMs: 0 });

    expect(counts.notFound).toBe(1);
    expect(saved).toEqual([]);
  });

  test('a source can opt out of recording misses entirely', async () => {
    const { source, saved } = makeSource({ missCacheDays: null, fetchResult: null });
    await crawlAdaptive(db, [7], source, { delayMs: 0 });
    expect(saved).toEqual([]);
  });

  test('a fresh negative row is skipped without a request at the refreshing levels', async () => {
    const cache = new Map([[7, negativeRow(future)]]);
    const { source, fetchCalls } = makeSource({ cache, fetchResult: null });
    const counts = await crawlAdaptive(db, [7], source, { delayMs: 0, level: 'refresh_all' });

    expect(counts.localMissing).toBe(1);
    expect(fetchCalls()).toBe(0);
  });

  test('the default refresh level leaves negative rows alone, fresh or expired', async () => {
    const cache = new Map([[7, negativeRow(past)]]);
    const { source, fetchCalls } = makeSource({ cache, fetchResult: null });
    const counts = await crawlAdaptive(db, [7], source, { delayMs: 0, level: 'refresh' });

    expect(counts.localMissing).toBe(1);
    expect(fetchCalls()).toBe(0);
  });
});
