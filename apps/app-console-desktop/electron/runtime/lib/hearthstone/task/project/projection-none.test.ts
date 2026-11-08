import { expect, test } from 'bun:test';

import { mercAbilitySummonedMinionInput } from './cards/merc-ability-summoned-minion.fixture';
import { runProjection } from './cards/runner';

test('projection rejects a tag marked as absent and identifies the card and tag', () => {
  const input = structuredClone(mercAbilitySummonedMinionInput);
  expect(runProjection(input).relations.some(row => row.targetId === 'MERC_MINION_1')).toBe(true);

  input.tagMap[1676]!.projectKind = 'none';

  expect(() => runProjection(input)).toThrow(
    `Card ${input.card.cardId} (build ${input.build}) contains tag 1676 (lettuce-ability-summoned-minion), which is marked as absent from card data.`,
  );
});

test('source-provided reference and mechanic flags cannot bypass the absent tag check', () => {
  const input = structuredClone(mercAbilitySummonedMinionInput);
  const rawTag = input.tags.find(tag => tag.tagId === 1676)!;
  const profile = input.tagMap[1676]!;
  rawTag.tagValue = 1;
  rawTag.isReferenceTag = true;
  rawTag.isPowerKeywordTag = true;
  profile.normalizeKind = 'identity_int';

  const original = runProjection(input).entity;
  expect(original.referencedTags['1676']).toBe(true);
  expect(original.mechanics['1676']).toBe(1);

  profile.projectKind = 'none';
  expect(() => runProjection(input)).toThrow('contains tag 1676 (lettuce-ability-summoned-minion)');
});
