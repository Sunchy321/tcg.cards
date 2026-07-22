import { describe, expect, test } from 'bun:test';

import { RENDER_MECHANIC_IDS, TAG_ID, TAG_SLUG } from '@tcg-cards/model/src/hearthstone/constant/tag';

import { DISPLAY_TAG_ID } from './constant';
import { buildRenderModel } from './hash';
import type { LocalizationlessEntityRow, LocalizationlessLocalizationRow } from './types';

function entity(): LocalizationlessEntityRow {
  return {
    cardId:    'TEST_001',
    dbfId:     1,
    type:      'minion',
    cost:      1,
    classes:   [],
    set:       'core',
    elite:     false,
    mechanics: {
      [TAG_ID.DATA_NUM_1]:                   7,
      [TAG_ID.HIDDEN_CHOICE]:                2,
      [TAG_ID.DYNAMIC_KEYWORD1]:             1211,
      [TAG_ID.BACON_TRIPLED_BASE_MINION_ID]: 107909,
      [TAG_ID.MODULAR_ENTITY_PART_1]:        104948,
      999_999:                               42,
    },
    textBuilderType: 'default',
  } as unknown as LocalizationlessEntityRow;
}

function localization(): LocalizationlessLocalizationRow {
  return {
    cardId:   'TEST_001',
    lang:     'en',
    name:     'Test',
    richText: 'Deal {0} damage.',
  } as unknown as LocalizationlessLocalizationRow;
}

describe('buildRenderModel', () => {
  test('keeps model tag names aligned and sorted by GAME_TAG value', () => {
    expect(Object.keys(TAG_SLUG)).toEqual(Object.keys(TAG_ID));
    expect(Object.values(TAG_ID)).toEqual([...Object.values(TAG_ID)].sort((left, right) => left - right));
  });

  test('excludes fixed keyword lookup tags from render mechanics', () => {
    const renderMechanicIds = new Set(RENDER_MECHANIC_IDS);
    const fixedKeywordLookupTagIds: ReadonlySet<number> = new Set([
      TAG_ID.WINDFURY,
      TAG_ID.TAUNT,
      TAG_ID.STEALTH,
      TAG_ID.DIVINE_SHIELD,
      TAG_ID.MAGNETIC,
      TAG_ID.REBORN,
    ]);

    expect(Object.values(DISPLAY_TAG_ID)
      .filter(tagId => !fixedKeywordLookupTagIds.has(tagId))
      .every(tagId => renderMechanicIds.has(String(tagId))))
      .toBe(true);
    expect([...fixedKeywordLookupTagIds].every(tagId => !renderMechanicIds.has(String(tagId)))).toBe(true);
  });

  test('keeps whitelisted CardTextBuilder tags from mechanics', () => {
    const model = buildRenderModel(entity(), localization());

    expect(model.renderMechanics).toEqual({
      [TAG_ID.DATA_NUM_1]:                   7,
      [TAG_ID.MODULAR_ENTITY_PART_1]:        104948,
      [TAG_ID.HIDDEN_CHOICE]:                2,
      [TAG_ID.BACON_TRIPLED_BASE_MINION_ID]: 107909,
      [TAG_ID.DYNAMIC_KEYWORD1]:             1211,
    });
  });
});
