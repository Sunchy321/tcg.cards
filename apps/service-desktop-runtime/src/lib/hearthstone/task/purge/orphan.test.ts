import { describe, expect, test } from 'bun:test';

import { computeOrphanedRenderHashes } from './orphan';

describe('computeOrphanedRenderHashes', () => {
  test('returns empty when there are no soft-deleted hashes', () => {
    expect([...computeOrphanedRenderHashes([], ['a', 'b'])]).toEqual([]);
  });

  test('returns all soft-deleted hashes when nothing is still live', () => {
    expect([...computeOrphanedRenderHashes(['a', 'b'], [])].sort()).toEqual(['a', 'b']);
  });

  test('keeps only hashes not referenced by any live row', () => {
    expect([...computeOrphanedRenderHashes(['a', 'b', 'c'], ['b', 'd'])]).toEqual(['a', 'c']);
  });

  test('deduplicates repeated soft-deleted hashes', () => {
    expect([...computeOrphanedRenderHashes(['a', 'a', 'b', 'b'], [])].sort()).toEqual(['a', 'b']);
  });

  test('drops a hash that a surviving row still references', () => {
    // Same card content across revisions: the deleted row and the live row share a hash.
    expect(computeOrphanedRenderHashes(['h1', 'h2'], ['h2', 'h3']).has('h2')).toBe(false);
  });
});
