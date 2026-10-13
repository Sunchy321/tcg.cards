import { describe, expect, test } from 'bun:test';

import { faceValue, isBattleFront, normalizeMtgchText } from './assemble';

describe('isBattleFront', () => {
  test('matches battle type lines', () => {
    expect(isBattleFront('Battle — Siege')).toBe(true);
    expect(isBattleFront('Battle — Control Point')).toBe(true);
  });

  test('ignores other card types and missing lines', () => {
    expect(isBattleFront('Creature — Angel')).toBe(false);
    expect(isBattleFront('Legendary Creature — Human Noble')).toBe(false);
    expect(isBattleFront(null)).toBe(false);
    expect(isBattleFront(undefined)).toBe(false);
  });
});

describe('faceValue', () => {
  test('splits a joined whole-card value into the requested face segment', () => {
    expect(faceValue('看管 // 看护', 0)).toBe('看管');
    expect(faceValue('看管 // 看护', 1)).toBe('看护');
  });

  test('passes values without the joined separator through unchanged', () => {
    expect(faceValue('瞬间', 0)).toBe('瞬间');
    expect(faceValue('生物～狼人', 1)).toBe('生物～狼人');
    expect(faceValue('', 0)).toBe('');
  });

  test('falls back to the whole value when the face index has no segment', () => {
    expect(faceValue('瞬间', 3)).toBe('瞬间');
  });

  test('maps null through to null', () => {
    expect(faceValue(null, 0)).toBe(null);
    expect(faceValue(undefined, 0)).toBe(null);
  });
});

describe('normalizeMtgchText', () => {
  test('reduces the mainstream double-backslash newline escape', () => {
    expect(normalizeMtgchText('飞行\\\\n敏捷')).toBe('飞行\n敏捷');
  });

  test('reduces the CRLF escape variant', () => {
    expect(normalizeMtgchText('转化所有昼形永久物。\\\\r\\\\n永久物以夜形状态进战场。')).toBe('转化所有昼形永久物。\n永久物以夜形状态进战场。');
  });

  test('reduces a lone carriage-return escape', () => {
    expect(normalizeMtgchText('第一行\\\\r第二行')).toBe('第一行\n第二行');
  });

  test('reduces single-backslash escapes, the convention zhs_card text partly uses', () => {
    expect(normalizeMtgchText('放进战场，然后洗牌。\\r\\n每当一个龙在你的操控下进战场时')).toBe('放进战场，然后洗牌。\n每当一个龙在你的操控下进战场时');
    expect(normalizeMtgchText('传奇生物～人类／弓箭手\\r\\r\\n')).toBe('传奇生物～人类／弓箭手\n\n');
    expect(normalizeMtgchText('飞行\\n敏捷')).toBe('飞行\n敏捷');
  });

  test('leaves no stray backslash when doubled and single escapes share a value', () => {
    expect(normalizeMtgchText('第一行\\\\n第二行\\n第三行')).toBe('第一行\n第二行\n第三行');
  });

  test('keeps real newlines and plain text untouched', () => {
    expect(normalizeMtgchText('第一行\n第二行')).toBe('第一行\n第二行');
    expect(normalizeMtgchText('飞行')).toBe('飞行');
  });

  test('maps empty and null values to null', () => {
    expect(normalizeMtgchText('')).toBe(null);
    expect(normalizeMtgchText(null)).toBe(null);
    expect(normalizeMtgchText(undefined)).toBe(null);
  });
});
