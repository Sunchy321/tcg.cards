import { describe, expect, test } from 'bun:test';

import {
  announcementToYaml,
  defaultItemType,
  newFormItem,
  normalizeItemStatus,
  parseRelatedCards,
  yamlToAnnouncement,
  type AnnouncementFormConfig,
} from './announcement-form-yaml';

const magicConfig: AnnouncementFormConfig = {
  types: ['card_change', 'card_update', 'set_change', 'rule_change', 'format_birth', 'format_death', 'card_split', 'card_merge'],
  statusByType: {
    card_change:  { statuses: ['banned', 'legal', 'restricted'], default: 'banned' },
    card_update:  { statuses: ['buff', 'nerf'], default: 'buff' },
    set_change:   { statuses: ['legal', 'unavailable', 'extend'], default: 'legal' },
    rule_change:  { statuses: [], default: null },
    format_birth: { statuses: [], default: null },
    format_death: { statuses: [], default: null },
    card_split:   { statuses: [], default: null },
    card_merge:   { statuses: [], default: null },
  },
  fields: { versionFields: false, prevVersion: true, platformDates: true, deltaGlow: false },
};

describe('normalizeItemStatus', () => {
  test('an empty status falls back to the type default; statusless types stay empty', () => {
    expect(normalizeItemStatus('card_change', '', magicConfig)).toBe('banned');
    expect(normalizeItemStatus('card_split', '', magicConfig)).toBe('');
  });

  test('an invalid status falls back to the type default; a valid one passes through', () => {
    expect(normalizeItemStatus('card_change', 'buff', magicConfig)).toBe('banned');
    expect(normalizeItemStatus('card_change', 'restricted', magicConfig)).toBe('restricted');
  });
});

describe('newFormItem', () => {
  test('seeds the default item type with its normalized default status', () => {
    const item = newFormItem(defaultItemType(magicConfig), magicConfig);
    expect(item.type).toBe('card_change');
    expect(item.status).toBe('banned');
  });
});

describe('parseRelatedCards', () => {
  test('splits on commas and drops empties', () => {
    expect(parseRelatedCards('a, b ,, c')).toEqual(['a', 'b', 'c']);
    expect(parseRelatedCards('')).toEqual([]);
  });
});

describe('announcement yaml round trip', () => {
  test('serializes with magic fields and parses back losslessly', () => {
    const form = {
      source:                'wizards',
      date:                  '2026-10-13',
      effectiveDate:         '2026-10-16',
      effectiveDateTabletop: '2026-10-16',
      effectiveDateOnline:   '2026-10-15',
      effectiveDateArena:    '',
      nextDate:              '2026-10-20',
      prevVersion:           '2026-01-01',
      version:               null,
      lastVersion:           null,
      name:                  '禁限牌更新',
      link:                  [{ url: 'https://example.com/a', label: '' }],
      items:                 [
        {
          type: 'card_change', status: 'banned', effectiveDate: '', format: '#eternal', group: '',
          prevVersion: '', version: null, lastVersion: null,
          cardId: '', setId: '', ruleId: '', relatedCards: 'a, b', score: null, delta: '', glow: '',
        },
        {
          type: 'card_split', status: '', effectiveDate: '', format: 'alchemy', group: '',
          prevVersion: '', version: null, lastVersion: null,
          cardId: 'a-a', setId: '', ruleId: '', relatedCards: '', score: null, delta: '', glow: '',
        },
      ],
    };

    const yaml = announcementToYaml(form, magicConfig);
    expect(yaml).not.toContain('version:');
    expect(yaml).toContain('prevVersion:');

    const parsed = yamlToAnnouncement(yaml, magicConfig);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.form.source).toBe('wizards');
    expect(parsed.form.effectiveDateOnline).toBe('2026-10-15');
    expect(parsed.form.effectiveDateArena).toBe('');
    expect(parsed.form.prevVersion).toBe('2026-01-01');
    expect(parsed.form.items[0]!.relatedCards).toBe('a, b');
    expect(parsed.form.items[0]!.status).toBe('banned');
    expect(parsed.form.items[1]!.type).toBe('card_split');
    expect(parsed.form.items[1]!.status).toBe('');
  });

  test('rejects unknown types and invalid statuses with messages', () => {
    const yaml = [
      'source: wizards',
      'date: "2026-10-13"',
      'name: x',
      'items:',
      '  - type: no_such_type',
      '  - type: card_change',
      '    status: buff',
    ].join('\n');

    const parsed = yamlToAnnouncement(yaml, magicConfig);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) {
      return;
    }
    expect(parsed.errors.some(e => e.includes('no_such_type'))).toBe(true);
    expect(parsed.errors.some(e => e.includes('buff'))).toBe(true);
  });
});
