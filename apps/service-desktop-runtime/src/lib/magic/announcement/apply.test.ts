import { describe, expect, test } from 'bun:test';

import { runApply, type ApplyInput } from './apply';
import { magicEternalFormats } from './data/format-keywords';

const baseInput: ApplyInput = {
  formats: [
    { formatId: 'modern', birthday: null, deathdate: null },
    { formatId: 'pauper', birthday: null, deathdate: null },
    ...magicEternalFormats.map(f => ({ formatId: f, birthday: null, deathdate: null })),
  ],
  sets: [
    { setId: 's-2010', type: 'expansion', releaseDate: '2010-01-01' },
    { setId: 's-2016', type: 'expansion', releaseDate: '2016-03-01' },
  ],
  announcements: [],
  cardMeta:      {
    'old-card': { typeMain: ['creature'], rarities: ['common'], sets: ['s-2010'], releaseDate: '2010-01-01' },
    'new-card': { typeMain: ['creature'], rarities: ['rare'], sets: ['s-2016'], releaseDate: '2016-03-01' },
  },
  groupCards: { conspiracy: ['old-card', 'new-card'] },
  setCards:   {},
  today:      '2020-01-01',
};

function banlistOf(result: ReturnType<typeof runApply>, formatId: string) {
  return result.formats.find(f => f.formatId === formatId)!.banlist;
}

function setsOf(result: ReturnType<typeof runApply>, formatId: string) {
  return result.formats.find(f => f.formatId === formatId)!.sets;
}

