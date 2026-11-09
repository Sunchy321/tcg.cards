import { describe, expect, test } from 'bun:test';
import { TaskBoundarySignal } from '../../../task/registry';
import { applySearchSnapshotBatches, SEARCH_D1_FTS_MODE, type SearchD1ResumeToken } from './d1-apply';
import type { SearchSnapshotBatch } from './snapshot/snapshot-batch';

/** Recorded remote call from the fake execute collaborator. */
interface RecordedCall {
  statements: string[];
}

const HEARTHSTONE_TABLES = [
  'hearthstone_search_cards',
  'hearthstone_search_card_values',
  'hearthstone_search_card_legalities',
  'hearthstone_search_card_localizations',
  'hearthstone_search_text_rows',
];

/** Builds one framing batch. */
function frame(role: SearchSnapshotBatch['role'], statements: string[]): SearchSnapshotBatch {
  return { role, table: null, final: true, statements };
}

/** Builds one insert segment for a table with the given row count. */
function insertSegment(table: string, rows: number, batchRows = 100): SearchSnapshotBatch[] {
  const deleteStatements = [`DELETE FROM ${table};`];
  const statements = Array.from({ length: rows }, (_, index) => `INSERT INTO ${table} VALUES (${index + 1});`);
  const batches: SearchSnapshotBatch[] = [];
  for (let index = 0; index < statements.length; index += batchRows) {
    const slice = statements.slice(index, index + batchRows);
    const final = index + batchRows >= statements.length;
    batches.push({
      role:       'insert',
      table,
      final,
      statements: slice,
      ...(final ? { expectedRows: rows } : {}),
      ...(batches.length === 0 ? { deleteStatements } : {}),
    });
  }
  return batches;
}

/** Builds one complete hearthstone batch stream with one text row per localization. */
function fixtureBatches(textRows: number): SearchSnapshotBatch[] {
  return [
    frame('meta-clear', ['DELETE FROM hearthstone_search_meta;']),
    frame('clear', [
      'DELETE FROM hearthstone_search_text_rows;',
      'DELETE FROM hearthstone_search_card_legalities;',
      'DELETE FROM hearthstone_search_card_values;',
      'DELETE FROM hearthstone_search_card_localizations;',
      'DELETE FROM hearthstone_search_cards;',
    ]),
    ...HEARTHSTONE_TABLES.flatMap(table => insertSegment(table, table === 'hearthstone_search_text_rows' ? textRows : 2)),
    frame('meta', ['INSERT INTO hearthstone_search_meta VALUES (\'ready\', \'1\');']),
  ];
}

/** A fresh stream factory over collected batches. */
function stream(batches: SearchSnapshotBatch[]): () => AsyncGenerator<SearchSnapshotBatch> {
  return async function* () {
    for (const batch of batches) yield batch;
  };
}

/** A remote fake that answers count checks from a local mirror and records every call. */
function fakeRemote(expected: Record<string, number>) {
  const calls: RecordedCall[] = [];
  return {
    calls,
    async execute(statements: string[]) {
      calls.push({ statements });
      const statement = statements[0]!;
      const countMatch = statement.match(/^SELECT COUNT\(\*\) AS row_count FROM (\w+);$/);
      if (countMatch) {
        return [{
          success: true,
          rows:    [{ row_count: expected[countMatch[1]!] ?? 0 }],
        }];
      }
      return [{ success: true, rows: [] }];
    },
  };
}

