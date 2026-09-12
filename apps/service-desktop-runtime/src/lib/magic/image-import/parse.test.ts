import { describe, expect, test } from 'bun:test';

import { chooseNamingPattern, numberCandidates, parseImageStem, parseTreeLayout } from './parse';

const treeLangs = new Set(['en', 'zhs']);

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

  test('parses the asterism back-face mark', () => {
    expect(parseImageStem('165⁑')).toMatchObject({ kind: 'face', number: '165', faceIndex: 1 });
    expect(parseTreeLayout([{ filename: 'large/m10/en/165⁑.webp' }], treeLangs)![0])
      .toMatchObject({ set: 'm10', lang: 'en', number: '165', faceIndex: 1 });
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

describe('parseTreeLayout', () => {
  test('resolves storage-tree paths across sets, languages and faces', () => {
    const parsed = parseTreeLayout([
      { filename: 'large/m10/en/165.webp' },
      { filename: 'large/m10/zhs/165-1.webp' },
      { filename: 'dst/zhs/001.png' },
    ], treeLangs);
    expect(parsed).not.toBeNull();
    expect(parsed![0]).toMatchObject({ set: 'm10', lang: 'en', number: '165' });
    expect(parsed![1]).toMatchObject({ set: 'm10', lang: 'zhs', number: '165', faceIndex: 1 });
    expect(parsed![2]).toMatchObject({ set: 'dst', lang: 'zhs', number: '001' });
  });

  test('rejects archives that are not storage trees', () => {
    expect(parseTreeLayout([{ filename: '001#名称.png' }], treeLangs)).toBeNull();
    expect(parseTreeLayout([{ filename: 'large/m10/klingon/165.webp' }], treeLangs)).toBeNull();
    expect(parseTreeLayout([{ filename: 'large/m10/165.webp' }], treeLangs)).toBeNull();
    expect(parseTreeLayout([], treeLangs)).toBeNull();
  });
});
