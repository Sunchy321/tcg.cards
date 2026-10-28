import { describe, expect, test } from 'bun:test';

import { nameRubyKey, type NameRubyLookup } from '@tcg-cards/model/magic/name-ruby';

import { convertLegalities, projectCard, type AssembledCard } from './project-card';

/**
 * Build a minimal single-face card carrying only what the localization and
 * classification paths read. The golden fixtures cover the assembled shape
 * from real data; these cases cover adoption branches no real card currently
 * reaches.
 */
function card(overrides: Partial<AssembledCard> = {}): AssembledCard {
  return {
    unit:           'oracle-1',
    cardId:         'test-card',
    oracleId:       'oracle-1',
    layout:         'normal',
    setName:        'Test',
    set:            'tst',
    setType:        'expansion',
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

describe('mana cost projection', () => {
  test('preserves multiple generic symbols for display', () => {
    const source = card();
    const result = projectCard(card({
      faces: [{ ...source.faces[0]!, manaCost: '{2}{C}{C}{C}{2}' }],
    }));

    expect(result.cardParts[0]?.cost).toEqual(['2', 'C', 'C', 'C', '2']);
  });
});

describe('name ruby projection', () => {
  const printDraft = (overrides: Partial<NonNullable<AssembledCard['prints']>[number]> = {}): NonNullable<AssembledCard['prints']>[number] => ({
    lang:              'ja', set:               'tst', number:            '1', releasedAt:        '2020-01-01',
    layout:            'normal', frame:             'black', frameEffects:      null, borderColor:       'black', cardBackId:        null,
    securityStamp:     null, promoTypes:        null, rarity:            'common',
    isDigital:         false, isPromo:           false, isReprint:         false, finishes:          ['nonfoil'],
    imageStatus:       'lowres', inBooster:         false, games:             ['paper'],
    previewDate:       null, previewSource:     null, previewUri:        null,
    fullArt:           false, oversized:         false, storySpotlight:    false, textless:          false,
    isVariation:       false, variationOf:       null, artistIds:         null, resourceId:        null,
    scryfallOracleId:  'oracle-1', scryfallCardId:    'row-1', scryfallFace:      null,
    arenaId:           null, mtgoId:            null, mtgoFoilId:        null, multiverseIds:     [],
    tcgPlayerId:       null, tcgplayerEtchedId: null, cardMarketId:      null,
    faces:             [{ printedName: '包囲の搭', flavorName: '包围的塔' }],
    ...overrides,
  });

  const oracleFace = (name: string): AssembledCard['faces'][number] => ({
    name,
    typeLine:       'Artifact',
    oracleText:     null,
    manaCost:       null,
    cmc:            null,
    colors:         null,
    colorIndicator: null,
    power:          null,
    toughness:      null,
    loyalty:        null,
    defense:        null,
    handModifier:   null,
    lifeModifier:   null,
  });

  const rubies: NameRubyLookup = new Map([
    // Half-width entries are legacy-shaped input: the resolver normalizes them
    // to the full-width storage form.
    [nameRubyKey('ja', 'name', '包囲の搭'), {
      rubyName:   '包囲(ほうい)の搭(とう)',
      exceptions: { 'tst:1': '包囲(ほうい)の搭(たね)' },
    }],
    [nameRubyKey('ja', 'name', '裏面'), { rubyName: '裏面(うらめん)', exceptions: null }],
    [nameRubyKey('ja', 'flavor_name', '包围的塔'), { rubyName: '包围的塔(バオウェイダター)', exceptions: null }],
  ]);

  test('without a lookup the ruby columns stay unset', () => {
    const result = projectCard(card({ prints: [printDraft()] }));
    const print = result.prints[0]!;
    expect(print.rubyName).toBeUndefined();
    const part = result.printParts[0]!;
    expect(part.rubyName).toBeUndefined();
    expect(part.rubyFlavorName).toBeUndefined();
    // Localizations carry no ruby either.
    expect(result.cardLocalizations[0]!.rubyName).toBeUndefined();
    expect(result.cardPartLocalizations[0]!.rubyName).toBeUndefined();
  });

  test('fills print, part and flavor ruby columns from the authority', () => {
    const result = projectCard(card({ prints: [printDraft()] }), rubies);
    expect(result.prints[0]).toMatchObject({ name: '包囲の搭', rubyName: '包囲（ほうい）の搭（たね）' });
    expect(result.printParts[0]).toMatchObject({
      name:           '包囲の搭',
      rubyName:       '包囲（ほうい）の搭（たね）',
      flavorName:     '包围的塔',
      rubyFlavorName: '包围的塔（バオウェイダター）',
    });
  });

  test('a face without an authority entry resolves to null; the joined print name needs every face', () => {
    const twoFace = card({
      faces:  [oracleFace('Test Card'), oracleFace('裏面')],
      prints: [printDraft({ faces: [printDraft().faces[0]!, { printedName: '裏面' }] })],
    });
    const result = projectCard(twoFace, rubies);
    expect(result.prints[0]!.rubyName).toBe('包囲（ほうい）の搭（たね） // 裏面（うらめん）');
    expect(result.printParts[0]!.rubyName).toBe('包囲（ほうい）の搭（たね）');
    expect(result.printParts[1]!.rubyName).toBe('裏面（うらめん）');

    const miss = card({
      faces:  [oracleFace('Test Card'), oracleFace('裏面')],
      prints: [printDraft({ faces: [printDraft().faces[0]!, { printedName: '面なし' }] })],
    });
    const missResult = projectCard(miss, rubies);
    expect(missResult.prints[0]!.rubyName).toBeNull();
    expect(missResult.printParts[1]!.rubyName).toBeNull();
  });

  test('localization ruby resolves against the authority row and its source print', () => {
    const result = projectCard(card({
      prints:        [printDraft()],
      localizations: [{
        locale:     'ja',
        source:     '',
        faces:      [{ name: '包囲の搭', typeline: 'アーティファクト', text: null }],
        provenance: { set: 'tst', number: '1', releasedAt: '2020-01-01' },
      }],
    }), rubies);
    // The ja surface is print-established (provenance tst:1), so the exception
    // annotation for tst:1 matches it.
    expect(result.cardLocalizations.find(l => l.locale === 'ja')).toMatchObject({
      name:     '包囲の搭',
      rubyName: '包囲（ほうい）の搭（たね）',
    });
    expect(result.cardPartLocalizations.filter(l => l.locale === 'ja')[0]).toMatchObject({
      rubyName: '包囲（ほうい）の搭（たね）',
    });
    // English display rows carry no ruby — null when a lookup is supplied.
    expect(result.cardLocalizations.find(l => l.locale === 'en')!.rubyName).toBeNull();
  });

  test('a corrupt authority entry resolves to null instead of poisoning the row', () => {
    const corrupt: NameRubyLookup = new Map(rubies);
    corrupt.set(nameRubyKey('ja', 'name', '包囲の搭'), { rubyName: '包囲(ほうい', exceptions: null });
    const result = projectCard(card({ prints: [printDraft()] }), corrupt);
    expect(result.printParts[0]!.rubyName).toBeNull();
    expect(result.prints[0]!.rubyName).toBeNull();
  });
});

describe('classification seeds (ADR 0015 ticket 03)', () => {
  test('a normal card seeds primary', () => {
    const result = projectCard(card());
    expect(result.cards[0]).toMatchObject({ category: 'default', ambit: 'primary' });
  });

  test('a token card seeds additional, by type line and by layout', () => {
    const typed = projectCard(card({
      set:   'tang',
      faces: [{ ...card().faces[0]!, typeLine: 'Token Creature — Angel' }],
    }));
    expect(typed.cards[0]).toMatchObject({ category: 'token', ambit: 'additional' });

    // Morph/Manifest-style token rows print plain type lines; the layout carries them.
    const laid = projectCard(card({
      layout: 'token',
      set:    'tc18',
      faces:  [{ ...card().faces[0]!, typeLine: 'Creature', name: 'Manifest' }],
    }));
    expect(laid.cards[0]).toMatchObject({ category: 'token', ambit: 'additional' });
  });

  test('special-rule cards seed auxiliary/additional, by layout and by type-line prefix', () => {
    const emblemLayout = projectCard(card({ layout: 'scheme', set: 'tarc' }));
    expect(emblemLayout.cards[0]).toMatchObject({ category: 'auxiliary', ambit: 'additional' });

    // The Ring: a single-card double-faced token whose faces carry Emblem —
    // an in-game rule component, not a token and not a deckable card.
    const ring = projectCard(card({
      layout: 'double_faced_token',
      set:    'tltr',
      faces:  [
        { ...card().faces[0]!, name: 'The Ring', typeLine: 'Emblem' },
        { ...card().faces[0]!, name: 'The Ring Tempts You', typeLine: 'Card' },
      ],
    }));
    expect(ring.cards[0]).toMatchObject({ category: 'auxiliary', ambit: 'additional' });
  });

  test('helper cards seed auxiliary/additional', () => {
    const monarch = projectCard(card({
      layout: 'token',
      set:    'tblc',
      faces:  [{ ...card().faces[0]!, name: 'The Monarch', typeLine: 'Card' }],
    }));
    expect(monarch.cards[0]).toMatchObject({ category: 'auxiliary', ambit: 'additional' });

    const dungeon = projectCard(card({
      faces: [{ ...card().faces[0]!, name: 'Dungeon of the Mad Mage', typeLine: 'Dungeon' }],
    }));
    expect(dungeon.cards[0]).toMatchObject({ category: 'auxiliary', ambit: 'additional' });
  });

  test('funny sets seed additional without changing the category', () => {
    const unset = projectCard(card({ set: 'und', setType: 'funny' }));
    expect(unset.cards[0]).toMatchObject({ category: 'default', ambit: 'additional' });

    // A token in an Un-set still reads as a token; both branches land additional.
    const unToken = projectCard(card({ set: 'und', setType: 'funny', faces: [{ ...card().faces[0]!, typeLine: 'Token Creature — Squirrel' }] }));
    expect(unToken.cards[0]).toMatchObject({ category: 'token', ambit: 'additional' });
  });

  test('world-championship display inserts seed their display category at full', () => {
    const decklist = projectCard(card({
      set:   'wc03',
      faces: [{ ...card().faces[0]!, name: 'Aeo Paquette Decklist', typeLine: 'Card', oracleText: null }],
    }));
    expect(decklist.cards[0]).toMatchObject({ category: 'decklist', ambit: 'full' });

    const player = projectCard(card({
      set:   'wc02',
      faces: [{ ...card().faces[0]!, name: 'Ben Rubin Bio', typeLine: 'Card', oracleText: null }],
    }));
    expect(player.cards[0]).toMatchObject({ category: 'player', ambit: 'full' });

    const ad = projectCard(card({
      set:   'wc01',
      faces: [{ ...card().faces[0]!, name: '2001 World Championships Ad', typeLine: 'Card', oracleText: null }],
    }));
    expect(ad.cards[0]).toMatchObject({ category: 'advertisement', ambit: 'full' });

    // The same suffix outside a wc set is not a display card.
    const outside = projectCard(card({ faces: [{ ...card().faces[0]!, name: 'Fan Decklist', typeLine: 'Card' }] }));
    expect(outside.cards[0]).toMatchObject({ category: 'auxiliary', ambit: 'additional' });
  });

  test('minigame props seed full', () => {
    const result = projectCard(card({ setName: 'Kaldheim Minigames', set: 'mkhm', faces: [{ ...card().faces[0]!, name: 'Booster Blitz', typeLine: 'Card' }] }));
    expect(result.cards[0]).toMatchObject({ category: 'minigame', ambit: 'full' });
  });

  test('art-series input seeds art/full (assembly does not anchor art oracles yet)', () => {
    const result = projectCard(card({
      layout: 'art_series',
      set:    'astx',
      faces:  [
        { ...card().faces[0]!, name: 'Lightning Bolt', typeLine: 'Card', oracleText: null },
        { ...card().faces[0]!, name: 'Lightning Bolt', typeLine: 'Card', oracleText: null },
      ],
    }));
    expect(result.cards[0]).toMatchObject({ category: 'art', ambit: 'full' });
  });
});

describe('ambit override merge (ticket 03)', () => {
  test('an override replaces the seed', () => {
    const result = projectCard(card(), undefined, 'additional');
    expect(result.cards[0]).toMatchObject({ category: 'default', ambit: 'additional' });
  });

  test('an override wins over a token seed too', () => {
    const result = projectCard(card({ faces: [{ ...card().faces[0]!, typeLine: 'Token Creature — Angel' }] }), undefined, 'full');
    expect(result.cards[0]).toMatchObject({ category: 'token', ambit: 'full' });
  });

  test('no override row means the seed stands — deletion falls back', () => {
    const result = projectCard(card(), undefined, undefined);
    expect(result.cards[0]).toMatchObject({ category: 'default', ambit: 'primary' });
  });
});

test('Scryfall legalities use canonical format URL identifiers', () => {
  expect(convertLegalities({
    standardbrawl:    'legal',
    paupercommander:  'banned',
    duel:             'restricted',
    tlr:              'banned',
    predh:            'legal',
    gladiator:        'legal',
    oldschool:        'restricted',
    premodern:        'not_legal',
    competitivebrawl: 'legal',
  })).toEqual({
    'standard-brawl':     'legal',
    'pauper-commander':   'banned',
    'duelcommander':      'restricted',
    'tiny-leader-reborn': 'banned',
    'predh':              'legal',
    'gladiator':          'legal',
    'old-school':         'restricted',
    'premodern':          'unavailable',
    'competitive-brawl':  'legal',
  });
});
