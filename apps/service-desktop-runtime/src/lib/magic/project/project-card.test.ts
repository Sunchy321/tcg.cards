import { describe, expect, test } from 'bun:test';

import { projectCard, type AssembledCard } from './project-card';

/**
 * Build a minimal single-face card carrying only what the localization path
 * reads. The golden fixtures cover the assembled shape from real data; these
 * cases cover adoption branches that no real card currently reaches.
 */
function card(overrides: Partial<AssembledCard> = {}): AssembledCard {
  return {
    unit:           'oracle-1',
    cardId:         'test-card',
    oracleId:       'oracle-1',
    layout:         'normal',
    setName:        'Test',
    cmc:            1,
    colorIdentity:  ['U'],
    keywords:       [],
    producedMana:   null,
    reserved:       false,
    contentWarning: null,
    legalities:     {},
    faces:          [{
      name:           'Test Card',
      typeLine:       'Sorcery',
      oracleText:     'Draw a card.',
      manaCost:       '{U}',
      cmc:            1,
      colors:         ['U'],
      colorIndicator: null,
      power:          null,
      toughness:      null,
      loyalty:        null,
      defense:        null,
      handModifier:   null,
      lifeModifier:   null,
    }],
    ...overrides,
  };
}

const PRINT_SURFACE = {
  locale:     'zhs',
  source:     '',
  faces:      [{ name: '测试牌', typeline: '法术', text: '抓一张牌。' }],
  provenance: { set: 'tst', number: '1', releasedAt: '2020-01-01' },
};

describe('localization authority', () => {
  test('drops an incomplete community translation instead of filling it in', () => {
    const result = projectCard(card({
      mtgch: { faces: [{ name: '测试牌', typeline: '法术', text: null }] },
    }));

    expect(result.authorities).toEqual([]);
    expect(result.cardLocalizations.map(l => l.locale)).toEqual(['en']);
    expect(result.cardPartLocalizations.map(l => l.locale)).toEqual(['en']);
  });

  test('leaves the print surface standing in when the community translation is incomplete', () => {
    const result = projectCard(card({
      localizations: [PRINT_SURFACE],
      mtgch:         { faces: [{ name: '测试牌', typeline: '法术', text: null }] },
    }));

    expect(result.authorities).toHaveLength(1);
    expect(result.authorities[0]).toMatchObject({
      locale: 'zhs', source: '', text: '抓一张牌。', sourceSet: 'tst', sourceNumber: '1',
    });
    expect(result.reviews).toEqual([]);
  });

  test('lets a complete community translation take the official standard row', () => {
    const result = projectCard(card({
      localizations: [PRINT_SURFACE],
      mtgch:         { faces: [{ name: '测试牌', typeline: '法术', text: '抽一张牌。' }] },
    }));

    const authority = result.authorities[0]!;
    expect(authority).toMatchObject({ locale: 'zhs', source: '', text: '抽一张牌。' });
    // Community text is not print-established, so no print is recorded.
    expect(authority.sourceSet).toBeUndefined();
    expect(authority.sourceNumber).toBeUndefined();
    expect(authority.sourceReleaseDate).toBeUndefined();

    const localization = result.cardLocalizations.find(l => l.locale === 'zhs');
    expect(localization?.source).toBe('');
    expect(localization?.name).toBe('测试牌');

    // The replaced print surface is recorded for audit.
    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0]).toMatchObject({
      kind:    'card_field_overwrite',
      subject: { cardId: 'test-card', locale: 'zhs', source: 'mtgch', fieldPath: 'text' },
      status:  'pending',
    });
  });

  test('turns a complete community translation into a folk substitute row when there is no print surface', () => {
    const result = projectCard(card({
      mtgch: { faces: [{ name: '测试牌', typeline: '法术', text: '抽一张牌。' }] },
    }));

    expect(result.authorities).toEqual([{
      cardId:    'test-card',
      version:   '',
      locale:    'zhs',
      source:    'mtgch',
      name:      '测试牌',
      typeline:  '法术',
      text:      '抽一张牌。',
      partCount: 1,
    }]);
    expect(result.cardLocalizations.find(l => l.locale === 'zhs')?.source).toBe('mtgch');
    expect(result.reviews).toEqual([]);
  });

  test('adopts a translation whose missing text the card does not have either', () => {
    // A vanilla creature has no rules text to translate, so a community row
    // carrying only its name and type line is complete, not incomplete — the
    // name is what the card would otherwise lose.
    const vanilla = card({
      faces: [{ ...card().faces[0]!, oracleText: '' }],
      mtgch: { faces: [{ name: '测试牌', typeline: '生物', text: null }] },
    });

    expect(projectCard(vanilla).authorities).toEqual([{
      cardId:    'test-card',
      version:   '',
      locale:    'zhs',
      source:    'mtgch',
      name:      '测试牌',
      typeline:  '生物',
      text:      '',
      partCount: 1,
    }]);
  });
});
