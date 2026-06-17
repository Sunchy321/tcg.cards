import { describe, expect, test } from 'bun:test';

import { hsdataPublishTestUtils } from './hsdata-publish';

type TableName = 'cards' | 'entities' | 'entity_localizations' | 'entity_relations';

interface PublishRowState {
  tableName: TableName;
  rowKey: string;
  rowHash: string;
}

function rowState(tableName: TableName, rowKey: string, rowHash: string): PublishRowState {
  return { tableName, rowKey, rowHash };
}

function createPreviousMap(rows: PublishRowState[]): Map<TableName, Map<string, string>> {
  const map = new Map<TableName, Map<string, string>>();

  for (const row of rows) {
    if (!map.has(row.tableName)) {
      map.set(row.tableName, new Map());
    }

    map.get(row.tableName)!.set(row.rowKey, row.rowHash);
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

    const result = hsdataPublishTestUtils.buildBatchRowPlans(current, previous);

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
    const ordered = hsdataPublishTestUtils.buildBatchRowPlans([
      rowState('entities', 'card-a|hash-a1', 'hash-a'),
      rowState('entities', 'card-b|hash-b1', 'hash-b'),
      rowState('cards', 'card-a', 'card-a-hash'),
    ], previous);
    const reversed = hsdataPublishTestUtils.buildBatchRowPlans([
      rowState('cards', 'card-a', 'card-a-hash'),
      rowState('entities', 'card-b|hash-b1', 'hash-b'),
      rowState('entities', 'card-a|hash-a1', 'hash-a'),
    ], previous);

    expect(ordered.manifestHash).toBe(reversed.manifestHash);
    // manifestHash should not be the empty hash when there are non-delete plans
    expect(ordered.manifestHash.length).toBeGreaterThan(0);
  });

  test('serializeRowKey produces deterministic output regardless of key order', () => {
    const pk1 = hsdataPublishTestUtils.serializeRowKey({ cardId: 'x', revisionHash: 'y', lang: 'z' });
    const pk2 = hsdataPublishTestUtils.serializeRowKey({ lang: 'z', cardId: 'x', revisionHash: 'y' });

    expect(pk1).toBe(pk2);
    expect(pk1).toBe('{"cardId":"x","lang":"z","revisionHash":"y"}');
  });

  test('parseRowKey round-trips through serializeRowKey', () => {
    const original = { sourceId: 'a', relation: 'b', sourceRevisionHash: 'c', targetId: 'd' };
    const serialized = hsdataPublishTestUtils.serializeRowKey(original);
    const parsed = hsdataPublishTestUtils.parseRowKey(serialized);

    expect(parsed).toEqual(original);
  });

  test('empty current with previous produces all deletes', () => {
    const previous = createPreviousMap([
      rowState('entities', 'card-x|hash-x1', 'hash-x'),
      rowState('cards', 'card-x', 'card-x-hash'),
    ]);
    const current: PublishRowState[] = [];

    const result = hsdataPublishTestUtils.buildBatchRowPlans(current, previous);

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

    const result = hsdataPublishTestUtils.buildBatchRowPlans(current, previous);

    expect(result.counts.totalRowCount).toBe(2);
    expect(result.counts.insertedRowCount).toBe(2);
    expect(result.counts.changedRowCount).toBe(2);
    expect(result.counts.deletedRowCount).toBe(0);
  });

  test('baseline-overlay current rows keep unchanged rows without turning them into deletes', () => {
    const previous = createPreviousMap([
      rowState('entities', 'card-b|hash-b1', 'same-hash'),
      rowState('cards', 'card-b', 'card-b-hash'),
    ]);
    const current = [
      rowState('entities', 'card-b|hash-b1', 'same-hash'),
      rowState('entities', 'card-a|hash-a1', 'card-a-hash'),
      rowState('cards', 'card-a', 'card-a-card-hash'),
      rowState('cards', 'card-b', 'card-b-hash-next'),
    ];

    const result = hsdataPublishTestUtils.buildBatchRowPlans(current, previous);

    expect(result.counts.totalRowCount).toBe(4);
    expect(result.counts.insertedRowCount).toBe(2);
    expect(result.counts.updatedRowCount).toBe(1);
    expect(result.counts.deletedRowCount).toBe(0);
    expect(result.counts.unchangedRowCount).toBe(1);
  });

  test('plans are sorted by tableName then rowKey', () => {
    const previous = createPreviousMap([]);
    const current = [
      rowState('entity_relations', 'r2', 'hash-r2'),
      rowState('cards', 'c1', 'hash-c1'),
      rowState('entities', 'e1', 'hash-e1'),
    ];

    const result = hsdataPublishTestUtils.buildBatchRowPlans(current, previous);

    const planOrder = result.plans.map(p => `${p.tableName}:${p.rowKey}`);

    expect(planOrder[0]).toContain('cards');
    expect(planOrder[1]).toContain('entities');
    expect(planOrder[2]).toContain('entity_relations');
  });
});

