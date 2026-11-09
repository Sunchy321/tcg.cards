import { describe, expect, test } from 'bun:test';
import { compareBanlists } from './compare';
import { parseListSections } from './parse';
import { sourceForFormat } from './sources';
import type { Legality } from '@tcg-cards/model/magic/schema/announcement';
import type { OfficialSource } from './types';

const source: OfficialSource = {
  id:      'wizards', name:    'Wizards', url:     'https://magic.wizards.com/en/banned-restricted-list',
  formats: ['standard'], parser:  'wizards',
};
const names = [
  { cardId: 'profts-eidetic-memory', name: 'Proft\'s Eidetic Memory', localizedName: null },
  { cardId: 'leyline-of-resonance', name: 'Leyline of Resonance', localizedName: null },
];

/** Runs the real parser and comparison against a small official-list fragment. */
function compare(rows: string[], banlist: { cardId: string, status: Legality }[] = [], cards = names) {
  const official = parseListSections(`<h2>STANDARD BANNED CARDS</h2><p>The following cards are banned:</p><ul>${rows.map(row => `<li>${row}</li>`).join('')}</ul>`, source, 'standard', '2026-10-15');
  return compareBanlists('standard', official, { banlist }, cards);
}

describe('official list row matching', () => {
  test('matches the published typo and the BO1 exception without false missing entries', () => {
    const report = compare(['Proft\'s Eiditic Memory', 'Leyline of Resonance (only in *MTG Arena* Best-of-One)', '   '], [
      { cardId: 'profts-eidetic-memory', status: 'banned' },
      { cardId: 'leyline-of-resonance', status: 'banned_in_bo1' },
    ]);
    expect(report.status).toBe('consistent');
    expect(report.approximateMatches).toEqual([
      { cardId: 'leyline-of-resonance', officialName: 'Leyline of Resonance (only in *MTG Arena* Best-of-One)', localName: 'Leyline of Resonance', method: 'parentheses' },
      { cardId: 'profts-eidetic-memory', officialName: 'Proft\'s Eiditic Memory', localName: 'Proft\'s Eidetic Memory', method: 'fuzzy' },
    ]);
    expect(report.unmatched).toEqual([]);
    expect(report.officialOnly).toEqual([]);
    expect(report.localOnly).toEqual([]);
  });

  test('tries removing parentheses before fuzzy matching', () => {
    const report = compare(['Proft’s Eiditic Memory (Standard only)']);
    expect(report.unmatched).toEqual([]);
    expect(report.officialOnly.map(row => row.cardId)).toEqual(['profts-eidetic-memory']);
  });

  test('preserves parentheses that belong to an exact card name', () => {
    const report = compare(['Example (One)'], [], [
      { cardId: 'one', name: 'Example (One)', localizedName: null },
      { cardId: 'plain', name: 'Example', localizedName: null },
    ]);
    expect(report.officialOnly.map(row => row.cardId)).toEqual(['one']);
    expect(report.approximateMatches).toEqual([]);
  });

  test('reports a status mismatch as one paired card instead of two missing cards', () => {
    const report = compare(['Leyline of Resonance (only in MTG Arena Best of One)'], [
      { cardId: 'leyline-of-resonance', status: 'banned' },
    ]);
    expect(report.statusDifferences).toMatchObject([{ cardId: 'leyline-of-resonance', officialKind: 'banned_in_bo1', localStatus: 'banned' }]);
    expect(report.officialOnly).toEqual([]);
    expect(report.localOnly).toEqual([]);
  });

  test.each(['BO1', 'Best-of-One', 'Best of One'])('recognizes %s notes', note => {
    const report = compare([`Leyline of Resonance (only in ${note})`]);
    expect(report.officialOnly[0]?.officialKind).toBe('banned_in_bo1');
  });

  test('retains genuine status differences for fuzzy names', () => {
    const report = compare(['Proft\'s Eiditic Memory'], [{ cardId: 'profts-eidetic-memory', status: 'restricted' }]);
    expect(report.statusDifferences).toMatchObject([{ cardId: 'profts-eidetic-memory', localStatus: 'restricted', officialKind: 'banned' }]);
  });

  test('does not guess when two cards are equally close', () => {
    const report = compare(['Fable Foz'], [], [
      { cardId: 'fox', name: 'Fable Fox', localizedName: null },
      { cardId: 'fog', name: 'Fable Fog', localizedName: null },
    ]);
    expect(report.officialOnly).toEqual([]);
    expect(report.unmatched).toMatchObject([{ reason: 'ambiguous', candidates: ['fox', 'fog'] }]);
  });

  test('reserves exact matches before fuzzy rows regardless of row order', () => {
    const report = compare(['Proft\'s Eiditic Memory', 'Proft\'s Eidetic Memory']);
    expect(report.officialOnly).toHaveLength(1);
    expect(report.unmatched).toHaveLength(1);
  });

  test.each(['Proft\'s Eidetc Memory', 'Proft\'s Eideetic Memory', 'Proft\'s Eidetci Memory'])(
    'accepts one missing, added, or transposed character: %s', name => {
      expect(compare([name]).officialOnly.map(row => row.cardId)).toEqual(['profts-eidetic-memory']);
    },
  );

  test('leaves unrelated names unresolved', () => {
    const report = compare(['Completely Different Card']);
    expect(report.officialOnly).toEqual([]);
    expect(report.unmatched).toMatchObject([{ reason: 'not_found' }]);
  });

  test('keeps duplicate official rows visible without reusing the same local identity', () => {
    const report = compare(['Proft\'s Eidetic Memory', 'Proft\'s Eidetic Memory']);
    expect(report.officialOnly).toHaveLength(1);
    expect(report.unmatched).toHaveLength(1);
  });

  test('keeps a BO1-only local restriction when it is absent from the official list', () => {
    const report = compare(['Proft\'s Eidetic Memory'], [{ cardId: 'leyline-of-resonance', status: 'banned_in_bo1' }]);
    expect(report.localOnly).toMatchObject([{ cardId: 'leyline-of-resonance', localStatus: 'banned_in_bo1' }]);
  });

  test('ignores blank entries in comparison input too', () => {
    const official = parseListSections('<h2>STANDARD BANNED CARDS</h2><ul><li>Proft\'s Eidetic Memory</li></ul>', source, 'standard', '2026-10-15');
    official.entries.push({ name: '  ', kind: 'banned', points: null, note: null });
    const report = compareBanlists('standard', official, { banlist: [] }, names);
    expect(report.unmatched).toEqual([]);
  });
});

