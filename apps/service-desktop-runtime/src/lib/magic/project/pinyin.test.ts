import { describe, expect, test } from 'bun:test';

import { deriveMagicNamePinyin } from './pinyin';

describe('Magic card-name pinyin', () => {
  test('derives joined lowercase full pinyin and initials without tones', () => {
    expect(deriveMagicNamePinyin('汉语拼音', 'zhs')).toEqual({
      full:     'hanyupinyin',
      initials: 'hypy',
    });
  });

  test('uses the dictionary reading selected from word context', () => {
    expect(deriveMagicNamePinyin('银行', 'zhs')).toEqual({
      full:     'yinhang',
      initials: 'yh',
    });
  });

  test('converts Traditional Chinese card names with the Traditional dictionary', () => {
    expect(deriveMagicNamePinyin('銀行', 'zht')).toEqual({
      full:     'yinhang',
      initials: 'yh',
    });
  });
});
