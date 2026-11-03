import { describe, expect, test } from 'bun:test';

import { searchD1Router } from './search-d1';

/** Minimal D1 binding fake that records prepared statements and batch calls. */
function binding(results: Array<{ success: boolean, results?: Array<Record<string, unknown>>, meta?: Record<string, number> }>) {
  const prepared: string[] = [];
  let batchCalls = 0;
  return {
    prepared,
    get batchCalls() {
      return batchCalls;
    },
    prepare(query: string) {
      prepared.push(query);
      return { __query: query };
    },
    async batch(statements: Array<{ __query: string }>) {
      batchCalls++;
      expect(statements.length).toBeGreaterThan(0);
      return results;
    },
  };
}

/** Reads the handler of one published procedure without going through HTTP. */
function handlerOf(router: typeof searchD1Router, key: 'execute' | 'meta') {
  return (router.searchD1[key] as unknown as {
    '~orpc': { handler: (args: { context: { env: unknown }, input: unknown }) => Promise<unknown> };
  })['~orpc'].handler;
}

describe('search D1 procedures', () => {
  test('execute routes magic statements to the magic binding and shapes results', async () => {
    const magic = binding([
      { success: true, meta: { duration: 2, rows_read: 3, rows_written: 4 }, results: [{ ok: 1 }] },
    ]);
    const hearthstone = binding([]);
    const handler = handlerOf(searchD1Router, 'execute');
    const output = await handler({
      context: { env: { MAGIC_SEARCH_DB: magic, HEARTHSTONE_SEARCH_DB: hearthstone } },
      input:   { game: 'magic', statements: ['DELETE FROM magic_search_meta;', 'INSERT INTO x VALUES (1);'] },
    }) as { results: Array<{ success: boolean, durationMs?: number, rowsRead?: number, rowsWritten?: number, rows: unknown[] }> };

    expect(magic.prepared).toEqual(['DELETE FROM magic_search_meta;', 'INSERT INTO x VALUES (1);']);
    expect(magic.batchCalls).toBe(1);
    expect(output.results[0]).toEqual({
      success:     true,
      durationMs:  2,
      rowsRead:    3,
      rowsWritten: 4,
      rows:        [{ ok: 1 }],
    });
  });

  test('execute routes hearthstone statements to the hearthstone binding', async () => {
    const magic = binding([]);
    const hearthstone = binding([{ success: true, results: [] }]);
    const handler = handlerOf(searchD1Router, 'execute');
    await handler({
      context: { env: { MAGIC_SEARCH_DB: magic, HEARTHSTONE_SEARCH_DB: hearthstone } },
      input:   { game: 'hearthstone', statements: ['SELECT 1;'] },
    });
    expect(magic.batchCalls).toBe(0);
    expect(hearthstone.batchCalls).toBe(1);
  });

  test('meta reads the game-specific metadata table', async () => {
    const rows = [{ key: 'ready', value: '1' }, { key: 'release_hash', value: 'abc' }];
    const seen: string[] = [];
    const fake = {
      prepare(query: string) {
        seen.push(query);
        return {
          async all() {
            return { results: rows };
          },
        };
      },
    };
    const handler = handlerOf(searchD1Router, 'meta');
    const output = await handler({
      context: { env: { MAGIC_SEARCH_DB: fake, HEARTHSTONE_SEARCH_DB: fake } },
      input:   { game: 'hearthstone' },
    }) as { values: Record<string, string> };

    expect(seen).toEqual(['SELECT key, value FROM hearthstone_search_meta']);
    expect(output.values).toEqual({ ready: '1', release_hash: 'abc' });
  });
});
