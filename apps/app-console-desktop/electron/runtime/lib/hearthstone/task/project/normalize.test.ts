import { expect, test } from 'bun:test';

import { runeInput } from './cards/rune.fixture';
import { reconstructInput } from './cards/runner';
import { normalizeHsdataTagValue } from './project';

test('hsdata fallback accepts known rarity values when the configurable map is empty', () => {
  const { tagMap, context } = reconstructInput(runeInput);
  const tag = { ...tagMap.get(203)!, slug: 'rarity', normalizeKind: 'enum_from_int', normalizeConfig: {} };
  const row = { intValue: 5, boolValue: null, stringValue: null, locStringValue: null, cardValue: null, jsonValue: null };

  expect(normalizeHsdataTagValue(row, tag, context)).toBe('legendary');
  expect(() => normalizeHsdataTagValue({ ...row, intValue: 99 }, tag, context)).toThrow('unknown enum value');
});
