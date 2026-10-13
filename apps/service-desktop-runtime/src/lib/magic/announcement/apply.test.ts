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

  test('a sentinel ban writes per-card entries: released cards at the ban date, later releases at their release', () => {
    const result = runApply({
      ...baseInput,
      announcements: [
        {
          date:          '2014-06-01',
          effectiveDate: null,
          items:         [
            { type: 'card_change', effectiveDate: null, format: '#eternal', status: 'banned', score: null, group: null, cardId: '#conspiracy', setId: null, relatedCards: [] },
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
            { type: 'card_change', effectiveDate: null, format: 'pauper', status: 'banned', score: null, group: null, cardId: '#conspiracy', setId: null, relatedCards: [] },
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
            { type: 'card_change', effectiveDate: null, format: 'modern', status: 'banned', score: null, group: null, cardId: 'x-card', setId: null, relatedCards: [] },
            { type: 'card_change', effectiveDate: null, format: 'vintage', status: 'banned', score: null, group: null, cardId: 'x-card', setId: null, relatedCards: [] },
          ],
        },
        {
          date:          '2010-06-01',
          effectiveDate: '2999-01-01',
          items:         [
            { type: 'card_change', effectiveDate: null, format: 'vintage', status: 'banned', score: null, group: null, cardId: 'y-card', setId: null, relatedCards: [] },
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
            { type: 'card_change', effectiveDate: null, format: 'modern', status: 'banned', score: null, group: null, cardId: 'x-card', setId: null, relatedCards: [] },
            { type: 'card_change', effectiveDate: null, format: 'modern', status: 'banned', score: null, group: null, cardId: '#conspiracy', setId: null, relatedCards: [] },
          ],
        },
        {
          date:          '2018-01-01',
          effectiveDate: null,
          items:         [
            { type: 'set_change', effectiveDate: null, format: 'modern', status: 'unavailable', score: null, group: null, cardId: null, setId: 's-2010', relatedCards: [] },
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
            { type: 'card_change', effectiveDate: null, format: 'modern', status: 'banned', score: null, group: null, cardId: '#conspiracy', setId: null, relatedCards: [] },
          ],
        },
        {
          date:          '2018-01-01',
          effectiveDate: null,
          items:         [
            { type: 'set_change', effectiveDate: null, format: 'modern', status: 'unavailable', score: null, group: null, cardId: null, setId: 's-2010', relatedCards: [] },
          ],
        },
        {
          date:          '2019-01-01',
          effectiveDate: null,
          items:         [
            { type: 'set_change', effectiveDate: null, format: 'modern', status: 'legal', score: null, group: null, cardId: null, setId: 's-2010', relatedCards: [] },
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
            { type: 'card_change', effectiveDate: null, format: 'modern', status: 'banned', score: null, group: null, cardId: 'x-card', setId: null, relatedCards: [] },
          ],
        },
        {
          date:          '2016-01-01',
          effectiveDate: null,
          items:         [
            { type: 'card_change', effectiveDate: null, format: 'modern', status: 'legal', score: null, group: null, cardId: 'x-card', setId: null, relatedCards: [] },
            { type: 'card_change', effectiveDate: null, format: 'modern', status: 'buff', score: null, group: null, cardId: 'x-card', setId: null, relatedCards: [] },
          ],
        },
      ],
    });

    expect(banlistOf(result, 'modern')).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('buff');
  });
});
