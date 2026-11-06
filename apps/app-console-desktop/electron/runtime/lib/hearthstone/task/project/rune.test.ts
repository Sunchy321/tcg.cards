import { describe, expect, test } from 'bun:test';

import { repairRuneRows, runeTags } from '../../../../../../scripts/lib/hearthstone-runes';
import { runeInput } from './cards/rune.fixture';
import { runProjection } from './cards/runner';

describe('rune cost projection', () => {
  test.each([
    { counts: [2, 0, 0], expected: ['blood', 'blood'] },
    { counts: [0, 3, 0], expected: ['frost', 'frost', 'frost'] },
    { counts: [0, 0, 2], expected: ['unholy', 'unholy'] },
    { counts: [1, 1, 1], expected: ['blood', 'frost', 'unholy'] },
    { counts: [2, 0, 1], expected: ['blood', 'blood', 'unholy'] },
    { counts: [0, 0, 0], expected: null },
  ])('preserves rune costs $counts', ({ counts, expected }) => {
    const input = structuredClone(runeInput);

    input.tags = input.tags.filter(tag => !runeTags.some(config => config.enumId === tag.tagId));

    for (const [index, config] of runeTags.entries()) {
      input.tagMap[String(config.enumId)] = { slug: `cost-${config.enumId}`, ...config };
      input.tags.push({
        dbfId:             input.card.dbfId,
        tagId:             config.enumId,
        tagValue:          counts[index]!,
        isReferenceTag:    false,
        isPowerKeywordTag: false,
      });
    }

    const result = runProjection(input);

    expect(result.entity.rune).toEqual(expected == null ? null : [...expected]);
    expect(result.entity.mechanics).not.toHaveProperty('2196');
    expect(result.entity.mechanics).not.toHaveProperty('2197');
    expect(result.entity.mechanics).not.toHaveProperty('2198');
    expect(result.localizations[0]?.renderModel?.rune ?? null).toEqual(expected == null ? null : [...expected]);
  });

  test('repairs existing revisions exactly as a corrected source projection', () => {
    const original = runProjection(runeInput);
    const input = structuredClone(runeInput);
    for (const config of runeTags) {
      input.tagMap[String(config.enumId)] = { slug: `cost-${config.enumId}`, ...config };
    }
    const expected = runProjection(input);
    const repaired = repairRuneRows(
      [{ ...original.entity, version: [input.build] }],
      original.localizations,
      original.relations,
    );

    expect(original.entity.rune).toBeNull();
    expect(repaired.entities).toEqual([{ ...expected.entity, version: [input.build] }]);
    expect(repaired.localizations).toEqual(expected.localizations);
    expect(repairRuneRows(repaired.entities, repaired.localizations, repaired.relations)).toEqual(repaired);
  });

  test('merges version histories and updates outgoing relation revisions', () => {
    const original = runProjection(runeInput);
    const entity = { ...original.entity, version: [1] };
    const relation = {
      sourceId:           entity.cardId,
      sourceRevisionHash: entity.revisionHash,
      relation:           'hero_power',
      targetId:           'TARGET',
      version:            [1],
    };
    const first = repairRuneRows([entity], [], [relation]);
    const repaired = repairRuneRows(
      [entity, { ...first.entities[0]!, version: [2] }],
      [],
      [relation, { ...first.relations[0]!, version: [2] }],
    );

    expect(repaired.entities).toHaveLength(1);
    expect(repaired.entities[0]?.version).toEqual([1, 2]);
    expect(repaired.relations).toEqual([{
      ...relation,
      sourceRevisionHash: repaired.entities[0]!.revisionHash,
      version:            [1, 2],
    }]);
  });

  test('rejects invalid retained quantities before changing records', () => {
    const original = runProjection(runeInput);
    const entity = { ...original.entity, version: [1], mechanics: { 2196: 4 } };

    expect(() => repairRuneRows([entity], [], [])).toThrow('Invalid rune cost 4');
    expect(entity.mechanics).toEqual({ 2196: 4 });
    expect(entity.rune).toBeNull();
  });
});
