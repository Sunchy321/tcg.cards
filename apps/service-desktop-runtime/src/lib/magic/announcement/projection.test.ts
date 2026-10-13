import { describe, expect, test } from 'bun:test';

import {
  magicEternalFormats,
  magicFormatKeywordMap,
  magicRotatingFormats,
} from './data/format-keywords';
import { projectItem, resolveFormats, type ProjectionContext } from './projection';

const context: ProjectionContext = {
  setCards:                  { 'set-a': ['card-1', 'card-2'] },
  groupCards:                { conspiracy: ['old-card', 'new-card'] },
  cardReleaseDates:          { 'old-card': '2010-01-01', 'new-card': '2016-03-01' },
  announcementEffectiveDate: '2014-06-01',
};

describe('resolveFormats', () => {
  test('expands umbrella keywords to their target formats', () => {
    expect(resolveFormats('#eternal')).toEqual([...magicEternalFormats]);
    expect(resolveFormats('#standard')).toEqual([...magicEternalFormats, ...magicRotatingFormats]);
    expect(magicFormatKeywordMap['#alchemy']).toEqual(['alchemy', 'historic', 'timeless']);
  });

  test('passes literal format ids through and treats a missing format as no format', () => {
    expect(resolveFormats('modern')).toEqual(['modern']);
    expect(resolveFormats(null)).toEqual([]);
  });
});

describe('projectItem', () => {
  test('collects cardId and relatedCards without duplication, no entries for plain items', () => {
    const result = projectItem(
      { type: 'card_change', format: 'modern', status: 'banned', effectiveDate: null, cardId: 'a', setId: null, relatedCards: ['a', 'b'] },
      context,
    );

    expect(result.cards.sort()).toEqual(['a', 'b']);
    expect(result.formats).toEqual(['modern']);
    expect(result.entries).toEqual([]);
  });

  test('fans a set_change out to every card of the set', () => {
    const result = projectItem(
      { type: 'set_change', format: null, status: 'legal', effectiveDate: null, cardId: null, setId: 'set-a', relatedCards: [] },
      context,
    );

    expect(result.cards.sort()).toEqual(['card-1', 'card-2']);
  });

  test('a sentinel ban generates per-card entries: released cards at the ban date, later releases at their release', () => {
    const result = projectItem(
      { type: 'card_change', format: '#eternal', status: 'banned', effectiveDate: null, cardId: '#conspiracy', setId: null, relatedCards: [] },
      context,
    );

    expect(result.formats).toEqual([...magicEternalFormats]);
    expect(result.cards.sort()).toEqual(['new-card', 'old-card']);
    expect(result.entries).toEqual([
      { cardId: 'old-card', status: 'banned', effectiveDate: '2014-06-01' },
      { cardId: 'new-card', status: 'banned', effectiveDate: '2016-03-01' },
    ]);
  });

  test('an item effective date overrides the announcement date in sentinel entries', () => {
    const result = projectItem(
      { type: 'card_change', format: null, status: 'banned', effectiveDate: '2015-01-01', cardId: '#conspiracy', setId: null, relatedCards: [] },
      context,
    );

    expect(result.entries.map(e => [e.cardId, e.effectiveDate])).toEqual([['old-card', '2015-01-01'], ['new-card', '2016-03-01']]);
  });
});