describe('hsdata publish remote gate', () => {
  test('rejects unregistered publish stream', async () => {
    const remoteDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            then: (resolve: (rows: unknown[]) => unknown) => resolve([]),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve([]),
          }),
        }),
      }),
    } as any;

    await expect(hsdataPublishTestUtils.assertRemotePublishGate(remoteDb, {
      publishTarget: 'target-dev',
      environment: 'dev',
      publishType: 'card_data',
      targetFingerprint: 'fp-1',
      manifestHash: 'incoming-manifest',
      previousManifestHash: null,
      sourceTagMax: 100,
      leaseHolderId: 'batch-1',
    })).rejects.toThrow('is not registered for normal publish');
  });

  test('rejects fingerprint mismatch before any remote write', async () => {
    const rows = [
      {
        publishTarget: 'target-dev',
        environment: 'dev',
        publishType: 'card_data',
        targetFingerprint: 'fp-remote',
        normalPublishEnabled: true,
      },
    ];
    let selectCount = 0;
    const remoteDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            then: (resolve: (value: unknown[]) => unknown) => {
              selectCount += 1;
              return resolve(selectCount === 1 ? rows : []);
            },
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve([]),
          }),
        }),
      }),
    } as any;

    await expect(hsdataPublishTestUtils.assertRemotePublishGate(remoteDb, {
      publishTarget: 'target-dev',
      environment: 'dev',
      publishType: 'card_data',
      targetFingerprint: 'fp-local',
      manifestHash: 'incoming-manifest',
      previousManifestHash: null,
      sourceTagMax: 100,
      leaseHolderId: 'batch-1',
    })).rejects.toThrow('rejected target fingerprint');
  });

  test('rejects stale previous manifest hash', async () => {
    const registrationRows = [
      {
        publishTarget: 'target-dev',
        environment: 'dev',
        publishType: 'card_data',
        targetFingerprint: 'fp-1',
        normalPublishEnabled: true,
      },
    ];
    const ledgerRows = [
      {
        manifestHash: 'remote-manifest',
        sourceTagMax: 100,
      },
    ];
    let selectCount = 0;
    const remoteDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            then: (resolve: (value: unknown[]) => unknown) => {
              selectCount += 1;
              return resolve(selectCount === 1 ? registrationRows : ledgerRows);
            },
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve([{
              ...registrationRows[0],
              leaseHolderId: 'batch-1',
              leaseExpiresAt: new Date('2026-06-17T00:05:00.000Z'),
            }]),
          }),
        }),
      }),
    } as any;

    await expect(hsdataPublishTestUtils.assertRemotePublishGate(remoteDb, {
      publishTarget: 'target-dev',
      environment: 'dev',
      publishType: 'card_data',
      targetFingerprint: 'fp-1',
      manifestHash: 'incoming-manifest',
      previousManifestHash: 'local-manifest',
      sourceTagMax: 100,
      leaseHolderId: 'batch-1',
    })).rejects.toThrow('baseline changed');
  });

  test('rejects publish when another batch still holds the stream lease', async () => {
    const registrationRows = [
      {
        publishTarget: 'target-dev',
        environment: 'dev',
        publishType: 'card_data',
        targetFingerprint: 'fp-1',
        normalPublishEnabled: true,
        leaseHolderId: 'batch-other',
        leaseExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
      },
    ];
    let selectCount = 0;
    const remoteDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            then: (resolve: (value: unknown[]) => unknown) => {
              selectCount += 1;
              return resolve(selectCount === 1 ? registrationRows : []);
            },
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve([]),
          }),
        }),
      }),
    } as any;

    await expect(hsdataPublishTestUtils.assertRemotePublishGate(remoteDb, {
      publishTarget: 'target-dev',
      environment: 'dev',
      publishType: 'card_data',
      targetFingerprint: 'fp-1',
      manifestHash: 'incoming-manifest',
      previousManifestHash: null,
      sourceTagMax: 100,
      generationFingerprint: 'card-data-projector/v1',
      generationOrder: 1,
      leaseHolderId: 'batch-1',
    })).rejects.toThrow('is already leased by another publish batch');
  });

  test('rejects publish when incoming sourceTagMax regresses behind remote ledger', async () => {
    const registrationRows = [
      {
        publishTarget: 'target-dev',
        environment: 'dev',
        publishType: 'card_data',
        targetFingerprint: 'fp-1',
        normalPublishEnabled: true,
      },
    ];
    const ledgerRows = [
      {
        manifestHash: null,
        sourceTagMax: 101,
        generationFingerprint: 'card-data-projector/v1',
        generationOrder: 1,
      },
    ];
    let selectCount = 0;
    const remoteDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            then: (resolve: (value: unknown[]) => unknown) => {
              selectCount += 1;
              return resolve(selectCount === 1 ? registrationRows : ledgerRows);
            },
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve([{
              ...registrationRows[0],
              leaseHolderId: 'batch-1',
              leaseExpiresAt: new Date('2026-06-17T00:05:00.000Z'),
            }]),
          }),
        }),
      }),
    } as any;

    await expect(hsdataPublishTestUtils.assertRemotePublishGate(remoteDb, {
      publishTarget: 'target-dev',
      environment: 'dev',
      publishType: 'card_data',
      targetFingerprint: 'fp-1',
      manifestHash: 'incoming-manifest',
      previousManifestHash: null,
      sourceTagMax: 100,
      generationFingerprint: 'card-data-projector/v1',
      generationOrder: 1,
      leaseHolderId: 'batch-1',
    })).rejects.toThrow('sourceTagMax regressed');
  });

  test('rejects publish when generationOrder regresses behind remote ledger', async () => {
    const registrationRows = [
      {
        publishTarget: 'target-dev',
        environment: 'dev',
        publishType: 'card_data',
        targetFingerprint: 'fp-1',
        normalPublishEnabled: true,
      },
    ];
    const ledgerRows = [
      {
        manifestHash: 'remote-manifest',
        sourceTagMax: 100,
        generationFingerprint: 'card-data-projector/v2',
        generationOrder: 2,
      },
    ];
    let selectCount = 0;
    const remoteDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            then: (resolve: (value: unknown[]) => unknown) => {
              selectCount += 1;
              return resolve(selectCount === 1 ? registrationRows : ledgerRows);
            },
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve([{
              ...registrationRows[0],
              leaseHolderId: 'batch-1',
              leaseExpiresAt: new Date('2026-06-17T00:05:00.000Z'),
            }]),
          }),
        }),
      }),
    } as any;

    await expect(hsdataPublishTestUtils.assertRemotePublishGate(remoteDb, {
      publishTarget: 'target-dev',
      environment: 'dev',
      publishType: 'card_data',
      targetFingerprint: 'fp-1',
      manifestHash: 'incoming-manifest',
      previousManifestHash: 'remote-manifest',
      sourceTagMax: 100,
      generationFingerprint: 'card-data-projector/v1',
      generationOrder: 1,
      leaseHolderId: 'batch-1',
    })).rejects.toThrow('generationOrder regressed');
  });

  test('rejects publish when manifest hash diverges on the same generation lineage', async () => {
    const registrationRows = [
      {
        publishTarget: 'target-dev',
        environment: 'dev',
        publishType: 'card_data',
        targetFingerprint: 'fp-1',
        normalPublishEnabled: true,
      },
    ];
    const ledgerRows = [
      {
        manifestHash: 'remote-manifest',
        sourceTagMax: 100,
        generationFingerprint: 'card-data-projector/v1',
        generationOrder: 1,
      },
    ];
    let selectCount = 0;
    const remoteDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            then: (resolve: (value: unknown[]) => unknown) => {
              selectCount += 1;
              return resolve(selectCount === 1 ? registrationRows : ledgerRows);
            },
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve([{
              ...registrationRows[0],
              leaseHolderId: 'batch-1',
              leaseExpiresAt: new Date('2026-06-17T00:05:00.000Z'),
            }]),
          }),
        }),
      }),
    } as any;

    await expect(hsdataPublishTestUtils.assertRemotePublishGate(remoteDb, {
      publishTarget: 'target-dev',
      environment: 'dev',
      publishType: 'card_data',
      targetFingerprint: 'fp-1',
      manifestHash: 'incoming-manifest',
      previousManifestHash: 'remote-manifest',
      sourceTagMax: 100,
      generationFingerprint: 'card-data-projector/v1',
      generationOrder: 1,
      leaseHolderId: 'batch-1',
    })).rejects.toThrow('manifest diverged on the same lineage');
  });

  test('rejects lease renewal when the current batch no longer holds the stream lease', async () => {
    const remoteDb = {
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve([]),
          }),
        }),
      }),
    } as any;

    await expect(hsdataPublishTestUtils.renewRemotePublishLease(remoteDb, {
      publishTarget: 'target-dev',
      environment: 'dev',
      publishType: 'card_data',
      leaseHolderId: 'batch-1',
    })).rejects.toThrow('lease could not be renewed');
  });
});
