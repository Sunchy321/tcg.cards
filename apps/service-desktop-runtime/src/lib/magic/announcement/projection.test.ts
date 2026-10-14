import { describe, expect, test } from 'bun:test';

import {
  magicEternalFormats,
  magicFormatKeywordMap,
  magicRotatingFormats,
} from './data/format-keywords';
import { isSentinelCardId, resolveFormats } from './projection';

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

describe('isSentinelCardId', () => {
  test('recognizes # prefixed group ids only', () => {
    expect(isSentinelCardId('#conspiracy')).toBe(true);
    expect(isSentinelCardId('black-lotus')).toBe(false);
  });
});