describe('official group restrictions', () => {
  test('recognizes numbered conspiracy and ante rows as groups instead of card names', () => {
    const official = parseListSections(`<h2>LEGACY BANNED CARDS</h2><ul>
      <li>25 cards with the Card Type “Conspiracy.” Click here for list.</li>
      <li>9 cards that reference "playing for ante." Click here for list.</li>
    </ul>`, source, 'legacy', '2026-10-15');
    expect(official.entries).toEqual([]);
    expect(official.scopes).toMatchObject([{ group: 'conspiracy' }, { group: 'ante' }]);
    expect(official.complete).toBe(true);
  });
  test('compares group members instead of reporting them as local-only cards', () => {
    const official = parseListSections(`<h2>LEGACY BANNED CARDS</h2><ul>
      <li>25 cards with the Card Type “Conspiracy.” Click here for list.</li>
      <li>9 cards that reference "playing for ante." Click here for list.</li>
      <li>Cards whose art, text, name, or combination thereof that are racially or culturally offensive are banned in all formats.</li>
      <li>All cards that bring a sticker or an Attraction into the game are banned.</li>
    </ul>`, source, 'legacy', '2026-10-15');
    const groups = { conspiracy: ['power-play'], ante: ['darkpact'], offensive: ['cleanse'], unfinity: ['ticketomaton'] };
    const cards = Object.values(groups).flat().map(cardId => ({ cardId, name: cardId, localizedName: null }));
    const banlist = cards.map(card => ({ cardId: card.cardId, status: 'banned' as const }));
    const report = compareBanlists('legacy', official, { banlist }, cards, groups);
    expect(report.status).toBe('consistent');
    expect(report.localOnly).toEqual([]);
    expect(report.unmatched).toEqual([]);
    expect(report.manualReview).toEqual([]);
    expect(report.groups).toHaveLength(4);
    expect(report.officialCount).toBe(4);
    expect(report.localCount).toBe(4);

    const missing = compareBanlists('legacy', official, { banlist: banlist.slice(1) }, cards, groups);
    expect(missing.officialOnly.map(row => row.cardId)).toEqual(['power-play']);
    expect(missing.officialCount).toBe(4);
    expect(missing.localCount).toBe(3);
    const wrongStatus = compareBanlists('legacy', official, { banlist: [{ cardId: 'power-play', status: 'restricted' }, ...banlist.slice(1)] }, cards, groups);
    expect(wrongStatus.statusDifferences).toMatchObject([{ cardId: 'power-play', officialKind: 'banned', localStatus: 'restricted' }]);
  });

  test('retains unknown or unresolved groups for manual review without hiding local bans', () => {
    const official = parseListSections('<h2>LEGACY BANNED CARDS</h2><ul><li>25 cards with the Card Type “Conspiracy.” Click here for list.</li><li>All cards with an unknown property are banned.</li></ul>', source, 'legacy', '2026-10-15');
    const report = compareBanlists('legacy', official, { banlist: [{ cardId: 'power-play', status: 'banned' }] }, [], {});
    expect(report.status).toBe('incomplete');
    expect(report.manualReview).toHaveLength(2);
    expect(report.localOnly).toHaveLength(1);
    expect(report.groups).toEqual([]);
  });
});

