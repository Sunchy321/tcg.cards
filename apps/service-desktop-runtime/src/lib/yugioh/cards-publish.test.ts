import { describe, expect, test } from 'bun:test';

import {
  RemoteIdentityDriftError,
  assertPublishedManifest,
  assertRemoteLedgerCompatible,
  assertRemoteIdentityCompatible,
  assertRemoteRowsRecoverable,
  buildRemoteCardValues,
  buildCardPublishPlan,
  describePublishChunkFailure,
  hashCardRow,
  remoteIdentitySequenceState,
  selectResumablePublishRows,
} from './cards-publish';

import type { PublishCardRow } from './cards-publish';

/** Complete card row used by deterministic publish-plan tests. */
function makeCard(overrides: Partial<PublishCardRow> = {}): PublishCardRow {
  return {
    id: 1,
    cid: 4007,
    password: '89631139',
    cnName: '青眼白龙',
    scName: '青眼白龙',
    mdName: null,
    nwbbsName: null,
    cnocgName: null,
    jpRuby: null,
    jpName: null,
    enName: 'Blue-Eyes White Dragon',
    mdEnName: null,
    wikiEnName: null,
    setExt: null,
    typesText: '[怪兽|通常]',
    pendulumDescription: null,
    description: '传说之龙。',
    ot: 11,
    setcode: 221n,
    type: 17,
    attack: 3000,
    defense: 2500,
    level: 8,
    race: 8192,
    attribute: 16,
    primaryImageR2Bucket: null,
    primaryImageR2Key: null,
    primaryImageContentType: null,
    primaryImageByteSize: null,
    primaryImageWidth: null,
    primaryImageHeight: null,
    primaryImageSha256: null,
    primaryImageDeletedAt: null,
    createdAt: new Date('2026-08-05T00:00:00.000Z'),
    updatedAt: new Date('2026-08-05T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

describe('buildCardPublishPlan', () => {
  test('plans inserts for cards absent from the previous baseline', () => {
    const plan = buildCardPublishPlan([makeCard()], new Map());

    expect(plan.rows).toEqual([
      expect.objectContaining({ cardId: 1, action: 'insert' }),
    ]);
    expect(plan.counts).toEqual({
      totalRowCount: 1,
      changedRowCount: 1,
      insertedRowCount: 1,
      updatedRowCount: 0,
      unchangedRowCount: 0,
    });
    expect(plan.manifestHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test('plans unchanged and updated rows from stable hashes', () => {
    const original = makeCard();
    const previous = new Map([[original.id, hashCardRow(original)]]);

    expect(buildCardPublishPlan([original], previous).rows[0]?.action).toBe('unchanged');
    expect(buildCardPublishPlan([
      makeCard({ description: 'updated' }),
    ], previous).rows[0]?.action).toBe('update');
  });

  test('rejects a physically missing local row from the prior baseline', () => {
    expect(() => buildCardPublishPlan([], new Map([[1, 'old-hash']]))).toThrow(
      'Local card 1 disappeared instead of being soft-deleted.',
    );
  });
});

describe('buildRemoteCardValues', () => {
  test('preserves the authoritative local identity and exact BIGINT setcode', () => {
    const values = buildRemoteCardValues(makeCard({ id: 987, setcode: 132858190492402140n }));

    expect(values.id).toBe(987);
    expect(values.setcode).toBe(132858190492402140n);
  });

  test('copies soft deletion as a normal remote update field', () => {
    const deletedAt = new Date('2026-08-05T01:00:00.000Z');

    expect(buildRemoteCardValues(makeCard({ deletedAt })).deletedAt).toEqual(deletedAt);
  });

  test('copies primary-image facts and includes them in the card manifest', () => {
    const image = {
      primaryImageR2Bucket: 'asset',
      primaryImageR2Key: 'yugioh/card/v1/primary/ab/abcdef.webp',
      primaryImageContentType: 'image/webp',
      primaryImageByteSize: 123456,
      primaryImageWidth: 421,
      primaryImageHeight: 614,
      primaryImageSha256: 'a'.repeat(64),
      primaryImageDeletedAt: null,
    };
    const card = makeCard(image);

    expect(buildRemoteCardValues(card)).toMatchObject(image);
    expect(hashCardRow(card)).not.toBe(hashCardRow(makeCard()));
  });
});

describe('assertRemoteIdentityCompatible', () => {
  test('accepts an empty target and an exact preserved-ID replica', () => {
    const card = makeCard();

    expect(() => assertRemoteIdentityCompatible([card], [])).not.toThrow();
    expect(() => assertRemoteIdentityCompatible([card], [card])).not.toThrow();
  });

  test('rejects a cid assigned to a different remote ID', () => {
    expect(() => assertRemoteIdentityCompatible(
      [makeCard()],
      [makeCard({ id: 2 })],
    )).toThrow(RemoteIdentityDriftError);
  });

  test('rejects remote rows not produced by the local authority', () => {
    expect(() => assertRemoteIdentityCompatible(
      [makeCard()],
      [makeCard(), makeCard({ id: 2, cid: 4008, password: null })],
    )).toThrow('Remote card 2 does not exist in the local authoritative dataset.');
  });
});

describe('remote publish safeguards', () => {
  test('accepts an empty first target and rejects remote rows without a ledger', () => {
    expect(() => assertRemoteLedgerCompatible({
      expectedManifestHash: null,
      targetEnvironment: 'test',
      targetFingerprint: 'fingerprint',
      remoteManifestHash: 'empty-hash',
      remoteRowCount: 0,
      allowIntermediateManifest: false,
      ledger: null,
    })).not.toThrow();

    expect(() => assertRemoteLedgerCompatible({
      expectedManifestHash: null,
      targetEnvironment: 'test',
      targetFingerprint: 'fingerprint',
      remoteManifestHash: 'unexpected-hash',
      remoteRowCount: 1,
      allowIntermediateManifest: false,
      ledger: null,
    })).toThrow(RemoteIdentityDriftError);
  });

  test('requires the ledger and live remote manifest to match the local baseline', () => {
    const input = {
      expectedManifestHash: 'baseline-hash',
      targetEnvironment: 'test',
      targetFingerprint: 'fingerprint',
      remoteManifestHash: 'baseline-hash',
      remoteRowCount: 1,
      allowIntermediateManifest: false,
      ledger: {
        environment: 'test',
        targetFingerprint: 'fingerprint',
        manifestHash: 'baseline-hash',
        totalRowCount: 1,
      },
    };

    expect(() => assertRemoteLedgerCompatible(input)).not.toThrow();
    expect(() => assertRemoteLedgerCompatible({
      ...input,
      remoteManifestHash: 'drifted-hash',
    })).toThrow('Remote card manifest differs from its last publish ledger.');
  });

  test('accepts only baseline or planned row values while recovering an interrupted batch', () => {
    const previous = makeCard();
    const current = makeCard({ description: 'updated' });
    const rows = [{
      cardId: 1,
      previousRowHash: hashCardRow(previous),
      rowHash: hashCardRow(current),
      status: 'pending',
    }];

    expect(() => assertRemoteRowsRecoverable([previous], rows)).not.toThrow();
    expect(() => assertRemoteRowsRecoverable([current], rows)).not.toThrow();
    expect(() => assertRemoteRowsRecoverable([
      makeCard({ description: 'uncontrolled drift' }),
    ], rows)).toThrow('Remote card 1 differs from both the baseline and the planned row.');
  });

  test('requires applied and skipped rows to retain their planned values', () => {
    const previous = makeCard();
    const current = makeCard({ description: 'updated' });
    const row = {
      cardId: 1,
      previousRowHash: hashCardRow(previous),
      rowHash: hashCardRow(current),
      status: 'applied',
    };

    expect(() => assertRemoteRowsRecoverable([current], [row])).not.toThrow();
    expect(() => assertRemoteRowsRecoverable([previous], [row])).toThrow(
      'Applied remote card 1 no longer matches its planned row.',
    );
  });

  test('resumes only pending rows after an interrupted chunk', () => {
    const rows = [
      { cardId: 3, status: 'pending' as const },
      { cardId: 1, status: 'applied' as const },
      { cardId: 2, status: 'pending' as const },
      { cardId: 4, status: 'skipped' as const },
    ];

    expect(selectResumablePublishRows(rows).map(row => row.cardId)).toEqual([2, 3]);
  });

  test('records failed chunk card IDs without changing their pending state', () => {
    expect(describePublishChunkFailure([9, 4], new Error('write failed'))).toEqual({
      batchError: 'Cards 4, 9 failed: write failed',
      rowError: 'write failed',
    });
  });

  test('calibrates the remote identity state to the preserved maximum ID', () => {
    expect(remoteIdentitySequenceState([])).toEqual({ value: 1, isCalled: false });
    expect(remoteIdentitySequenceState([4, 21, 9])).toEqual({ value: 21, isCalled: true });
  });

  test('requires final remote hash and row count to equal the local manifest', () => {
    expect(() => assertPublishedManifest('hash', 2, 'hash', 2)).not.toThrow();
    expect(() => assertPublishedManifest('hash', 2, 'hash', 1)).toThrow(
      'Remote row count 1 does not match local row count 2.',
    );
  });
});
