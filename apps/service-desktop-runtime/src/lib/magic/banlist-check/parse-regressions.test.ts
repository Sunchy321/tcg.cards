import { expect, test } from 'bun:test';
import { parseListSections } from './parse';
import { compareBanlists } from './compare';
import { fetchOfficialBanlist, createPageReader } from './fetch';
import { sourceForFormat } from './sources';
import type { OfficialPage } from './types';
import { groupEligibility, type GroupCardMeta } from './eligibility';

/** Parses a format using its registered source without a network request. */
function parse(html: string, format: string) {
  return parseListSections(html, sourceForFormat(format)!, format, '2026-10-15');
}

test('Historic keeps its banlist after a same-level explanation heading without leaking the next format', () => {
  const result = parse('<h3>Historic Banned Cards</h3><p>The following cards are suspended:</p><ul><li>No Current Suspensions</li></ul><h3>What Suspension Means</h3><p>Suspension is temporary.</p><p>The following cards are banned:</p><ul><li>Brainstorm</li></ul><h3>Timeless Banned and Restricted Cards</h3><ul><li>Black Lotus</li></ul>', 'historic');
  expect(result.entries.map(row => [row.name, row.kind])).toEqual([['Brainstorm', 'banned']]);
});

test('Wizards ordinary, Standard and Competitive Brawl never reuse one another sections', () => {
  const html = '<h3>Brawl Banned Cards</h3><ul><li>Oko, Thief of Crowns</li></ul><h3>Competitive Brawl Banned Cards</h3><p>The following cards are banned as your commander:</p><ul><li>Oko, Thief of Crowns</li><li>Ajani, Nacatl Pariah</li></ul>';
  expect(parse(html, 'brawl').entries.map(row => row.name)).toEqual(['Oko, Thief of Crowns']);
  const standard = parse(html, 'standard_brawl');
  expect(standard.entries).toEqual([]);
  expect(standard.complete).toBe(false);
});

test('global offensive restrictions apply to Pauper but unrelated formats do not prove empty lists', () => {
  const result = parse('<p>Cards whose art, text, name, or combination thereof that are racially or culturally offensive are banned in all formats.</p><h3>Pauper Banned Cards</h3><ul><li>Cloudpost</li></ul><h3>Historic Banned Cards</h3><ul><li>No Current Suspensions</li></ul>', 'pauper');
  expect(result.scopes).toMatchObject([{ group: 'offensive' }]);
  const missing = parse('<h3>Historic Banned Cards</h3><ul><li>No Current Suspensions</li></ul><h3>Pauper Banned Cards</h3>', 'pauper');
  expect(missing.complete).toBe(false);
});

test('Oathbreaker collective wording resolves all four groups and ignores printing restrictions', () => {
  const result = parse('<h2>Banned Cards</h2><ul><li>Cards with the "Conspiracy" card type. (card list)</li><li>Cards that reference "playing with ante". (card list)</li><li>Cards that Wizards removed for being offensive. (card list)</li><li>Cards that bring a Sticker (card list) or an Attraction (card list) into the game</li><li>Silver-bordered cards</li><li>Sol Ring</li></ul>', 'oathbreaker');
  expect(result.scopes.map(row => row.group)).toEqual(['conspiracy', 'ante', 'offensive', 'unfinity']);
  expect(result.entries.map(row => row.name)).toEqual(['Sol Ring']);
});

test('PDH reads its spaced paragraph title, linked cards, and category lines', () => {
  const result = parse('<p><span>B A N L I S T</span></p><div><p><a href="https://scryfall.com/card/ice/87/mystic-remora">Mystic Remora</a><br><a href="https://scryfall.com/card/pcy/45/rhystic-study">Rhystic Study</a><br>Cards that Wizards has removed from all constructed formats (full list here)<br>Cards with the Conspiracy card type (full list here)<br>Cards referring to ante (full list here)</p></div>', 'pauper_commander');
  expect(result.complete).toBe(true);
  expect(result.entries.map(row => row.name)).toEqual(['Mystic Remora', 'Rhystic Study']);
  expect(result.scopes.map(row => row.group)).toEqual(['offensive', 'conspiracy', 'ante']);
});

