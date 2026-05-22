import { describe, expect, test } from 'bun:test';

import type { PublishCardManifestState } from './hsdata-publish';
import { hsdataPublishTestUtils } from './hsdata-publish';

/** One per-card manifest row constructed for publish diff tests. */
function createManifest(
  cardId: string,
  manifestHash: string,
  rowCount = 1,
): PublishCardManifestState {
  return {
    cardId,
    entityFamilyHash: `${cardId}-entity`,
    localizationFamilyHash: `${cardId}-loc`,
    relationFamilyHash: `${cardId}-rel`,
    manifestHash,
    entityRowCount: rowCount,
    localizationRowCount: rowCount,
    relationRowCount: rowCount,
  };
}

/** Previous manifest lookup rebuilt from one ordered row list. */
function createPreviousMap(rows: PublishCardManifestState[]) {
  return new Map(rows.map(row => [row.cardId, row]));
}

describe('hsdata publish batch plan', () => {
  test('keeps the migrated Rust insert/update/delete/unchanged semantics', () => {
    const previous = createPreviousMap([
      createManifest('card-b', 'same-hash'),
      createManifest('card-c', 'old-hash'),
      createManifest('card-d', 'removed-hash', 3),
    ]);
    const current = [
      createManifest('card-c', 'new-hash', 2),
      createManifest('card-a', 'insert-hash'),
      createManifest('card-b', 'same-hash'),
    ];

    const result = hsdataPublishTestUtils.buildPublishBatchPlanFromCurrentManifests(current, previous);

    expect(result.counts).toEqual({
      cardCount: 4,
      changedCardCount: 3,
      insertedCardCount: 1,
      updatedCardCount: 1,
      deletedCardCount: 1,
      unchangedCardCount: 1,
    });
    expect(result.plans.map(plan => [plan.cardId, plan.action])).toEqual([
      ['card-a', 'insert'],
      ['card-b', 'unchanged'],
      ['card-c', 'update'],
      ['card-d', 'delete'],
    ]);
    expect(result.plans.find(plan => plan.cardId === 'card-d')?.current).toMatchObject({
      entityFamilyHash: hsdataPublishTestUtils.emptyHash,
      localizationFamilyHash: hsdataPublishTestUtils.emptyHash,
      relationFamilyHash: hsdataPublishTestUtils.emptyHash,
      entityRowCount: 0,
      localizationRowCount: 0,
      relationRowCount: 0,
    });
  });

  test('derives one stable manifest hash independent of current-row order and deleted cards', () => {
    const previous = createPreviousMap([
      createManifest('card-z', 'gone-hash'),
    ]);
    const ordered = hsdataPublishTestUtils.buildPublishBatchPlanFromCurrentManifests([
      createManifest('card-a', 'hash-a'),
      createManifest('card-b', 'hash-b'),
    ], previous);
    const reversed = hsdataPublishTestUtils.buildPublishBatchPlanFromCurrentManifests([
      createManifest('card-b', 'hash-b'),
      createManifest('card-a', 'hash-a'),
    ], previous);

    expect(ordered.manifestHash).toBe(reversed.manifestHash);
  });
});