describe('search D1 snapshot applier', () => {
  test('a fresh pass sends deletes before each segment and verifies every count', async () => {
    const remote = fakeRemote({
      hearthstone_search_cards:              2,
      hearthstone_search_card_values:        2,
      hearthstone_search_card_legalities:    2,
      hearthstone_search_card_localizations: 2,
      hearthstone_search_text_rows:          3,
    });
    const segments: SearchD1ResumeToken[] = [];
    const result = await applySearchSnapshotBatches({
      game:              'hearthstone',
      batches:           stream(fixtureBatches(3)),
      execute:           statements => remote.execute(statements),
      retryDelayMs:      1,
      onSegmentComplete: token => {
        segments.push(token);
      },
    });

    expect(result.tableCounts.get('hearthstone_search_text_rows')).toBe(3);
    const statements = remote.calls.flatMap(call => call.statements);
    expect(statements).toContain('DELETE FROM hearthstone_search_meta;');
    expect(statements).toContain('DELETE FROM hearthstone_search_cards;');
    expect(statements.filter(statement => statement.includes('delete-all')).length).toBe(1);
    expect(segments.at(-1)).toEqual({ segmentOrdinal: 8 });
  });

  test('a count mismatch fails the segment', async () => {
    const remote = fakeRemote({ hearthstone_search_cards: 2, hearthstone_search_card_values: 2, hearthstone_search_card_legalities: 2, hearthstone_search_card_localizations: 2, hearthstone_search_text_rows: 3, broken: 99 });
    const batches = fixtureBatches(3);
    batches[2] = {
      ...insertSegment('hearthstone_search_cards', 2)[0]!,
      role:             'insert',
      table:            'broken',
      expectedRows:     5,
      statements:       ['INSERT INTO broken VALUES (1);'],
      deleteStatements: ['DELETE FROM broken;'],
    };
    await expect(applySearchSnapshotBatches({
      game:         'hearthstone',
      batches:      stream(batches),
      execute:      statements => remote.execute(statements),
      retryDelayMs: 1,
    })).rejects.toThrow('行数校验不符');
  });

  test('resuming exactly at the first text segment rebuilds the index without rewinding', async () => {
    const remote = fakeRemote({
      hearthstone_search_cards:              2,
      hearthstone_search_card_values:        2,
      hearthstone_search_card_legalities:    2,
      hearthstone_search_card_localizations: 2,
      hearthstone_search_text_rows:          3,
    });
    await applySearchSnapshotBatches({
      game:         'hearthstone',
      batches:      stream(fixtureBatches(3)),
      execute:      statements => remote.execute(statements),
      retryDelayMs: 1,
      resume:       { done: 30, token: { segmentOrdinal: 6 } satisfies SearchD1ResumeToken as unknown as Record<string, unknown> },
    });

    // Segment ordinal 6 is the first text segment in this fixture, so the pass starts there.
    expect(remote.calls[0]!.statements[0]).toBe('DELETE FROM hearthstone_search_text_rows;');
    expect(remote.calls[0]!.statements[1]).toContain('delete-all');
    expect(remote.calls.some(call => call.statements[0] === 'DELETE FROM hearthstone_search_meta;')).toBe(false);
  });

  test('resuming into a later text segment rewinds to the first one', async () => {
    const remote = fakeRemote({ magic_cards: 1, magic_text_rows: 1 });
    // Two text segments with scoped deletes, mirroring the Magic part/localization split.
    const batches: SearchSnapshotBatch[] = [
      frame('meta-clear', ['DELETE FROM magic_search_meta;']),
      frame('clear', ['DELETE FROM magic_search_text_rows;']),
      insertSegment('magic_cards', 1)[0]!,
      {
        role:             'insert',
        table:            'magic_text_rows',
        final:            true,
        statements:       ['INSERT INTO magic_text_rows VALUES (1);'],
        deleteStatements: ['DELETE FROM magic_text_rows WHERE kind = \'part\';'],
        expectedRows:     1,
      },
      {
        role:             'insert',
        table:            'magic_text_rows',
        final:            true,
        statements:       ['INSERT INTO magic_text_rows VALUES (2);'],
        deleteStatements: ['DELETE FROM magic_text_rows WHERE kind = \'localization\';'],
        expectedRows:     1,
      },
      frame('meta', ['INSERT INTO magic_search_meta VALUES (\'ready\', \'1\');']),
    ];
    // Ordinals: 0 meta-clear, 1 clear, 2 cards, 3 first text, 4 second text. Resume at 4.
    await applySearchSnapshotBatches({
      game:         'magic',
      batches:      stream(batches),
      execute:      statements => remote.execute(statements),
      retryDelayMs: 1,
      resume:       { done: 5, token: { segmentOrdinal: 4 } satisfies SearchD1ResumeToken as unknown as Record<string, unknown> },
    });

    expect(remote.calls[0]!.statements[0]).toBe('DELETE FROM magic_text_rows WHERE kind = \'part\';');
    expect(remote.calls[0]!.statements[1]).toContain('delete-all');
    const appliedInserts = remote.calls.filter(call => call.statements[0]!.startsWith('INSERT INTO magic_text_rows VALUES'));
    expect(appliedInserts.map(call => call.statements[0])).toEqual([
      'INSERT INTO magic_text_rows VALUES (1);',
      'INSERT INTO magic_text_rows VALUES (2);',
    ]);
  });

  test('an aborted signal raises the task boundary for the requested control', async () => {
    const controller = new AbortController();
    controller.abort('pause');
    await expect(applySearchSnapshotBatches({
      game:         'hearthstone',
      batches:      stream(fixtureBatches(1)),
      execute:      () => Promise.resolve([{ success: true, rows: [] }]),
      signal:       controller.signal,
      retryDelayMs: 1,
    })).rejects.toThrow(TaskBoundarySignal);
  });

  test('the shared FTS mode stays incremental', () => {
    expect(SEARCH_D1_FTS_MODE).toBe('incremental');
  });
});