describe('Vintage list categories', () => {
  test('keeps the banned and restricted lists separate under the combined heading', () => {
    const official = parseListSections(`<h2>Vintage Banned and Restricted Cards</h2>
      <p>Vintage lets you play cards from any set.</p>
      <p>The following cards are banned from Vintage play:</p>
      <ul><li>Chaos Orb</li><li>Falling Star</li><li>Shahrazad</li></ul>
      <p>The following cards are restricted, which means you can only have one of them in your main deck and sideboard combined:</p>
      <ul><li>Ancestral Recall</li><li>Black Lotus</li></ul>`, source, 'vintage', '2026-10-15');
    expect(official.entries.map(({ name, kind }) => ({ name, kind }))).toEqual([
      { name: 'Chaos Orb', kind: 'banned' },
      { name: 'Falling Star', kind: 'banned' },
      { name: 'Shahrazad', kind: 'banned' },
      { name: 'Ancestral Recall', kind: 'restricted' },
      { name: 'Black Lotus', kind: 'restricted' },
    ]);
  });
});

describe('Commander group wording', () => {
  test('reads all three group rows from the Commander banned-list introduction', () => {
    const commander: OfficialSource = { ...source, id: 'commander', parser: 'commander', formats: ['commander'] };
    const official = parseListSections(`<h1>Banned List</h1><ul>
      <li>All cards that refer to the ante mechanic (full list here)</li>
      <li>All cards that Wizards has removed from constructed formats (full list here)</li>
      <li>All cards with the Conspiracy card type (full list here)</li>
      </ul><h2>Black Lotus</h2><p>Banned: January 2004</p>`, commander, 'commander', '2026-10-15');
    expect(official.scopes.map(scope => scope.group)).toEqual(['ante', 'offensive', 'conspiracy']);
    expect(official.entries.map(entry => entry.name)).toEqual(['Black Lotus']);
    const report = compareBanlists('commander', official, { banlist: [] }, [], {
      ante: ['darkpact'], offensive: ['cleanse'], conspiracy: ['power-play'],
    });
    expect(report.manualReview).toEqual([]);
    expect(report.groups.map(group => group.group)).toEqual(['ante', 'offensive', 'conspiracy']);
  });
});

