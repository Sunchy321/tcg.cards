import { describe, expect, test } from 'bun:test';

import {
  CACHE_LEVELS,
  cachedOutcome,
  nextLevel,
} from './ttl';

const NOW = new Date('2026-10-05T12:00:00Z');
const freshRow = (overrides: Partial<Parameters<typeof cachedOutcome>[0]> = {}) => ({
  hasData:     true,
  expiresAt:   new Date('2026-10-06T12:00:00Z'), // after NOW
  cacheDays:   7,
  contentHash: 'hash',
  ...overrides,
});

describe('cachedOutcome', () => {
  test('force refetches regardless of cache state', () => {
    expect(cachedOutcome(freshRow(), 'force', NOW)).toBeNull();
    expect(cachedOutcome(freshRow({ expiresAt: new Date('2026-10-01T12:00:00Z') }), 'force', NOW)).toBeNull();
    expect(cachedOutcome(freshRow({ hasData: false }), 'force', NOW)).toBeNull();
  });

  test('valid rows inside the cache window are fresh under every level', () => {
    for (const level of ['fill', 'refresh', 'refresh_all'] as const) {
      expect(cachedOutcome(freshRow(), level, NOW)).toBe('fresh');
    }
  });

  test('expired valid rows refetch under refresh and refresh_all, but fill keeps them', () => {
    const expired = freshRow({ expiresAt: new Date('2026-10-01T12:00:00Z') });
    expect(cachedOutcome(expired, 'refresh', NOW)).toBeNull();
    expect(cachedOutcome(expired, 'refresh_all', NOW)).toBeNull();
    expect(cachedOutcome(expired, 'fill', NOW)).toBe('fresh');
  });

  test('negative rows stay localMissing under fill and refresh, fresh or expired', () => {
    const negative = freshRow({ hasData: false, contentHash: 'not_found' });
    expect(cachedOutcome(negative, 'fill', NOW)).toBe('localMissing');
    expect(cachedOutcome(negative, 'refresh', NOW)).toBe('localMissing');
    const expiredNegative = freshRow({ hasData: false, expiresAt: new Date('2026-10-01T12:00:00Z') });
    expect(cachedOutcome(expiredNegative, 'fill', NOW)).toBe('localMissing');
    expect(cachedOutcome(expiredNegative, 'refresh', NOW)).toBe('localMissing');
  });

  test('refresh_all rechecks expired negative rows but skips fresh ones', () => {
    expect(cachedOutcome(freshRow({ hasData: false }), 'refresh_all', NOW)).toBe('localMissing');
    expect(cachedOutcome(freshRow({ hasData: false, expiresAt: new Date('2026-10-01T12:00:00Z') }), 'refresh_all', NOW)).toBeNull();
  });
});

describe('nextLevel', () => {
  test('escalates along the ladder and clamps at the last level', () => {
    expect(CACHE_LEVELS).toEqual([7, 30, 60, 180, 365]);
    expect(nextLevel(7)).toBe(30);
    expect(nextLevel(30)).toBe(60);
    expect(nextLevel(60)).toBe(180);
    expect(nextLevel(180)).toBe(365);
    expect(nextLevel(365)).toBe(365);
  });

  test('a days value off the ladder restarts at the first level', () => {
    expect(nextLevel(10)).toBe(7);
  });
});
