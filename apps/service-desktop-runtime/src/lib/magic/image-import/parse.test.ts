import { describe, expect, test } from 'bun:test';

import { chooseNamingPattern, numberCandidates, parseImageStem } from './parse';

describe('parseImageStem', () => {
  test('parses number#name archives', () => {
    expect(parseImageStem('001#欧瑞克扫刀手')).toMatchObject({ kind: 'named', number: '001', name: '欧瑞克扫刀手' });
    expect(parseImageStem('12_Elm Street')).toMatchObject({ kind: 'named', number: '12', name: 'Elm Street' });
    expect(parseImageStem('7 pick the torch')).toMatchObject({ kind: 'named', number: '7', name: 'pick the torch' });
  });

  test('parses face-suffixed numbers before name separators', () => {
    expect(parseImageStem('001-0')).toMatchObject({ kind: 'face', number: '001', faceIndex: 0 });
    expect(parseImageStem('12-1')).toMatchObject({ kind: 'face', number: '12', faceIndex: 1 });
  });

  test('parses plain collector numbers with letter suffixes', () => {
    expect(parseImageStem('001')).toMatchObject({ kind: 'plain', number: '001' });
    expect(parseImageStem('100a')).toMatchObject({ kind: 'plain', number: '100a' });
    expect(parseImageStem('7')).toMatchObject({ kind: 'plain', number: '7' });
  });

  test('rejects free-form names without a collector number', () => {
    expect(parseImageStem('cover art')).toBeNull();
    expect(parseImageStem('')).toBeNull();
  });
});

describe('chooseNamingPattern', () => {
  const named = ['001#甲', '002#乙', '003#丙'].map(stem => parseImageStem(stem)!);

  test('selects the dominant pattern above the coverage threshold', () => {
    expect(chooseNamingPattern(named)).toBe('named');
  });

  test('refuses to guess below the coverage threshold', () => {
    expect(chooseNamingPattern(named)).toBe('named');
    const mixed = ['001', '002', '003#甲', '004#乙'].map(stem => parseImageStem(stem)!);
    expect(chooseNamingPattern(mixed)).toBeNull();
  });

  test('returns null for empty input', () => {
    expect(chooseNamingPattern([])).toBeNull();
  });
});

describe('numberCandidates', () => {
  test('adds the leading-zero-stripped variant', () => {
    expect(numberCandidates('001')).toEqual(['001', '1']);
    expect(numberCandidates('012a')).toEqual(['012a', '12a']);
  });

  test('keeps numbers without leading zeros single-valued', () => {
    expect(numberCandidates('7')).toEqual(['7']);
    expect(numberCandidates('100a')).toEqual(['100a']);
    expect(numberCandidates('000')).toEqual(['000', '0']);
  });
});
