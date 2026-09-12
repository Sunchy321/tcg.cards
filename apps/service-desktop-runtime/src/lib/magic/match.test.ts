import { describe, expect, test } from 'bun:test';

import { slugifyName, slugifySlugInput } from '@tcg-cards/shared/magic/slug';

import { isSingleCardDoubleFacedToken, slugifyCard, toMatchUnits, type MatchRow, type NormalizedCard } from './match';

describe('slugifyName', () => {
  test('drops apostrophes', () => {
    expect(slugifyName('Briber\'s Purse')).toBe('bribers-purse');
  });

  test('decomposes diacritics to base letters without a separator', () => {
    expect(slugifyName('Jöse')).toBe('jose');
  });

  test('trims leading/trailing separators', () => {
    expect(slugifyName('  Aetherflux Reservoir  ')).toBe('aetherflux-reservoir');
  });

  test('marks double-face with the double-dash boundary', () => {
    expect(slugifyName('Fire // Ice')).toBe('fire--ice');
  });

  test('marks single-slash double-face shorthand', () => {
    expect(slugifyName('Fire/Ice')).toBe('fire--ice');
  });

  test('exempts the single-faced Summon: Choco/Mog', () => {
    expect(slugifyName('Summon: Choco/Mog')).toBe('summon-choco-mog');
  });

  test('normalizes underscore-only names to one canonical slug', () => {
    expect(slugifyName('_____')).toBe('_____');
    expect(slugifyName('_')).toBe('_____');
    expect(slugifyName('___')).toBe('_____');
  });

  test('keeps blank prefixes only for underscore runs of 4+', () => {
    expect(slugifyName('_____ Goblin')).toBe('_____-goblin');
    expect(slugifyName('___ Goblin')).toBe('goblin');
    expect(slugifyName('foo_bar')).toBe('foo-bar');
    expect(slugifyName('foo_____bar')).toBe('foo_____bar');
  });
});

describe('slugifySlugInput', () => {
  test('keeps the ! marker in place', () => {
    expect(slugifySlugInput('zombie!b-22')).toBe('zombie!b-22');
  });

  test('keeps underscores in place as typed', () => {
    expect(slugifySlugInput('my_slug')).toBe('my_slug');
    expect(slugifySlugInput('___')).toBe('___');
  });

  test('still normalizes other separators', () => {
    expect(slugifySlugInput('  My Slug  ')).toBe('my-slug');
  });
});

function token(overrides: Partial<NormalizedCard> & { face?: Partial<NormalizedCard['faces'][0]> }): NormalizedCard {
  return {
    layout:  'token',
    setName: 'Ravnica Allegiance',
    faces:   [{
      name:       'Bird',
      typeLine:   'Token Creature — Bird',
      oracleText: 'Flying',
      colors:     ['W'],
      power:      '1',
      toughness:  '1',
      ...overrides.face,
    }],
    ...overrides,
  };
}

describe('slugifyCard', () => {
  test('encodes a keyword token with color and power/toughness', () => {
    expect(slugifyCard(token({}))).toBe('bird!w-11-f');
  });

  test('joins multi-word keyword lines', () => {
    const card = token({ face: { oracleText: 'Flying, hexproof' } });
    expect(slugifyCard(card)).toBe('bird!w-11-fx');
  });

  test('marks a non-keyword ability line as a', () => {
    const card = token({ face: { oracleText: 'Haste\nAt the beginning of your end step, exile this creature.' } });
    expect(slugifyCard(card)).toBe('bird!w-11-ha');
  });

  test('uses c for a colorless token', () => {
    const card = token({ face: { colors: [], power: null, toughness: null, oracleText: null } });
    expect(slugifyCard(card)).toBe('bird!c');
  });

  test('drops to the name slug for a simple token', () => {
    const card = token({ face: { name: 'Treasure', typeLine: 'Token Artifact — Treasure', oracleText: '"{T}, Sacrifice this artifact: Add one mana of any color."' } });
    expect(slugifyCard(card)).toBe('treasure!');
  });

  test('uses the name slug when it differs from the subtype', () => {
    const card = token({ face: { name: 'Peach Child', typeLine: 'Token Creature — Peach' } });
    expect(slugifyCard(card)).toBe('peach-child!');
  });

  test('appends e for enchantment creature tokens', () => {
    const card = token({ face: { typeLine: 'Token Enchantment Creature — Bird' } });
    expect(slugifyCard(card)).toBe('bird!w-11-f-e');
  });

  test('appends a for artifact creature tokens', () => {
    const card = token({ face: { typeLine: 'Token Artifact Creature — Bird' } });
    expect(slugifyCard(card)).toBe('bird!w-11-f-a');
  });

  test('appends both type markers in e-then-a order', () => {
    const card = token({ face: { typeLine: 'Token Artifact Enchantment Creature — Bird' } });
    expect(slugifyCard(card)).toBe('bird!w-11-f-e-a');
  });

  test('returns the name slug for a token without a subtype', () => {
    const card = token({ face: { typeLine: 'Token Artifact', oracleText: null } });
    expect(slugifyCard(card)).toBe('bird!');
  });

  test('keeps the plain name for a card-ish token without a subtype', () => {
    const card = token({ face: { typeLine: 'Token Creature Card', oracleText: null } });
    expect(slugifyCard(card)).toBe('bird');
  });

  test('collapses to the Incubator marker', () => {
    const card = token({ face: { name: 'Incubator', typeLine: 'Token Artifact — Incubator', oracleText: '"{2}: Transform this artifact."' } });
    expect(slugifyCard(card)).toBe('incubator!');
  });

  test('joins double-face names with the double-dash boundary', () => {
    const card = token({
      layout: 'split',
      faces:  [{ name: 'Fire', typeLine: 'Instant', oracleText: null, colors: ['R'], power: null, toughness: null }],
    });
    expect(slugifyCard(card)).toBe('fire');
  });

  test('uses only the first face for reversible cards', () => {
    const card = token({
      layout: 'reversible_card',
      faces:  [
        { name: 'A', typeLine: 'Creature — Goblin', oracleText: null, colors: ['R'], power: '1', toughness: '1' },
        { name: 'A', typeLine: 'Creature — Goblin', oracleText: null, colors: ['R'], power: '1', toughness: '1' },
      ],
    });
    expect(slugifyCard(card)).toBe('a');
  });

  test('returns the plain name for a minigame card', () => {
    const card = token({ layout: 'normal', setName: 'Unfinity Minigames', face: { typeLine: 'Creature — Goblin' } });
    expect(slugifyCard(card)).toBe('bird');
  });

  test('appends theme colors for theme-color cards', () => {
    const card = token({ layout: 'normal', face: { typeLine: 'Legendary Creature — Shapeshifter', oracleText: '(Theme Color: {W}{U})', colors: ['W', 'U'] } });
    expect(slugifyCard(card)).toBe('bird-wu');
  });

  test('derives the canonical underscore slug for an underscore-only card', () => {
    const card = token({ layout: 'normal', face: { name: '_____', typeLine: 'Creature — Goblin' } });
    expect(slugifyCard(card)).toBe('_____');
  });
});

