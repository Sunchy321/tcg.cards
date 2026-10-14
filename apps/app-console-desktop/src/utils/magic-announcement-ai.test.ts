import { describe, expect, test } from 'bun:test';
import { aiAnnouncementResult } from '@tcg-cards/model/magic/schema/announcement-ai';
import { changeStatusByType, gameChangeType } from '@tcg-cards/model/magic/schema/announcement';

import { applyMagicAiResult } from './magic-announcement-ai';
import { newFormItem, type AnnouncementFormConfig, type AnnouncementFormData } from './announcement-form-yaml';

const config: AnnouncementFormConfig = {
  types:        [...gameChangeType.options],
  statusByType: changeStatusByType,
  fields:       { versionFields: false, prevVersion: true, platformDates: true, deltaGlow: false },
};

/** Creates an unsaved editor form with one existing change. */
function makeForm(): AnnouncementFormData {
  return {
    name:                  'My title', source:                'wotc', date:                  '', effectiveDate:         '', effectiveDateTabletop: '',
    effectiveDateOnline:   '2026-10-20', effectiveDateArena:    '', nextDate:              '', prevVersion:           '',
    version:               null, lastVersion:           null, link:                  [{ url: 'https://example.com', label: '' }],
    items:                 [newFormItem('card_change', config)],
  };
}

describe('Magic announcement form application', () => {
  test('fills empty fields, preserves existing information and appends separate changes', () => {
    const form = makeForm();
    const oldItem = form.items[0];
    applyMagicAiResult(form, aiAnnouncementResult.parse({
      header: { name: 'Source title', date: '2026-10-14', effectiveDateOnline: '2026-10-15', effectiveDateArena: '2026-10-16' },
      items:  [
        { type: 'card_change', status: 'score', score: 4, format: 'canadian_highlander', cardId: 'sol-ring', effectiveDate: '2026-10-15' },
        { type: 'card_split', cardId: 'fire--ice', relatedCards: ['fire', 'ice'] },
      ],
    }), config);
    expect(form.name).toBe('My title');
    expect(form.date).toBe('2026-10-14');
    expect(form.effectiveDateOnline).toBe('2026-10-20');
    expect(form.effectiveDateArena).toBe('2026-10-16');
    expect(form.items[0]).toBe(oldItem);
    expect(form.items).toHaveLength(3);
    expect(form.items[1]!.score).toBe(4);
    expect(form.items[1]!.effectiveDate).toBe('2026-10-15');
    expect(form.items[2]!.status).toBe('');
    expect(form.items[2]!.relatedCards).toBe('fire, ice');
    expect(form.source).toBe('wotc');
    expect(form.link).toHaveLength(1);
  });

  test('an empty result leaves authored content intact', () => {
    const form = makeForm();
    const before = structuredClone(form);
    applyMagicAiResult(form, aiAnnouncementResult.parse({ header: {}, items: [] }), config);
    expect(form).toEqual(before);
  });

  test('fills the publication and general effective dates without inventing platform dates', () => {
    const form = makeForm();
    form.effectiveDateOnline = '';
    applyMagicAiResult(form, aiAnnouncementResult.parse({
      header: { date: '2026-10-14', effectiveDate: '2026-10-15' },
      items:  [],
    }), config);
    expect(form.date).toBe('2026-10-14');
    expect(form.effectiveDate).toBe('2026-10-15');
    expect(form.effectiveDateTabletop).toBe('');
    expect(form.effectiveDateOnline).toBe('');
    expect(form.effectiveDateArena).toBe('');
  });

  test('handles each platform date independently and preserves manually entered dates', () => {
    for (const field of ['effectiveDateTabletop', 'effectiveDateOnline', 'effectiveDateArena'] as const) {
      const form = makeForm();
      form.date = '2026-10-01';
      form.effectiveDate = '2026-10-02';
      form.effectiveDateOnline = '';
      applyMagicAiResult(form, aiAnnouncementResult.parse({
        header: { date: '2026-10-14', effectiveDate: '2026-10-15', [field]: '2026-10-16' },
        items:  [],
      }), config);
      expect(form.date).toBe('2026-10-01');
      expect(form.effectiveDate).toBe('2026-10-02');
      for (const candidate of ['effectiveDateTabletop', 'effectiveDateOnline', 'effectiveDateArena'] as const) {
        expect(form[candidate]).toBe(candidate === field ? '2026-10-16' : '');
      }
    }
  });
});