test('reads Commander groups and collapsible cards from the actual article structure', () => {
  const commander: OfficialSource = { ...source, id: 'commander', parser: 'commander', formats: ['commander'] };
  const official = parseListSections(`<article><header><h1>Banned List</h1></header><div class="entry-content"><ul>
    <li>All cards that refer to the ante mechanic (full list here)</li>
    <li>All cards that Wizards has removed from constructed formats (full list here)</li>
    <li>All cards with the Conspiracy card type (full list here)</li>
    </ul><details><summary>Black Lotus</summary><p>Banned: —</p></details>
    <details><summary>Channel</summary><p>Banned: 2010-JUN</p></details>
    </div></article>`, commander, 'commander', '2026-10-15');
  expect(official.scopes.map(scope => scope.group)).toEqual(['ante', 'offensive', 'conspiracy']);
  expect(official.entries.map(entry => entry.name)).toEqual(['Black Lotus', 'Channel']);
  expect(official.complete).toBe(true);
});

describe('front-face card names', () => {
  const cards = [{ cardId: 'erayo-soratami-ascendant', name: 'Erayo, Soratami Ascendant // Erayo\'s Essence', localizedName: null }];

  test('matches the official front name while keeping the local full name visible', () => {
    const report = compare(['Erayo, Soratami Ascendant'], [{ cardId: cards[0]!.cardId, status: 'banned' }], cards);
    expect(report.status).toBe('consistent');
    expect(report.approximateMatches).toMatchObject([{ officialName: 'Erayo, Soratami Ascendant', localName: cards[0]!.name, method: 'front' }]);
  });

  test.each(['Erayo, Soratami Ascendant (banned)', 'Erayo, Soratami Ascendat'])(
    'applies existing note and typo tolerance to front names: %s', name => {
      const report = compare([name], [], cards);
      expect(report.officialOnly.map(row => row.cardId)).toEqual([cards[0]!.cardId]);
      expect(report.unmatched).toEqual([]);
    },
  );

  test('keeps exact full-name matching ahead of front-name aliases', () => {
    const report = compare(['Erayo, Soratami Ascendant'], [], [...cards,
      { cardId: 'exact', name: 'Erayo, Soratami Ascendant', localizedName: null },
    ]);
    expect(report.officialOnly.map(row => row.cardId)).toEqual(['exact']);
    expect(report.approximateMatches).toEqual([]);
  });

  test('does not guess between cards sharing a front name or match only a back name', () => {
    const ambiguous = compare(['Erayo, Soratami Ascendant'], [], [...cards,
      { cardId: 'other', name: 'Erayo, Soratami Ascendant // Another Back', localizedName: null },
    ]);
    expect(ambiguous.unmatched[0]?.reason).toBe('ambiguous');
    expect(compare(['Erayo\'s Essence'], [], cards).unmatched[0]?.reason).toBe('not_found');
  });
});

describe('Wizards Commander source', () => {
  test('uses the Wizards official page for Commander', () => {
    expect(sourceForFormat('commander')).toMatchObject({ id: 'wizards', parser: 'wizards', url: 'https://magic.wizards.com/en/banned-restricted-list' });
  });
  test('matches the companion-only entry without treating its explanation as a card name', () => {
    const official = parseListSections(`<h2>Commander Banned Cards</h2><p>The following cards are banned from the format:</p><ul>
      <li>Lutri, the Spellchaser - only banned as a companion. Click here for more details.</li>
      <li>Black Lotus</li></ul><h2>Modern Banned Cards</h2><ul><li>Other Card</li></ul>`, source, 'commander', '2026-10-15');
    const cards = [
      { cardId: 'lutri-the-spellchaser', name: 'Lutri, the Spellchaser', localizedName: null },
      { cardId: 'black-lotus', name: 'Black Lotus', localizedName: null },
    ];
    const report = compareBanlists('commander', official, { banlist: [
      { cardId: 'lutri-the-spellchaser', status: 'banned_as_companion' },
      { cardId: 'black-lotus', status: 'banned' },
    ] }, cards);
    expect(report.status).toBe('consistent');
    expect(official.entries).toHaveLength(2);
    expect(official.entries[0]?.kind).toBe('banned_as_companion');
    expect(report.approximateMatches).toMatchObject([{ cardId: 'lutri-the-spellchaser', method: 'parentheses' }]);
  });
});