function row(overrides: Partial<MatchRow> & { faces?: Record<string, unknown>[] }): MatchRow {
  return {
    oracleId:   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    layout:     'normal',
    name:       'Bird',
    typeLine:   'Creature — Bird',
    oracleText: 'Flying',
    colors:     ['W'],
    power:      '1',
    toughness:  '1',
    setName:    'Ravnica Allegiance',
    cardFaces:  overrides.faces ?? null,
    ...overrides,
  };
}

describe('isSingleCardDoubleFacedToken', () => {
  test('keeps the Start Your Engines speed marker as one card', () => {
    expect(isSingleCardDoubleFacedToken(['Start Your Engines!', 'Max Speed'])).toBe(true);
  });

  test('keeps continued playtest cards as one card', () => {
    expect(isSingleCardDoubleFacedToken(['Base Race', 'Base Race (cont\'d)'])).toBe(true);
    expect(isSingleCardDoubleFacedToken(['Demon\'s Due (minigame)', 'Demon\'s Due (cont\'d)'])).toBe(true);
  });

  test('still splits regular two-token objects', () => {
    expect(isSingleCardDoubleFacedToken(['Goblin', 'Soldier'])).toBe(false);
    expect(isSingleCardDoubleFacedToken(['Goblin', 'Blood'])).toBe(false);
  });
});

describe('toMatchUnits', () => {
  test('keeps a single-faced row as one unit keyed by oracle_id', () => {
    const units = toMatchUnits(row({}));
    expect(units).toHaveLength(1);
    expect(units[0]!.key).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(units[0]!.card.layout).toBe('normal');
    expect(units[0]!.card.faces).toEqual([{
      name:       'Bird', typeLine:   'Creature — Bird', oracleText: 'Flying',
      colors:     ['W'], power:      '1', toughness:  '1',
    }]);
  });

  test('uses card_faces for a normal multi-faced card as one unit', () => {
    const units = toMatchUnits(row({
      name:      'Fire // Ice',
      layout:    'split',
      cardFaces: [
        { name: 'Fire', type_line: 'Instant', oracle_text: null, colors: ['R'], power: null, toughness: null },
        { name: 'Ice', type_line: 'Instant', oracle_text: null, colors: ['U'], power: null, toughness: null },
      ],
    }));
    expect(units).toHaveLength(1);
    expect(units[0]!.key).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(units[0]!.card.faces.map(f => f.name)).toEqual(['Fire', 'Ice']);
  });

  test('splits a double_faced_token into two token units keyed by face index', () => {
    const units = toMatchUnits(row({
      layout:    'double_faced_token',
      cardFaces: [
        { name: 'Vampire', type_line: 'Token Creature — Vampire', oracle_text: 'Lifelink', colors: ['W'], power: '1', toughness: '1' },
        { name: 'Treasure', type_line: 'Token Artifact — Treasure', oracle_text: '{T}, Sacrifice this artifact: Add one mana of any color.', colors: [], power: null, toughness: null },
      ],
    }));
    expect(units).toHaveLength(2);
    expect(units[0]!.key).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:0');
    expect(units[0]!.card.layout).toBe('token');
    expect(units[0]!.card.faces[0]!.name).toBe('Vampire');
    expect(units[1]!.key).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:1');
    expect(units[1]!.card.layout).toBe('token');
    expect(units[1]!.card.faces[0]!.name).toBe('Treasure');
  });
});
