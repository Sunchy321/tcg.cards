import { describe, expect, test } from 'bun:test';

import {
  buildImageUrl,
  imageAssetKey,
  imageKindDirectory,
} from './image-config';
import {
  parseCardListPayload,
  shadowverseCardsUrl,
} from './cards-source';

/** Minimal valid cardList payload with one card, one set, and one style. */
function buildPayload(overrides?: { evo?: unknown, styleCount?: number }) {
  const style = {
    hash: 'a'.repeat(32),
    evo_hash: null,
    name: 'Style',
    name_ruby: null,
    cv: null,
    illustrator: 'artist',
    skill_text: '',
    flavour_text: '',
    evo_flavour_text: '',
  };

  return {
    data_headers: { result_code: 1 },
    data: {
      cards: {
        10461210: { related_card_ids: [10461210], specific_effect_card_ids: [10461212] },
      },
      card_details: {
        10461210: {
          common: {
            card_id: 10461210,
            name: 'Awed and Inspired',
            name_ruby: null,
            base_card_id: 10461210,
            card_resource_id: 104612100,
            atk: 0,
            life: 0,
            flavour_text: 'flavour',
            skill_text: '<b>Engage</b>',
            card_set_id: 10004,
            type: 2,
            class: 6,
            tribes: [0],
            cost: 2,
            rarity: 1,
            cv: 'Joe Zieja',
            illustrator: '',
            questions: null,
            is_token: false,
            is_include_rotation: true,
            deck_enabled_num: 3,
            card_image_hash: 'b'.repeat(32),
            card_banner_image_hash: 'c'.repeat(32),
            original_card_id: null,
            is_starter_ability_changed: false,
            brand_new_source_field: 1,
          },
          evo: overrides?.evo ?? [],
          style_card_list: Array.from({ length: overrides?.styleCount ?? 1 }, () => style),
        },
      },
      count: 1,
      card_set_names: { 10004: 'Canvas of Celestial Legends' },
      tribe_names: { 0: '—' },
      skill_names: {},
      skill_replace_text_names: {},
      sort_card_id_list: [10461210],
      stats_list: ['atk', 'life', 'cost'],
    },
  };
}

describe('cards-source', () => {
  test('exposes the fixed official endpoint', () => {
    expect(shadowverseCardsUrl).toBe('https://shadowverse-wb.com/web/CardList/cardList');
  });

  test('parses a valid payload into a normalized snapshot', () => {
    const snapshot = parseCardListPayload(buildPayload(), 'en');

    expect(snapshot.count).toBe(1);
    expect(snapshot.cards).toHaveLength(1);
    expect(snapshot.cards[0]!.cardId).toBe(10461210);
    expect(snapshot.cards[0]!.common.name).toBe('Awed and Inspired');
    expect(snapshot.cards[0]!.evo).toBeNull();
    expect(snapshot.cards[0]!.styles).toHaveLength(1);
    expect(snapshot.relations[10461210]?.specific_effect_card_ids).toEqual([10461212]);
    expect(snapshot.cardSetNames[10004]).toBe('Canvas of Celestial Legends');
  });

  test('normalizes an object evo payload and rejects mismatched card ids', () => {
    const evo = {
      card_resource_id: 104612101,
      flavour_text: 'evo flavour',
      skill_text: '',
      card_image_hash: 'd'.repeat(32),
      card_banner_image_hash: null,
    };
    const parsed = parseCardListPayload(buildPayload({ evo }), 'en');
    expect(parsed.cards[0]!.evo).toEqual(evo);

    const bad = buildPayload();
    (bad.data.card_details[10461210]!.common as Record<string, unknown>).card_id = 999;
    expect(() => parseCardListPayload(bad, 'en')).toThrow(/does not match/);
  });

  test('collects unknown payload fields for schema-drift reporting', () => {
    const snapshot = parseCardListPayload(buildPayload(), 'en');
    expect(snapshot.unknownFields).toContain('common.brand_new_source_field');
  });

  test('rejects payloads with a failure result code', () => {
    const payload = buildPayload();
    payload.data_headers.result_code = 0;
    expect(() => parseCardListPayload(payload, 'en')).toThrow(/result_code/);
  });
});

describe('image-config', () => {
  test('maps full-art kinds to card/ and banner kinds to list/', () => {
    expect(imageKindDirectory('card')).toBe('card');
    expect(imageKindDirectory('card_evo')).toBe('card');
    expect(imageKindDirectory('style_card')).toBe('card');
    expect(imageKindDirectory('banner')).toBe('list');
    expect(imageKindDirectory('banner_evo')).toBe('list');
    expect(imageKindDirectory('style_evo')).toBe('card');
  });

  test('builds language-scoped uploads urls', () => {
    expect(buildImageUrl('en', 'card', 'a'.repeat(32)))
      .toBe(`https://shadowverse-wb.com/uploads/card_image/eng/card/${'a'.repeat(32)}.png`);
    expect(buildImageUrl('chs', 'banner', 'b'.repeat(32)))
      .toBe(`https://shadowverse-wb.com/uploads/card_image/chs/list/${'b'.repeat(32)}.png`);
    expect(buildImageUrl('ko', 'card_evo', 'c'.repeat(32)))
      .toBe(`https://shadowverse-wb.com/uploads/card_image/kor/card/${'c'.repeat(32)}.png`);
  });

  test('builds stable asset keys', () => {
    expect(imageAssetKey('ja', 'style_card', 10461210, 2)).toBe('ja:style_card:10461210:2');
  });
});
