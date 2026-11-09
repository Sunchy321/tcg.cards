import { describe, expect, test } from 'bun:test';

import {
  magicEternalFormats,
  magicFormatKeywordMap,
  magicRotatingFormats,
} from './data/format-keywords';
import { cloneSourceFormats, isSentinelCardId, resolveFormats } from './projection';

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
    expect(isSentinelCardId('#{clone:vintage,pauper}')).toBe(false);
    expect(isSentinelCardId('black-lotus')).toBe(false);
  });
});

describe('cloneSourceFormats', () => {
  test('parses a source list and rejects malformed or repeated sources', () => {
    expect(cloneSourceFormats('#{clone:vintage,pauper}')).toEqual(['vintage', 'pauper']);
    expect(cloneSourceFormats('black-lotus')).toBeNull();
    expect(() => cloneSourceFormats('#{clone:vintage,vintage}')).toThrow();
    expect(() => cloneSourceFormats('#{clone:vintage')).toThrow();
  });
});
