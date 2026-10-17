import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';

import { querySeries, type SeriesEntry, type SeriesFilters } from './series-catalog';

/** Builds a catalog entry with independent identity and optional relationships. */
function entry(id: string, overrides: Partial<SeriesEntry> = {}): SeriesEntry {
  return {
    id,
    name:        id,
    type:        'expansion',
    releaseDate: '2025-06-13',
    to:          `/set/${id}`,
    ...overrides,
  };
}

/** Supplies an unfiltered catalog query. */
function filters(overrides: Partial<SeriesFilters> = {}): SeriesFilters {
  return { query: '', type: null, year: null, majorOnly: false, parentId: null, sort: 'newest', ...overrides };
}

describe('series catalog', () => {
  test('paginates a thousand independent releases without losing orphaned children', () => {
    const entries = Array.from({ length: 1001 }, (_, i) => entry(`promo-${i}`, { type: 'promo', parentId: i === 0 ? 'missing' : null }));
    const result = querySeries(entries, filters(), 999, 25);

    assert.equal(result.total, 1001);
    assert.equal(result.page, 41);
    assert.equal(result.rows.length, 1);
    assert.ok(querySeries(entries, filters()).rows.some(row => row.id === 'promo-0'));
  });

  test('searches every localized name and the code independently of pagination', () => {
    const entries = [entry('fin', { name: '最终幻想', searchNames: ['Final Fantasy', 'ファイナルファンタジー'] }), entry('pfin', { type: 'promo' })];

    for (const query of ['最终', 'final fantasy', 'ファイナル', ' FIN ']) {
      assert.deepEqual(querySeries(entries, filters({ query, type: 'expansion' })).rows.map(row => row.id), ['fin']);
    }
  });

  test('combines filters while category counts ignore only the active category', () => {
    const entries = [entry('fin', { isMajor: true }), entry('pfin', { type: 'promo' }), entry('old', { releaseDate: '2024-01-01', isMajor: true })];
    const result = querySeries(entries, filters({ type: 'promo', year: '2025' }));

    assert.deepEqual(result.rows.map(row => row.id), ['pfin']);
    assert.deepEqual(result.typeCounts, { expansion: 1, promo: 1 });
    assert.deepEqual(querySeries(entries, filters({ majorOnly: true, year: '2025' })).rows.map(row => row.id), ['fin']);
  });

  test('finds direct children without requiring their parent in the filtered results', () => {
    const entries = [entry('fin'), entry('fic', { parentId: 'fin' }), entry('tfic', { type: 'token', parentId: 'fic' }), entry('standalone', { type: 'promo' })];

    assert.deepEqual(querySeries(entries, filters({ parentId: 'fin' })).rows.map(row => row.id), ['fic']);
    assert.deepEqual(querySeries(entries, filters({ parentId: 'fic' })).rows.map(row => row.id), ['tfic']);
    assert.deepEqual(querySeries(entries, filters({ type: 'promo' })).rows.map(row => row.id), ['standalone']);
  });

  test('sorts dates in both directions with undated entries last and deterministic ties', () => {
    const entries = [entry('z', { releaseDate: null }), entry('b'), entry('a'), entry('old', { releaseDate: '2024-01-01' })];

    assert.deepEqual(querySeries(entries, filters()).rows.map(row => row.id), ['a', 'b', 'old', 'z']);
    assert.deepEqual(querySeries(entries, filters({ sort: 'oldest' })).rows.map(row => row.id), ['old', 'a', 'b', 'z']);
    assert.deepEqual(querySeries(entries, filters({ year: 'undated' })).rows.map(row => row.id), ['z']);
  });

  test('clamps empty and out-of-range pagination after a filter change', () => {
    const result = querySeries([entry('fin')], filters({ query: 'absent' }), 10, 25);

    assert.equal(result.page, 1);
    assert.equal(result.total, 0);
    assert.deepEqual(result.rows, []);
    assert.equal(querySeries([entry('fin')], filters(), -1, 0).rows.length, 1);
  });
});
