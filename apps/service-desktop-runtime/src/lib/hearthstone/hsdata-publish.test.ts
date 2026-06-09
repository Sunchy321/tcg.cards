import { describe, expect, test } from 'bun:test';

import { hsdataPublishTestUtils } from './hsdata-publish';

type TableName = 'cards' | 'entities' | 'entity_localizations' | 'entity_relations';

interface PublishRowState {
  tableName: TableName;
  rowPk: string;
  rowHash: string;
}

function rowState(tableName: TableName, rowPk: string, rowHash: string): PublishRowState {
  return { tableName, rowPk, rowHash };
}

function createPreviousMap(rows: PublishRowState[]): Map<TableName, Map<string, string>> {
  const map = new Map<TableName, Map<string, string>>();

  for (const row of rows) {
    if (!map.has(row.tableName)) {
      map.set(row.tableName, new Map());
    }

    map.get(row.tableName)!.set(row.rowPk, row.rowHash);
  }

  return map;
}

describe('hsdata publish row plans', () => {
  test('classifies row-level insert/update/delete/unchanged', () => {
    const previous = createPreviousMap([
      rowState('entities', 'card-b|hash-b1', 'same-hash'),
      rowState('entities', 'card-c|hash-c1', 'old-hash'),
      rowState('entity_localizations', 'card-b|en|hash-b1|loc-1', 'loc-same'),
      rowState('cards', 'card-d', 'card-d-hash'),
    ]);
    const current = [
      rowState('entities', 'card-a|hash-a1', 'new-ent-hash'),
      rowState('entities', 'card-b|hash-b1', 'same-hash'),
      rowState('entities', 'card-c|hash-c1', 'new-ent-hash'),
      rowState('entity_localizations', 'card-b|en|hash-b1|loc-1', 'loc-same'),
      rowState('cards', 'card-a', 'card-a-hash'),
    ];

    const result = hsdataPublishTestUtils.buildRowPlans(current, previous);

    // Previous: entities(card-b, card-c), localizations(card-b), cards(card-d) = 4 rows
    // Current: entities(card-a, card-b, card-c), localizations(card-b), cards(card-a) = 5 rows
    // Union (6 rows):
    //   card-a entities → insert (not in previous)
    //   card-b entities → unchanged (same hash)
    //   card-c entities → update (same PK, different hash)
    //   card-b localization → unchanged (same hash)
    //   card-a cards → insert
    //   card-d cards → delete (in previous, not current)
    expect(result.counts.totalRowCount).toBe(6);
    expect(result.counts.insertedRowCount).toBe(2);
    expect(result.counts.updatedRowCount).toBe(1);
    expect(result.counts.deletedRowCount).toBe(1);
    expect(result.counts.unchangedRowCount).toBe(2);
    expect(result.counts.changedRowCount).toBe(4);
    expect(result.counts.cardRowCount).toBe(2);
    expect(result.counts.entityRowCount).toBe(3);
    expect(result.counts.localizationRowCount).toBe(1);
    expect(result.counts.relationRowCount).toBe(0);
  });

  test('derives one stable manifest hash independent of row order and deleted rows', () => {
    const previous = createPreviousMap([
      rowState('entities', 'card-z|hash-z1', 'gone-hash'),
    ]);
    const ordered = hsdataPublishTestUtils.buildRowPlans([
      rowState('entities', 'card-a|hash-a1', 'hash-a'),
      rowState('entities', 'card-b|hash-b1', 'hash-b'),
      rowState('cards', 'card-a', 'card-a-hash'),
    ], previous);
    const reversed = hsdataPublishTestUtils.buildRowPlans([
      rowState('cards', 'card-a', 'card-a-hash'),
      rowState('entities', 'card-b|hash-b1', 'hash-b'),
      rowState('entities', 'card-a|hash-a1', 'hash-a'),
    ], previous);

    expect(ordered.manifestHash).toBe(reversed.manifestHash);
    // manifestHash should not be the empty hash when there are non-delete plans
    expect(ordered.manifestHash.length).toBeGreaterThan(0);
  });

  test('serializeRowPk produces deterministic output regardless of key order', () => {
    const pk1 = hsdataPublishTestUtils.serializeRowPk({ cardId: 'x', revisionHash: 'y', lang: 'z' });
    const pk2 = hsdataPublishTestUtils.serializeRowPk({ lang: 'z', cardId: 'x', revisionHash: 'y' });

    expect(pk1).toBe(pk2);
    expect(pk1).toBe('{"cardId":"x","lang":"z","revisionHash":"y"}');
  });

  test('parseRowPk round-trips through serializeRowPk', () => {
    const original = { sourceId: 'a', relation: 'b', sourceRevisionHash: 'c', targetId: 'd' };
    const serialized = hsdataPublishTestUtils.serializeRowPk(original);
    const parsed = hsdataPublishTestUtils.parseRowPk(serialized);

    expect(parsed).toEqual(original);
  });

  test('empty current with previous produces all deletes', () => {
    const previous = createPreviousMap([
      rowState('entities', 'card-x|hash-x1', 'hash-x'),
      rowState('cards', 'card-x', 'card-x-hash'),
    ]);
    const current: PublishRowState[] = [];

    const result = hsdataPublishTestUtils.buildRowPlans(current, previous);

    expect(result.counts.totalRowCount).toBe(2);
    expect(result.counts.deletedRowCount).toBe(2);
    expect(result.counts.changedRowCount).toBe(2);
    expect(result.counts.insertedRowCount).toBe(0);
  });

  test('empty previous with current produces all inserts', () => {
    const previous = createPreviousMap([]);
    const current = [
      rowState('entities', 'card-a|hash-a1', 'hash-a'),
      rowState('cards', 'card-a', 'card-a-hash'),
    ];

    const result = hsdataPublishTestUtils.buildRowPlans(current, previous);

    expect(result.counts.totalRowCount).toBe(2);
    expect(result.counts.insertedRowCount).toBe(2);
    expect(result.counts.changedRowCount).toBe(2);
    expect(result.counts.deletedRowCount).toBe(0);
  });

  test('plans are sorted by tableName then rowPk', () => {
    const previous = createPreviousMap([]);
    const current = [
      rowState('entity_relations', 'r2', 'hash-r2'),
      rowState('cards', 'c1', 'hash-c1'),
      rowState('entities', 'e1', 'hash-e1'),
    ];

    const result = hsdataPublishTestUtils.buildRowPlans(current, previous);

    const planOrder = result.plans.map(p => `${p.tableName}:${p.rowPk}`);

    expect(planOrder[0]).toContain('cards');
    expect(planOrder[1]).toContain('entities');
    expect(planOrder[2]).toContain('entity_relations');
  });
});