describe('Duel Commander page sections', () => {
  test('reads card-name attributes within ban categories and keeps rule text out of card matching', () => {
    const duel: OfficialSource = { ...source, id: 'duelcommander', parser: 'duelcommander', formats: ['duelcommander'] };
    const official = parseListSections(`<h1>Banned &amp; Restricted Cards</h1>
      <section class="card ban-category"><h2>Banned as Companion</h2><p>These cards cannot be used as your companion.</p><div class="ban-item" data-card-name="Lutri, the Spellchaser"></div></section>
      <section class="card ban-category"><h2>Banned as Commander only</h2><div class="ban-item" data-card-name="Braids, Cabal Minion"></div><div class="ban-item" data-card-name="Minsc &amp;amp; Boo, Timeless Heroes"></div></section>
      <section class="card ban-category"><h2>Banned in Deck</h2><div class="ban-item" data-card-name="Sol Ring"></div></section>
      <section class="card ban-category"><h2>Recently Unbanned</h2><div class="ban-item" data-card-name="Emry, Lurker of the Loch"></div></section>
      <section class="card ban-category"><h2>Banned for Offensive Content</h2><div class="ban-item" data-card-name="Cleanse"></div></section>
      <section class="card ban-category"><h2>Structurally Banned Cards</h2>
        <article><h3>Special Border Cards</h3><ul><li>Gold-bordered cards</li><li>Silver-bordered cards</li><li>Acorn stamp cards</li><li>Square-cornered cards</li></ul></article>
        <article><h3>Ante &amp; Dexterity</h3><ul><li>Chaos Orb</li><li>Falling Star</li><li>Contract from Below</li><li>All ante cards</li></ul></article>
        <article><h3>Special Mechanics</h3><ul><li>Shahrazad (subgame)</li><li>All Conspiracy cards</li><li>Sticker &amp; Attraction cards</li><li>Digital-only cards</li></ul></article>
        <article><h3>Official References</h3><ul><li>See WPN Tournament Rules section 3.3 for complete details.</li></ul></article>
      </section>
      <aside><h2>Fast Mana Restriction</h2><h3>Why Fast Mana is Restricted</h3><p>Advice</p><ol><li>Check this official banlist page</li><li>Ensure the card is legal in Vintage</li></ol></aside>`, duel, 'duelcommander', '2026-10-15');
    expect(official.entries.map(entry => [entry.name, entry.kind])).toEqual([
      ['Lutri, the Spellchaser', 'banned_as_companion'], ['Braids, Cabal Minion', 'banned_as_commander'],
      ['Minsc & Boo, Timeless Heroes', 'banned_as_commander'], ['Sol Ring', 'banned_in_deck'], ['Cleanse', 'banned'], ['Chaos Orb', 'banned'], ['Falling Star', 'banned'],
      ['Contract from Below', 'banned'], ['Shahrazad (subgame)', 'banned'],
    ]);
    expect(official.scopes.filter(scope => scope.group).map(scope => scope.group)).toEqual(['ante', 'conspiracy', 'unfinity']);
    expect(official.scopes.filter(scope => !scope.group)).toEqual([]);
    expect(official.complete).toBe(true);
  });
});

