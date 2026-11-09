import { describe, expect, test } from 'bun:test';

import { parsePrintImageKey, printImageFileName, printImageKey } from './print-image';

describe('printImageFileName', () => {
  test('face 0 and no face carry no suffix', () => {
    expect(printImageFileName('123')).toBe('123.webp');
    expect(printImageFileName('123', 0)).toBe('123.webp');
    expect(printImageFileName('123', undefined)).toBe('123.webp');
  });

  test('the back face carries the ⁑ mark', () => {
    expect(printImageFileName('123', 1)).toBe('123⁑.webp');
  });

  test('further faces carry a numeric suffix', () => {
    expect(printImageFileName('123', 2)).toBe('123-2.webp');
    expect(printImageFileName('123', 5)).toBe('123-5.webp');
  });

  test('slashes become underscores', () => {
    expect(printImageFileName('a/b')).toBe('a_b.webp');
    expect(printImageKey('znr', 'en', 'a/b')).toBe('large/znr/en/a_b.webp');
  });
});

describe('printImageKey', () => {
  test('builds the large/set/lang layout', () => {
    expect(printImageKey('mid', 'en', '297')).toBe('large/mid/en/297.webp');
    expect(printImageKey('neo', 'zhs', '78', 1)).toBe('large/neo/zhs/78⁑.webp');
  });
});

describe('parsePrintImageKey', () => {
  test('round-trips front faces', () => {
    expect(parsePrintImageKey(printImageKey('mid', 'en', '297'))).toEqual({
      set: 'mid', lang: 'en', number: '297', faceIndex: 0,
    });
  });

  test('round-trips back faces', () => {
    expect(parsePrintImageKey(printImageKey('neo', 'zhs', '78', 1))).toEqual({
      set: 'neo', lang: 'zhs', number: '78', faceIndex: 1,
    });
  });

  test('round-trips numbered faces', () => {
    expect(parsePrintImageKey(printImageKey('mid', 'en', '297', 3))).toEqual({
      set: 'mid', lang: 'en', number: '297', faceIndex: 3,
    });
  });

  test('round-trips sanitized slashes', () => {
    expect(parsePrintImageKey(printImageKey('znr', 'en', 'a/b'))).toEqual({
      set: 'znr', lang: 'en', number: 'a_b', faceIndex: 0,
    });
  });

  test('keeps hyphenated numbers that never encode a face', () => {
    // `printImageFileName` emits `-N` only from 2 up, so `-0`/`-1` stems are
    // collector numbers, not faces.
    expect(parsePrintImageKey('large/mid/en/5-1.webp')).toEqual({
      set: 'mid', lang: 'en', number: '5-1', faceIndex: 0,
    });
  });

  test('rejects keys that are not print images', () => {
    expect(parsePrintImageKey('other/mid/en/297.webp')).toBeNull();
    expect(parsePrintImageKey('large/mid/en/297.jpg')).toBeNull();
    expect(parsePrintImageKey('large/mid/297.webp')).toBeNull();
    expect(parsePrintImageKey('large/mid/en/297/extra.webp')).toBeNull();
    expect(parsePrintImageKey('large//en/297.webp')).toBeNull();
    expect(parsePrintImageKey('large/mid/en/⁑.webp')).toBeNull();
  });
});