describe('runApply', () => {
  test('seeds rotating formats from set releases and nulls eternal set lists', () => {
    const result = runApply(baseInput);

    expect(setsOf(result, 'modern')).toEqual(['s-2010', 's-2016']);
    expect(setsOf(result, 'vintage')).toEqual(null);
    expect(banlistOf(result, 'vintage')).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test('produces a projection for every item: formats, and cards carrying the item status and effective date', () => {
    const result = runApply({
      ...baseInput,
      setCards:      { 's-2016': ['set-card-1'] },
      announcements: [
        {
          date:          '2015-01-01',
          effectiveDate: null,
          items:         [
            { id: 'i1', ruleId: null, type: 'set_change', effectiveDate: null, format: 'modern', status: 'legal', score: null, group: null, cardId: null, setId: 's-2016', relatedCards: [] },
            { id: 'i2', ruleId: null, type: 'card_change', effectiveDate: null, format: 'vintage', status: 'banned', score: null, group: null, cardId: 'x-card', setId: null, relatedCards: ['y-card'] },
          ],
        },
      ],
    });

    const projections = new Map(result.projections.map(p => [p.id, p.projection]));
    expect(projections.get('i1')!.formats).toEqual(['modern']);
    expect(projections.get('i1')!.cards).toEqual([
      { cardId: 'set-card-1', status: 'legal', effectiveDate: '2015-01-01' },
    ]);
    expect(projections.get('i2')!.cards).toEqual([
      { cardId: 'x-card', status: 'banned', effectiveDate: '2015-01-01' },
      { cardId: 'y-card', status: 'banned', effectiveDate: '2015-01-01' },
    ]);
  });

  test('a sentinel item accumulates projection entries across re-fires with the latest dates', () => {
    const result = runApply({
      ...baseInput,
      cardMeta: {
        ...baseInput.cardMeta,
        'x-card': { typeMain: ['creature'], rarities: ['rare'], sets: ['s-2010'], releaseDate: '2010-01-01' },
      },
      announcements: [
        {
          date:          '2014-06-01',
          effectiveDate: null,
          items:         [
            { id: 's1', ruleId: null, type: 'card_change', effectiveDate: null, format: 'modern', status: 'banned', score: null, group: null, cardId: '#conspiracy', setId: null, relatedCards: [] },
          ],
        },
        {
          date:          '2018-01-01',
          effectiveDate: null,
          items:         [
            { id: 'it-1', ruleId: null, type: 'set_change', effectiveDate: null, format: 'modern', status: 'unavailable', score: null, group: null, cardId: null, setId: 's-2010', relatedCards: [] },
          ],
        },
        {
          date:          '2019-01-01',
          effectiveDate: null,
          items:         [
            { id: 'it-2', ruleId: null, type: 'set_change', effectiveDate: null, format: 'modern', status: 'legal', score: null, group: null, cardId: null, setId: 's-2010', relatedCards: [] },
          ],
        },
      ],
    });

    const projection = result.projections.find(p => p.id === 's1')!.projection;
    // old-card left and re-entered: its entry date moved to the re-entry; new-card stayed.
    expect(projection.cards.map(c => c.cardId).sort()).toEqual(['new-card', 'old-card']);
    const dates = new Map(projection.cards.map(c => [c.cardId, c.effectiveDate]));
    expect(dates.get('old-card')).toBe('2019-01-01');
    expect(dates.get('new-card')).toBe('2016-03-01');
  });

  test('seeding stops at a dead format deathdate', () => {
    const result = runApply({
      ...baseInput,
      formats: [{ formatId: 'extended', birthday: '1997-07-01', deathdate: '2013-10-08' }],
      sets:    [
        { setId: 's-2005', type: 'expansion', releaseDate: '2005-01-01' },
        { setId: 's-2020', type: 'expansion', releaseDate: '2020-01-01' },
      ],
    });

    expect(setsOf(result, 'extended')).toEqual(['s-2005']);
  });

  test('a sentinel ban writes per-card entries: released cards at the ban date, later releases at their release', () => {
    const result = runApply({
      ...baseInput,
      announcements: [
        {
          date:          '2014-06-01',
          effectiveDate: null,
          items:         [
            { id: 'it-3', ruleId: null, type: 'card_change', effectiveDate: null, format: '#eternal', status: 'banned', score: null, group: null, cardId: '#conspiracy', setId: null, relatedCards: [] },
          ],
        },
      ],
    });

    // Vintage tracks no sets, so entry dates fall back to each card's first release.
    expect(banlistOf(result, 'vintage').map(e => [e.cardId, e.date, e.group])).toEqual([
      ['new-card', '2016-03-01', 'conspiracy'],
      ['old-card', '2014-06-01', 'conspiracy'],
    ]);
    expect(result.warnings).toEqual([]);
  });

  test('pauper eligibility filters sentinel group cards by print rarity', () => {
    const result = runApply({
      ...baseInput,
      announcements: [
        {
          date:          '2014-06-01',
          effectiveDate: null,
          items:         [
            { id: 'it-4', ruleId: null, type: 'card_change', effectiveDate: null, format: 'pauper', status: 'banned', score: null, group: null, cardId: '#conspiracy', setId: null, relatedCards: [] },
          ],
        },
      ],
    });

    expect(banlistOf(result, 'pauper')).toEqual([
      { cardId: 'old-card', status: 'banned', score: null, date: '2014-06-01', group: 'conspiracy' },
    ]);
  });

  test('a format birthday window and future effective dates skip application', () => {
    const result = runApply({
      ...baseInput,
      formats: [
        { formatId: 'modern', birthday: '2011-01-01', deathdate: null },
        { formatId: 'vintage', birthday: null, deathdate: null },
      ],
      announcements: [
        {
          date:          '2010-06-01',
          effectiveDate: null,
          items:         [
            { id: 'it-5', ruleId: null, type: 'card_change', effectiveDate: null, format: 'modern', status: 'banned', score: null, group: null, cardId: 'x-card', setId: null, relatedCards: [] },
            { id: 'it-6', ruleId: null, type: 'card_change', effectiveDate: null, format: 'vintage', status: 'banned', score: null, group: null, cardId: 'x-card', setId: null, relatedCards: [] },
          ],
        },
        {
          date:          '2010-06-01',
          effectiveDate: '2999-01-01',
          items:         [
            { id: 'it-7', ruleId: null, type: 'card_change', effectiveDate: null, format: 'vintage', status: 'banned', score: null, group: null, cardId: 'y-card', setId: null, relatedCards: [] },
          ],
        },
      ],
    });

    // modern was not yet born in 2010: skipped. The future-dated announcement is skipped everywhere.
    expect(banlistOf(result, 'modern')).toEqual([]);
    expect(banlistOf(result, 'vintage').map(e => e.cardId)).toEqual(['x-card']);
  });

  test('projection expands keywords only to formats alive at each item effective date', () => {
    const result = runApply({
      ...baseInput,
      formats: [
        { formatId: 'standard', birthday: '1995-01-10', deathdate: null },
        { formatId: 'vintage', birthday: null, deathdate: null },
        { formatId: 'modern', birthday: '2011-01-01', deathdate: null },
        { formatId: 'extended', birthday: null, deathdate: '1995-01-10' },
      ],
      announcements: [{
        date: '1995-01-10', effectiveDate: '1995-01-11',
        items: [
          { id: 'at-boundary', ruleId: null, type: 'set_change', effectiveDate: '1995-01-10', format: '#standard', status: 'legal', score: null, group: null, cardId: null, setId: 's-2010', relatedCards: [] },
          { id: 'after-death', ruleId: null, type: 'card_change', effectiveDate: null, format: '#standard', status: 'banned', score: null, group: null, cardId: '#conspiracy', setId: null, relatedCards: [] },
          { id: 'before-birth', ruleId: null, type: 'card_change', effectiveDate: null, format: 'modern', status: 'banned', score: null, group: null, cardId: 'old-card', setId: null, relatedCards: [] },
          { id: 'at-birth', ruleId: null, type: 'card_change', effectiveDate: '2011-01-01', format: '#standard', status: 'banned', score: null, group: null, cardId: 'old-card', setId: null, relatedCards: [] },
        ],
      }],
    });
    const projections = new Map(result.projections.map(item => [item.id, item.projection.formats]));
    expect(projections.get('at-boundary')).toEqual(['standard', 'extended']);
    expect(projections.get('after-death')).toEqual(['vintage', 'standard']);
    expect(projections.get('before-birth')).toEqual([]);
    expect(projections.get('at-birth')).toEqual(['vintage', 'standard', 'modern']);
  });

  test('keyword set changes exclude eternal formats while explicitly targeted special set changes remain projected', () => {
    const item = {
      id: 'ordinary-set', ruleId: null, type: 'set_change', effectiveDate: null,
      format: '#standard', status: 'legal', score: null, group: null,
      cardId: null, setId: 's-2010', relatedCards: [],
    };
    const result = runApply({
      ...baseInput,
      formats: [
        { formatId: 'standard', birthday: '1995-01-10', deathdate: null },
        { formatId: 'modern', birthday: '2011-01-01', deathdate: null },
        { formatId: 'vintage', birthday: null, deathdate: null },
        { formatId: 'commander', birthday: '2010-01-01', deathdate: null },
      ],
      sets: [...baseInput.sets, { setId: 'un-set', type: 'funny', releaseDate: '2010-01-01' }],
      announcements: [{
        date: '2010-06-01', effectiveDate: null,
        items: [
          item,
          { ...item, id: 'eternal-set', format: '#eternal' },
          { ...item, id: 'special-set-in', format: 'commander', setId: 'un-set' },
          { ...item, id: 'special-set-out', format: 'commander', setId: 'un-set', status: 'unavailable' },
          { ...item, id: 'special-before-birth', format: 'commander', effectiveDate: '2009-01-01', setId: 'un-set' },
          { ...item, id: 'sentinel-ban', type: 'card_change', cardId: '#conspiracy', setId: null, status: 'banned' },
        ],
      }],
    });
    const projections = new Map(result.projections.map(row => [row.id, row.projection.formats]));
    expect(projections.get('ordinary-set')).toEqual(['standard']);
    expect(projections.get('eternal-set')).toEqual([]);
    expect(projections.get('special-set-in')).toEqual(['commander']);
    expect(projections.get('special-set-out')).toEqual(['commander']);
    expect(projections.get('special-before-birth')).toEqual([]);
    expect(projections.get('sentinel-ban')).toEqual(['vintage', 'commander', 'standard']);
    expect(result.warnings.filter(warning => warning.includes('not in vintage') || warning.includes('not in commander'))).toEqual([]);
  });

  test('a set leaving removes bans when cards lose their last set, group entries included', () => {
    const result = runApply({
      ...baseInput,
      cardMeta: {
        ...baseInput.cardMeta,
        'x-card': { typeMain: ['creature'], rarities: ['rare'], sets: ['s-2010'], releaseDate: '2010-01-01' },
      },
      announcements: [
        {
          date:          '2015-01-01',
          effectiveDate: null,
          items:         [
            { id: 'it-8', ruleId: null, type: 'card_change', effectiveDate: null, format: 'modern', status: 'banned', score: null, group: null, cardId: 'x-card', setId: null, relatedCards: [] },
            { id: 'it-9', ruleId: null, type: 'card_change', effectiveDate: null, format: 'modern', status: 'banned', score: null, group: null, cardId: '#conspiracy', setId: null, relatedCards: [] },
          ],
        },
        {
          date:          '2018-01-01',
          effectiveDate: null,
          items:         [
            { id: 'it-10', ruleId: null, type: 'set_change', effectiveDate: null, format: 'modern', status: 'unavailable', score: null, group: null, cardId: null, setId: 's-2010', relatedCards: [] },
          ],
        },
      ],
    });

    expect(setsOf(result, 'modern')).toEqual(['s-2016']);
    // x-card and old-card lose their last set and leave with it; new-card stays via s-2016.
    expect(banlistOf(result, 'modern').map(e => [e.cardId, e.status, e.date])).toEqual([
      ['new-card', 'banned', '2016-03-01'],
    ]);
    expect(result.projections.find(p => p.id === 'it-10')!.projection.derivedCards).toEqual([
      { formatId: 'modern', cardId: 'x-card', status: 'unavailable', effectiveDate: '2018-01-01', group: null },
      { formatId: 'modern', cardId: 'old-card', status: 'unavailable', effectiveDate: '2018-01-01', group: 'conspiracy' },
    ]);
    expect(result.warnings).toEqual([]);
  });

  test('rotation preserves restrictions on reprints and removes restrictions on exit and re-entry', () => {
    const input: ApplyInput = {
      ...baseInput,
      formats: [{ formatId: 'modern', birthday: null, deathdate: null }],
      cardMeta: {
        'rotated-card': { typeMain: [], rarities: [], sets: ['s-2010'], releaseDate: '2010-01-01' },
        'reprinted-card': { typeMain: [], rarities: [], sets: ['s-2010', 's-2016'], releaseDate: '2010-01-01' },
      },
      announcements: [
        {
          date: '2015-01-01', effectiveDate: null,
          items: [
            { id: 'rotate-score', ruleId: null, type: 'card_change', effectiveDate: null, format: 'modern', status: 'score', score: 3, group: null, cardId: 'rotated-card', setId: null, relatedCards: [] },
            { id: 'reprint-ban', ruleId: null, type: 'card_change', effectiveDate: null, format: 'modern', status: 'banned', score: null, group: null, cardId: 'reprinted-card', setId: null, relatedCards: [] },
          ],
        },
        {
          date: '2018-01-01', effectiveDate: '2018-02-01',
          items: [
            { id: 'rotate-out', ruleId: null, type: 'set_change', effectiveDate: null, format: 'modern', status: 'unavailable', score: null, group: null, cardId: null, setId: 's-2010', relatedCards: [] },
          ],
        },
      ],
    };
    const result = runApply(input);
    expect(banlistOf(result, 'modern')).toEqual([
      { cardId: 'reprinted-card', status: 'banned', score: null, date: '2015-01-01', group: null },
    ]);
    expect(runApply(input)).toEqual(result);

    const scoped = runApply({
      ...input,
      formats: [
        { formatId: 'modern', birthday: null, deathdate: null },
        { formatId: 'standard', birthday: null, deathdate: null },
      ],
      announcements: [
        { ...input.announcements[0]!, items: input.announcements[0]!.items.map(item => ({ ...item, format: '#standard' })) },
        {
          date: '2017-01-01', effectiveDate: null,
          items: [{ id: 'standard-exit', ruleId: null, type: 'set_change', effectiveDate: null, format: 'standard', status: 'unavailable', score: null, group: null, cardId: null, setId: 's-2016', relatedCards: [] }],
        },
        { ...input.announcements[1]!, items: input.announcements[1]!.items.map(item => ({ ...item, format: '#standard' })) },
      ],
    });
    const removals = scoped.projections.find(p => p.id === 'rotate-out')!.projection.derivedCards!;
    expect(removals.filter(card => card.cardId === 'reprinted-card')).toEqual([
      { formatId: 'standard', cardId: 'reprinted-card', status: 'unavailable', effectiveDate: '2018-02-01', group: null },
    ]);
    expect(banlistOf(scoped, 'modern').map(card => card.cardId)).toEqual(['reprinted-card']);
    expect(banlistOf(scoped, 'standard')).toEqual([]);

    const laterExit = runApply({
      ...input,
      announcements: [...input.announcements, {
        date: '2019-01-01', effectiveDate: null,
        items: [{ id: 'later-exit', ruleId: null, type: 'set_change', effectiveDate: null, format: 'modern', status: 'unavailable', score: null, group: null, cardId: null, setId: 's-2016', relatedCards: [] }],
      }],
    });
    expect(banlistOf(laterExit, 'modern')).toEqual([]);

    const reentry = runApply({
      ...input,
      announcements: [...input.announcements, {
        date: '2019-01-01', effectiveDate: null,
        items: [{ id: 'rotate-back', ruleId: null, type: 'set_change', effectiveDate: null, format: 'modern', status: 'legal', score: null, group: null, cardId: null, setId: 's-2010', relatedCards: [] }],
      }],
    });
    expect(banlistOf(reentry, 'modern')).toEqual([
      { cardId: 'reprinted-card', status: 'banned', score: null, date: '2015-01-01', group: null },
    ]);
  });

  test('an armed group ban re-fires on set re-entry and dates the re-ban at the new entry', () => {
    const result = runApply({
      ...baseInput,
      announcements: [
        {
          date:          '2014-06-01',
          effectiveDate: null,
          items:         [
            { id: 'it-11', ruleId: null, type: 'card_change', effectiveDate: null, format: 'modern', status: 'banned', score: null, group: null, cardId: '#conspiracy', setId: null, relatedCards: [] },
          ],
        },
        {
          date:          '2018-01-01',
          effectiveDate: null,
          items:         [
            { id: 'it-12', ruleId: null, type: 'set_change', effectiveDate: null, format: 'modern', status: 'unavailable', score: null, group: null, cardId: null, setId: 's-2010', relatedCards: [] },
          ],
        },
        {
          date:          '2019-01-01',
          effectiveDate: null,
          items:         [
            { id: 'it-13', ruleId: null, type: 'set_change', effectiveDate: null, format: 'modern', status: 'legal', score: null, group: null, cardId: null, setId: 's-2010', relatedCards: [] },
          ],
        },
      ],
    });

    expect(banlistOf(result, 'modern').map(e => [e.cardId, e.date])).toEqual([
      ['new-card', '2016-03-01'],
      ['old-card', '2019-01-01'],
    ]);
    expect(result.warnings).toEqual([]);
  });

  test('a group restriction stops before cards entering on or after its lifting date', () => {
    const result = runApply({
      ...baseInput,
      formats: [{ formatId: 'vintage', birthday: null, deathdate: null }],
      cardMeta: {
        existing: { typeMain: [], rarities: [], sets: [], releaseDate: '1994-01-01' },
        before: { typeMain: [], rarities: [], sets: [], releaseDate: '1995-09-30' },
        same: { typeMain: [], rarities: [], sets: [], releaseDate: '1995-10-01' },
        after: { typeMain: [], rarities: [], sets: [], releaseDate: '1995-10-02' },
      },
      groupCards: { legendary: ['existing', 'before', 'same', 'after'] },
      announcements: [
        {
          date: '1995-01-10', effectiveDate: null,
          items: [{ id: 'legendary-restrict', ruleId: null, type: 'card_change', effectiveDate: null, format: 'vintage', status: 'restricted', score: null, group: null, cardId: '#legendary', setId: null, relatedCards: [] }],
        },
        {
          date: '1995-10-01', effectiveDate: null,
          items: [{ id: 'legendary-lift', ruleId: null, type: 'card_change', effectiveDate: null, format: 'vintage', status: 'legal', score: null, group: null, cardId: '#legendary', setId: null, relatedCards: [] }],
        },
      ],
    });
    expect(result.projections.find(row => row.id === 'legendary-restrict')!.projection.cards).toEqual([
      { cardId: 'existing', status: 'restricted', effectiveDate: '1995-01-10' },
      { cardId: 'before', status: 'restricted', effectiveDate: '1995-09-30' },
    ]);
    expect(result.projections.find(row => row.id === 'legendary-lift')!.projection.cards.map(card => card.cardId)).toEqual(['existing', 'before']);
    expect(banlistOf(result, 'vintage')).toEqual([]);
  });

  test('a same-day set entry cannot re-fire a group restriction being lifted that day', () => {
    const item = { id: 'restrict', ruleId: null, type: 'card_change', effectiveDate: null, format: 'standard', status: 'restricted', score: null, group: null, cardId: '#legendary', setId: null, relatedCards: [] };
    const result = runApply({
      ...baseInput,
      formats: [{ formatId: 'standard', birthday: null, deathdate: null }],
      sets: [
        { setId: 'old-set', type: 'expansion', releaseDate: '1994-01-01' },
        { setId: 'new-set', type: 'masters', releaseDate: '1995-10-01' },
      ],
      cardMeta: {
        existing: { typeMain: [], rarities: [], sets: ['old-set'], releaseDate: '1994-01-01' },
        entering: { typeMain: [], rarities: [], sets: ['new-set'], releaseDate: '1995-10-01' },
      },
      groupCards: { legendary: ['existing', 'entering'] },
      announcements: [
        { date: '1995-01-10', effectiveDate: null, items: [item] },
        { date: '1995-10-01', effectiveDate: null, items: [
          { ...item, id: 'set-in', type: 'set_change', status: 'legal', cardId: null, setId: 'new-set' },
          { ...item, id: 'lift', status: 'legal' },
        ] },
      ],
    });
    expect(result.projections.find(row => row.id === 'restrict')!.projection.cards.map(card => card.cardId)).toEqual(['existing']);
    expect(banlistOf(result, 'standard')).toEqual([]);
  });

  test('a deferred group restriction cannot supersede an explicit card change on the release date', () => {
    const item = { id: 'restrict', ruleId: null, type: 'card_change', effectiveDate: null, format: 'vintage', status: 'restricted', score: null, group: null, cardId: '#legendary', setId: null, relatedCards: [] };
    const result = runApply({
      ...baseInput,
      formats: [{ formatId: 'vintage', birthday: null, deathdate: null }],
      cardMeta: {
        entering: { typeMain: [], rarities: [], sets: [], releaseDate: '1995-10-01' },
      },
      groupCards: { legendary: ['entering'] },
      announcements: [
        { date: '1995-01-10', effectiveDate: null, items: [item] },
        { date: '1995-10-01', effectiveDate: null, items: [{ ...item, id: 'explicit', cardId: 'entering', status: 'legal' }] },
      ],
    });
    expect(result.projections.find(row => row.id === 'restrict')!.projection.cards).toEqual([]);
    expect(result.projections.find(row => row.id === 'explicit')!.projection.cards).toEqual([
      { cardId: 'entering', status: 'legal', effectiveDate: '1995-10-01' },
    ]);
    expect(banlistOf(result, 'vintage')).toEqual([]);
  });

  test('lifting a sentinel ban projects the real cards whose group restrictions were removed', () => {
    const result = runApply({
      ...baseInput,
      announcements: [
        {
          date: '2017-01-01', effectiveDate: null,
          items: [{ id: 'group-ban', ruleId: null, type: 'card_change', effectiveDate: null, format: 'vintage', status: 'banned', score: null, group: null, cardId: '#conspiracy', setId: null, relatedCards: [] }],
        },
        {
          date: '2018-01-01', effectiveDate: null,
          items: [{ id: 'group-unban', ruleId: null, type: 'card_change', effectiveDate: null, format: 'vintage', status: 'legal', score: null, group: null, cardId: '#conspiracy', setId: null, relatedCards: [] }],
        },
      ],
    });
    expect(banlistOf(result, 'vintage')).toEqual([]);
    expect(result.projections.find(item => item.id === 'group-unban')!.projection.cards).toEqual([
      { cardId: 'old-card', status: 'legal', effectiveDate: '2018-01-01' },
      { cardId: 'new-card', status: 'legal', effectiveDate: '2018-01-01' },
    ]);
  });

  test('a legal card_change lifts a ban and invalid statuses collect into warnings', () => {
    const result = runApply({
      ...baseInput,
      cardMeta: {
        ...baseInput.cardMeta,
        'x-card': { typeMain: ['creature'], rarities: ['rare'], sets: ['s-2010'], releaseDate: '2010-01-01' },
      },
      announcements: [
        {
          date:          '2015-01-01',
          effectiveDate: null,
          items:         [
            { id: 'it-14', ruleId: null, type: 'card_change', effectiveDate: null, format: 'modern', status: 'banned', score: null, group: null, cardId: 'x-card', setId: null, relatedCards: [] },
          ],
        },
        {
          date:          '2016-01-01',
          effectiveDate: null,
          items:         [
            { id: 'it-15', ruleId: null, type: 'card_change', effectiveDate: null, format: 'modern', status: 'legal', score: null, group: null, cardId: 'x-card', setId: null, relatedCards: [] },
            { id: 'it-16', ruleId: null, type: 'card_change', effectiveDate: null, format: 'modern', status: 'buff', score: null, group: null, cardId: 'x-card', setId: null, relatedCards: [] },
          ],
        },
      ],
    });

    expect(banlistOf(result, 'modern')).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('buff');
  });
});