test('compares the Leviathan collective exclusions as the three supported groups', () => {
  const leviathan: OfficialSource = { ...source, id: 'leviathan', parser: 'leviathan', formats: ['leviathan-commander'] };
  const official = parseListSections('<div class="wixui-rich-text"><h2>Ban List</h2></div><div class="wixui-rich-text"><ul><li>Sol Ring</li></ul></div><div class="wixui-rich-text"><ul><li>Ante cards</li><li>Conspiracy cards</li><li>Silver Border Cards</li><li>Vanguards cards</li><li>Unfinity cards with acorn holo-foil</li><li>All cards that bring a sticker or an</li><li>Attraction into the game</li></ul></div>', leviathan, 'leviathan-commander', '2026-10-15');
  expect(official.scopes.map(scope => scope.group)).toEqual(['ante', 'conspiracy', 'unfinity']);
  const groups = { ante: ['darkpact'], conspiracy: ['power-play'], unfinity: ['ticketomaton'] };
  const cards = ['sol-ring', ...Object.values(groups).flat()].map(cardId => ({ cardId, name: cardId === 'sol-ring' ? 'Sol Ring' : cardId, localizedName: null }));
  const report = compareBanlists('leviathan-commander', official, {
    banlist: cards.map(card => ({ cardId: card.cardId, status: 'banned' })),
  }, cards, groups);
  expect(report.status).toBe('consistent');
  expect(report.localOnly).toEqual([]);
  expect(report.manualReview).toEqual([]);
  expect(report.groups.map(group => group.group)).toEqual(['ante', 'conspiracy', 'unfinity']);
});

test('reads Leviathan cards across Wix text blocks and respects paragraph category changes', () => {
  const leviathan: OfficialSource = { ...source, id: 'leviathan', parser: 'leviathan', formats: ['leviathan-commander'], notices: ['The format has ended; this is its retained final list.'] };
  const official = parseListSections(`<div class="wixui-rich-text"><h2>BAN LIST</h2></div>
    <div class="wixui-rich-text"><ul><li>Ancestral Recall</li><li>Food Chain&#8203;</li></ul></div>
    <div class="wixui-rich-text"><ul><li>Mana Crypt</li><li>Time Wal k</li></ul></div>
    <div class="wixui-rich-text"><p>Banned as Companion:</p><ul><li>Lutri, the Spellchaser</li></ul></div>
    <div class="wixui-rich-text"><p>The following cards are also banned from being played as a commander (but can still be part of your 99 cards):</p><ul><li>Baral, Chief of Compliance</li></ul></div>`, leviathan, 'leviathan-commander', '2026-10-15');
  expect(official.entries.map(entry => [entry.name, entry.kind])).toEqual([
    ['Ancestral Recall', 'banned'], ['Food Chain', 'banned'], ['Mana Crypt', 'banned'], ['Time Wal k', 'banned'],
    ['Lutri, the Spellchaser', 'banned_as_companion'], ['Baral, Chief of Compliance', 'banned_as_commander'],
  ]);
  expect(official.scopes).toEqual([]);
  expect(official.notices).toHaveLength(1);
});

test('classifies collective differences even when the official rule is absent', () => {
  const report = compare(['Proft\'s Eidetic Memory'], [{ cardId: 'ticketomaton', status: 'banned' }]);
  expect(report.localOnly).toMatchObject([{ cardId: 'ticketomaton', group: 'unfinity' }]);
  expect(report.officialOnly).toMatchObject([{ cardId: 'profts-eidetic-memory', group: null }]);
});

test('expands Pauper collective bans only for eligible common cards', () => {
  const official = parseListSections('<h2>Pauper Banned Cards</h2><ul><li>All cards that bring a sticker or an Attraction into the game are banned.</li></ul>', source, 'pauper', '2026-10-15');
  expect(official.scopes).toMatchObject([{ group: 'unfinity' }]);
  const cards = ['common', 'rare'].map(cardId => ({ cardId, name: cardId, localizedName: null }));
  const report = compareBanlists('pauper', official, { banlist: [] }, cards, { unfinity: ['common', 'rare'] }, new Set(['common']));
  expect(report.officialOnly).toMatchObject([{ cardId: 'common', group: 'unfinity' }]);
  expect(report.officialOnly).toHaveLength(1);
  expect(report.groups).toMatchObject([{ group: 'unfinity', cardCount: 1 }]);
  expect(report.officialCount).toBe(1);
  expect(report.localCount).toBe(0);
});
