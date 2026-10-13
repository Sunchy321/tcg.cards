import { describe, expect, test } from 'bun:test';

import { normalizeExtractedTagValue } from './normalize';
import type { TagRow } from './types';

/** Builds a Tag row whose enum_from_int config drives the normalization under test. */
function enumTag(enumId: number, slug: string, normalizeConfig: Record<string, unknown>): TagRow {
  return {
    enumId,
    slug,
    normalizeKind: 'enum_from_int',
    normalizeConfig,
  } as unknown as TagRow;
}

/** Empty projection context: no card or set lookups are needed for enum tests. */
function context() {
  return {
    cardIdByDbfId: new Map<number, string>(),
    setIdByDbfId:  new Map<number, string>(),
  };
}

describe('normalizeExtractedTagValue enum_from_int', () => {
  test('maps known enum values through the alias table', () => {
    expect(normalizeExtractedTagValue(92, enumTag(200, 'card_race', { enumMap: 'race' }), context())).toBe('naga');
    expect(normalizeExtractedTagValue(126, enumTag(200, 'card_race', { enumMap: 'race' }), context())).toBe('aberration');
  });

  test('treats INVALID (0) as an unset field', () => {
    expect(normalizeExtractedTagValue(0, enumTag(200, 'card_race', { enumMap: 'race' }), context())).toBeNull();
  });

  test('fails the projection on an unknown non-zero enum value', () => {
    expect(() => normalizeExtractedTagValue(85, enumTag(200, 'card_race', { enumMap: 'race' }), context()))
      .toThrow('[hearthstone][extracted-project] unknown enum value tag=200 (card_race) value=85');
  });

  test('keeps the raw int when the tag allows unknown enum values', () => {
    expect(normalizeExtractedTagValue(85, enumTag(200, 'card_race', { enumMap: 'race', allowUnknownEnumValue: true }), context())).toBe('85');
  });

  test('falls back to the known type table before failing', () => {
    expect(normalizeExtractedTagValue(4, enumTag(202, 'card_type', {}), context())).toBe('minion');
    expect(() => normalizeExtractedTagValue(99, enumTag(202, 'card_type', {}), context()))
      .toThrow('[hearthstone][extracted-project] unknown enum value tag=202 (card_type) value=99');
  });

  test('expands known multiclass bitmask bits into class slugs', () => {
    expect(normalizeExtractedTagValue(0b111, enumTag(476, 'multi_class', { enumMap: 'multiclass' }), context()))
      .toEqual(['death_knight', 'druid', 'hunter']);
    expect(normalizeExtractedTagValue(0, enumTag(476, 'multi_class', { enumMap: 'multiclass' }), context()))
      .toEqual([]);
  });

  test('fails the projection on an unmapped multiclass bit', () => {
    // Bit 15 sits past the last mapped TAG_CLASS value (14, demon_hunter).
    expect(() => normalizeExtractedTagValue(1 << 14, enumTag(476, 'multi_class', { enumMap: 'multiclass' }), context()))
      .toThrow('[hearthstone][extracted-project] unknown multiclass class tag=476 (multi_class) class=15');
  });

  test('resolves set values through the Set table for both slug styles', () => {
    const context = {
      cardIdByDbfId: new Map<number, string>(),
      setIdByDbfId:  new Map<number, string>([[15, 'tgt']]),
    };
    expect(normalizeExtractedTagValue(15, enumTag(183, 'set', { enumMap: 'set' }), context)).toBe('tgt');
    expect(normalizeExtractedTagValue(15, enumTag(183, 'card_set', { enumMap: 'set' }), context)).toBe('tgt');
    expect(normalizeExtractedTagValue(999, enumTag(183, 'set', { enumMap: 'set' }), context)).toBeNull();
  });

  test('passes explicit enumMap arrays through unchanged', () => {
    expect(normalizeExtractedTagValue(30, enumTag(476, 'multi_class', { enumMap: { 30: ['mage', 'hunter'] } }), context()))
      .toEqual(['mage', 'hunter']);
  });
});
