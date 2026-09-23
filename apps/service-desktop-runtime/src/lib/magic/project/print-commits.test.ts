import { test, expect } from 'bun:test';
import {
  MANUAL_PRINT_SOURCE,
  manualPrintKey,
  staleManualPrints,
  synthesizePrintCommits,
  type LoadedPrintCommit,
} from './print-commits';
import type { PrintDraft } from './project-card';

/** Minimal valid print draft; tests override the fields they care about. */
function draft(overrides: Partial<PrintDraft>): PrintDraft {
  return {
    lang:              'en',
    set:               'msc',
    number:            '806',
    releasedAt:        '2026-06-26',
    layout:            'normal',
    frame:             '2015',
    frameEffects:      null,
    borderColor:       'black',
    cardBackId:        null,
    securityStamp:     null,
    promoTypes:        null,
    rarity:            'uncommon',
    isDigital:         false,
    isPromo:           false,
    isReprint:         true,
    finishes:          ['nonfoil', 'foil'],
    imageStatus:       'highres_scan',
    inBooster:         false,
    games:             ['paper'],
    previewDate:       null,
    previewSource:     null,
    previewUri:        null,
    fullArt:           false,
    oversized:         false,
    storySpotlight:    false,
    textless:          false,
    isVariation:       false,
    variationOf:       null,
    artistIds:         null,
    resourceId:        null,
    scryfallOracleId:  'o0',
    scryfallCardId:    's1',
    scryfallFace:      null,
    arenaId:           1,
    mtgoId:            2,
    mtgoFoilId:        null,
    multiverseIds:     [3],
    tcgPlayerId:       null,
    tcgplayerEtchedId: null,
    cardMarketId:      null,
    faces:             [{ typeLine: 'Instant', printedName: null, artist: 'Ana', flavorText: 'flavor' }],
    ...overrides,
  };
}

/** Minimal commit targeting the factory draft's position; tests override what they care about. */
function commit(overrides: Partial<LoadedPrintCommit>): LoadedPrintCommit {
  return { set: 'msc', number: '806', lang: 'zhs', faces: [], metadata: null, ...overrides };
}

test('clones the same-position English print and empties upstream identity', () => {
  const base = draft({});
  const [manual] = synthesizePrintCommits([base], [commit({ lang: 'zhs' })]);
  expect(manual).toEqual({
    ...base,
    lang:              'zhs',
    imageStatus:       'missing',
    source:            MANUAL_PRINT_SOURCE,
    scryfallCardId:    null,
    scryfallFace:      null,
    arenaId:           null,
    mtgoId:            null,
    mtgoFoilId:        null,
    multiverseIds:     [],
    tcgPlayerId:       null,
    tcgplayerEtchedId: null,
    cardMarketId:      null,
    previewDate:       null,
    previewSource:     null,
    previewUri:        null,
    faces:             [{ typeLine: 'Instant', printedName: null, artist: 'Ana', flavorText: 'flavor', printedTypeLine: null, printedText: null, flavorName: null, watermark: null, illustrationId: null, attractionLights: null }],
  });
});

test('commit faces overlay the baseline slot field by field', () => {
  const base = draft({});
  const [manual] = synthesizePrintCommits([base], [commit({
    faces: [{ printedName: '闪电击', printedText: '……', artist: 'B ob' }],
  })]);
  expect(manual!.faces[0]).toMatchObject({
    printedName:    '闪电击',
    printedText:    '……',
    artist:         'B ob',
    // not asserted by the commit: cloned from the baseline slot
    typeLine:       'Instant',
    flavorText:     'flavor',
    illustrationId: null,
  });
});

test('metadata overrides win over the baseline', () => {
  const base = draft({ rarity: 'uncommon', releasedAt: '2026-06-26', finishes: ['nonfoil', 'foil'] });
  const [manual] = synthesizePrintCommits([base], [commit({
    metadata: { rarity: 'rare', releaseDate: '1995-01-01', finishes: ['nonfoil'] },
  })]);
  expect(manual!.rarity).toBe('rare');
  expect(manual!.releasedAt).toBe('1995-01-01');
  expect(manual!.finishes).toEqual(['nonfoil']);
  // untouched fields keep cloning
  expect(manual!.frame).toBe('2015');
});

test('a commit whose position has no same-position English print is skipped, not cross-dressed', () => {
  const only = draft({ set: 'leb', number: '203' });
  // the position exists elsewhere on the card, but not at msc/806 — cloning
  // another position's metadata would assert things nobody verified
  expect(synthesizePrintCommits([only], [commit({ set: 'msc', number: '806' })])).toEqual([]);
  // no English row at all: same outcome
  expect(synthesizePrintCommits([draft({ lang: 'zhs' })], [commit({})])).toEqual([]);
});

test('commit face slots beyond the unit face count are ignored', () => {
  const base = draft({});
  const [manual] = synthesizePrintCommits([base], [commit({
    faces: [{ printedName: '闪电击' }, { printedName: 'extra' }],
  })]);
  expect(manual!.faces).toHaveLength(1);
  expect(manual!.faces[0]!.printedName).toBe('闪电击');
});

test('staleManualPrints keeps exactly the emitted keys and recycles the rest', () => {
  const active = [
    { cardId: 'a', set: 'msc', number: '806', lang: 'zhs' },
    { cardId: 'a', set: 'msc', number: '807', lang: 'zhs' },
    { cardId: 'b', set: 'fin', number: '1', lang: 'zhs' },
  ];
  const emitted = new Set([manualPrintKey(active[0]!), manualPrintKey(active[2]!)]);
  expect(staleManualPrints(active, emitted)).toEqual([{ cardId: 'a', set: 'msc', number: '807', lang: 'zhs' }]);
  expect(staleManualPrints(active, new Set())).toEqual(active);
  expect(staleManualPrints([], emitted)).toEqual([]);
});