test('PDC reads sibling grids outside the title container and preserves commander/deck statuses', () => {
  const result = parse('<section><div><h2>Interdit en tant que commandant</h2></div><ul data-banlist-grid><li data-card-name="loyal apprentice">Loyal Apprentice</li></ul></section><section><div><h2>Interdit dans le deck</h2></div><ul data-banlist-grid><li data-card-name="campfire">Campfire Nouveau</li></ul></section><section><h2>Historique des changements</h2><li>Old card</li></section>', 'pauper_duelcommander');
  expect(result.complete).toBe(true);
  expect(result.entries.map(row => [row.name, row.kind])).toEqual([['Loyal Apprentice', 'banned_as_commander'], ['Campfire', 'banned_in_deck']]);
});

test('Conquest reads nested lists within columns and keeps reserved-list exclusions separate', () => {
  const result = parse('<h1>Banlist</h1><p>The Conquest cardpool excludes cards that refer to the ante mechanic, Conspiracy card type, cards that put Stickers or Attractions into play, cards that Wizards has removed from constructed formats.</p><div class="wp-block-post-content"><div><ul><li>Balance</li><li><em>the ten fetchlands</em><ul><li>Arid Mesa</li></ul></li><li><em>banned as commander</em><ul><li>Kinnan, Bonder Prodigy</li></ul></li><li><em>banned as companion</em><ul><li>Lutri, the Spellchaser</li></ul></li></ul></div><h2>The Reserved List</h2><ul><li>Black Lotus</li></ul></div>', 'conquest');
  expect(result.entries.map(row => [row.name, row.kind])).toEqual([['Balance', 'banned'], ['Arid Mesa', 'banned'], ['Kinnan, Bonder Prodigy', 'banned_as_commander'], ['Lutri, the Spellchaser', 'banned_as_companion']]);
  expect(new Set(result.scopes.flatMap(row => row.group ? [row.group] : []))).toEqual(new Set(['ante', 'conspiracy', 'offensive', 'unfinity']));
  expect(result.scopes.some(row => !row.group && /reserved/i.test(row.description))).toBe(true);
});

test('Canadian Highlander resolves Vintage bans and collective rules, but never its restricted cards', async () => {
  const reader = createPageReader(async url => {
    const html = url.includes('canadianhighlander')
      ? '<h1>Points List</h1><table><tr><td>Time Walk</td><td>5</td></tr></table><p>Effectively, Canadian Highlander shares a banned list with Vintage.</p>'
      : '<h3>Vintage Banned and Restricted Cards</h3><p>The following cards are banned:</p><ul><li>9 cards that reference "playing for ante."</li><li>Chaos Orb</li></ul><p>The following cards are restricted:</p><ul><li>Time Walk</li></ul>';
    const page: OfficialPage = { url, html, fetchedAt: '2026-10-15', httpStatus: 200, contentType: 'text/html', sha256: null, text: html, rows: [], error: null };
    return page;
  });
  const result = await fetchOfficialBanlist('canadian_highlander', reader.read);
  expect(result.entries.map(row => [row.name, row.kind])).toEqual([['Time Walk', 'points'], ['Chaos Orb', 'banned']]);
  expect(result.scopes).toMatchObject([{ group: 'ante' }]);
  const report = compareBanlists('canadian_highlander', result, { banlist: [] }, [], { ante: ['darkpact'] });
  expect(report.manualReview).toEqual([]);
});

test('collective bans respect tracked sets, Arena availability, and existing Pauper commander rarity rules', () => {
  const metadata = new Map<string, GroupCardMeta>([
    ['old-paper', { typeMain: [], rarities: ['common'], sets: ['old'], games: ['paper'], releaseDate: null }],
    ['arena-common', { typeMain: [], rarities: ['common'], sets: ['current'], games: ['arena'], releaseDate: null }],
    ['uncommon-creature', { typeMain: ['creature'], rarities: ['uncommon'], sets: ['old'], games: ['paper'], releaseDate: null }],
    ['uncommon-spell', { typeMain: ['sorcery'], rarities: ['uncommon'], sets: ['old'], games: ['paper'], releaseDate: null }],
  ]);
  const result = groupEligibility([
    { formatId: 'standard', sets: ['current'] }, { formatId: 'timeless', sets: null },
    { formatId: 'brawl', sets: null }, { formatId: 'pauper', sets: null }, { formatId: 'pauper_commander', sets: null },
  ], [...metadata.keys()], metadata);
  expect([...result.standard!]).toEqual(['arena-common']);
  expect([...result.timeless!]).toEqual(['arena-common']);
  expect([...result.brawl!]).toEqual(['arena-common']);
  expect([...result.pauper!]).toEqual(['old-paper', 'arena-common']);
  expect([...result.pauper_commander!]).toEqual(['old-paper', 'arena-common', 'uncommon-creature']);
});
