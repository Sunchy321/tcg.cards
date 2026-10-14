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

  test('a set leaving removes every ban whose card loses its last set, group entries included', () => {
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
    expect(banlistOf(result, 'modern').map(e => [e.cardId, e.date])).toEqual([['new-card', '2016-03-01']]);
    expect(result.warnings).toEqual([]);
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
