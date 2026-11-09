import { expect, test } from 'bun:test';
import { announcementItem } from '@tcg-cards/model/magic/schema/announcement';

import { expandFormatChanges } from './format-changes';

const change = {
  ...announcementItem.parse({
    id:             '00000000-0000-4000-8000-000000000001',
    announcementId: '00000000-0000-4000-8000-000000000002',
    type:           'set_change', order:          0, effectiveDate:  null, format:         '#standard',
    status:         'unavailable', score:          null, group:          null, prevVersion:    null,
    delta:          null, glow:           null, cardId:         null, setId:          'old-set', ruleId:         null,
    relatedCards:   [], createdAt:      '2020-01-01T00:00:00Z', updatedAt:      '2020-01-01T00:00:00Z',
    projection:     {
      formats:      ['modern', 'standard'],
      cards:        [{ cardId: 'reprinted-card', status: 'unavailable', effectiveDate: '2018-02-01' }],
      derivedCards: [
        { formatId: 'modern', cardId: 'rotated-card', status: 'unavailable', effectiveDate: '2018-02-01', group: 'conspiracy' },
        { formatId: 'standard', cardId: 'reprinted-card', status: 'unavailable', effectiveDate: '2018-02-01', group: null },
      ],
    },
  }),
  date: '2018-01-01',
  link: [{ url: 'https://example.com/rotation' }],
};

test('format history includes only actual rotation removals for the requested format', () => {
  const events = expandFormatChanges([change], 'modern');
  expect(events).toHaveLength(2);
  expect(events[0]).toEqual(change);
  expect(events[1]).toMatchObject({
    type:           'card_change', cardId:         'rotated-card', status:         'unavailable',
    format:         'modern', date:           '2018-02-01', score:          null, group:          'conspiracy',
    setId:          null, relatedCards:   [], announcementId: change.announcementId, link:           change.link,
  });
  expect(events.some(event => event.cardId === 'reprinted-card')).toBe(false);
  expect(expandFormatChanges([change], 'standard')[1]!.cardId).toBe('reprinted-card');
});

test('older projections remain readable without manufacturing rotation removals', () => {
  const legacy = { ...change, projection: { formats: ['modern'], cards: change.projection.cards } };
  expect(expandFormatChanges([legacy], 'modern')).toEqual([legacy]);
});

test('sentinel bans expand to real cards with their group and individual effective dates', () => {
  const sentinel = {
    ...change,
    type:       'card_change' as const,
    cardId:     '#ante', setId:      null, status:     'banned' as const,
    projection: {
      formats: ['standard'],
      cards:   [
        { cardId: 'contract-from-below', status: 'banned', effectiveDate: '2018-01-01' },
        { cardId: 'jeweled-bird', status: 'banned', effectiveDate: '2018-02-01' },
      ],
    },
  };
  const events = expandFormatChanges([sentinel], 'standard');
  expect(events.map(event => [event.cardId, event.group, event.status, event.date])).toEqual([
    ['contract-from-below', 'ante', 'banned', '2018-01-01'],
    ['jeweled-bird', 'ante', 'banned', '2018-02-01'],
  ]);
  expect(events.every(event => event.announcementId === sentinel.announcementId)).toBe(true);
});

test('an empty sentinel expansion does not expose the sentinel as a card', () => {
  const sentinel = {
    ...change, type:       'card_change' as const, cardId:     '#conspiracy', setId:      null,
    status:     'banned' as const, projection: { formats: ['standard'], cards: [] },
  };
  expect(expandFormatChanges([sentinel], 'standard')).toEqual([]);
});

test('a copied card carries its projected score without a clone group label', () => {
  const clone = {
    ...change, type:       'card_change' as const, cardId:     '#{clone:vintage,pauper}', setId:      null,
    status:     null, projection: {
      formats: ['modern'],
      cards:   [
        { cardId: 'copied', status: 'score', score: 4, effectiveDate: '2018-01-01', sourceFormats: ['pauper', 'vintage'] },
        { cardId: 'other', status: 'banned', effectiveDate: '2018-01-01', sourceFormats: ['vintage'] },
      ],
    },
  };
  const events = expandFormatChanges([clone], 'modern');
  expect(events[0]).toMatchObject({
    cardId: 'copied', status: 'score', score: 4, group: null, copiedFrom: ['pauper', 'vintage'],
  });
  expect(events[1]).toMatchObject({ cardId: 'other', group: null, copiedFrom: ['vintage'] });
});

test('a previously projected single source remains readable', () => {
  const clone = {
    ...change, type:       'card_change' as const, cardId:     '#{clone:vintage}', setId:      null,
    projection: {
      formats: ['modern'],
      cards:   [{ cardId: 'copied', status: 'banned', effectiveDate: '2018-01-01', sourceFormat: 'vintage' }],
    },
  };
  expect(expandFormatChanges([clone], 'modern')[0]).toMatchObject({ copiedFrom: ['vintage'] });
});

test('a raw format reference cannot restore an item excluded by the lifetime-filtered projection', () => {
  const excluded = { ...change, format: 'modern', projection: { formats: [], cards: [] } };
  expect(expandFormatChanges([excluded], 'modern')).toEqual([]);
});
