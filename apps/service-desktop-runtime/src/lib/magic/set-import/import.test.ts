import { describe, expect, test } from 'bun:test';
import { buildSeries, parseSeriesResponse } from './series';

/** Complete Scryfall series used by offline import examples. */
const source = {
  id:           '4e47a6cd-cdeb-4b0f-8f24-cfe1a0127cb3', code:         'NEO', name:         'Kamigawa: Neon Dynasty',
  set_type:     'expansion', card_count:   512, digital:      false, foil_only:    false, nonfoil_only: false,
  released_at:  '2022-02-18',
};

describe('series import', () => {
  test('uses Scryfall baseline, real translations and locally collected print statistics', () => {
    const result = buildSeries({ source, supplement: {
      name:         'Other name', releaseDate:  '2000-01-01', totalSetSize: 302, keyruneCode:  'NEO',
      translations: { 'Chinese Simplified': 'Do not use', 'German': 'Kamigawa: Neon-Dynastie', 'Japanese': null },
    }, chinese: '神河霓朝纪', statistics: { langs: ['zhs', 'en'], rarities: ['rare', 'common'] } });
    expect(result.row).toMatchObject({ setId:        'neo', releaseDate:  '2022-02-18', cardCount:    512, totalSetSize: 302,
      langs:        ['en', 'zhs'], rarities:     ['common', 'rare'], keyruneCode:  'NEO' });
    expect(result.names.map(n => [n.lang, n.name])).toEqual([
      ['en', 'Kamigawa: Neon Dynasty'], ['zhs', '神河霓朝纪'], ['de', 'Kamigawa: Neon-Dynastie'],
    ]);
  });

  test('preserves missing supplements and explicit manual choices across repeated imports', () => {
    const previous = buildSeries({ source, supplement: { keyruneCode:  'NEO', totalSetSize: 302,
      translations: { German: 'Kamigawa: Neon-Dynastie' } }, chinese:    '神河霓朝纪' });
    const first = buildSeries({ source, previous: previous.row, names:    previous.names, chinese:  '神河霓朝纪',
      choice:   { symbolStyle: ['white'], doubleFacedIcon: ['sun', 'moon'] } });
    const second = buildSeries({ source, previous: first.row, names:    first.names,
      choice:   { symbolStyle: null, doubleFacedIcon: null } });
    expect(first.row).toMatchObject({ keyruneCode:     'NEO', totalSetSize:    302,
      symbolStyle:     ['white'], doubleFacedIcon: ['sun', 'moon'] });
    expect(first.names).toEqual(previous.names);
    expect(second.row).toMatchObject({ symbolStyle: null, doubleFacedIcon: null });
  });

  test('falls back to English instead of retaining unavailable or invented Chinese translations', () => {
    const result = buildSeries({ source, supplement: { translations: { 'Chinese Simplified': 'Unused', 'Japanese': null } },
      names:      [{ setId: 'neo', lang: 'zhs', name: 'Old translation' }] });
    expect(result.names.map(n => n.lang)).toEqual(['en']);
  });

  test('rejects empty, truncated and duplicate online series lists before any updates', () => {
    expect(() => parseSeriesResponse({ object: 'list', has_more: false, data: [] })).toThrow('不完整');
    expect(() => parseSeriesResponse({ object: 'list', has_more: true, data: [source] })).toThrow('不完整');
    expect(() => parseSeriesResponse({ object: 'list', has_more: false, data: [source, source] })).toThrow('重复');
    expect(parseSeriesResponse({ object: 'list', has_more: false, data: [source] })).toHaveLength(1);
  });
});
