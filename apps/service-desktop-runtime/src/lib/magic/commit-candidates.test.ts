import { test, expect } from 'bun:test';
import {
  buildCandidateFaces,
  candidateFaceCount,
  candidateOracleEligible,
  type CandidateCardFacts,
  type CandidateFaceRow,
} from './commit-candidates';

function row(faceIndex: number | null, faceName: string | null, overrides: Partial<CandidateFaceRow> = {}): CandidateFaceRow {
  return {
    faceIndex,
    faceName,
    name:       '全名',
    typeLine:   '生物',
    text:       '文字',
    flavorName: null,
    flavorText: null,
    ...overrides,
  };
}

test('buildCandidateFaces aligns per-face rows by index and prefers the face name', () => {
  const faces = buildCandidateFaces([
    row(1, '背面名', { typeLine: '瞬间\\\\n转移', name: '整体名' }),
    row(0, '正面名'),
  ], 2);
  expect(faces).toEqual([
    { printedName: '正面名', printedTypeLine: '生物', printedText: '文字' },
    { printedName: '背面名', printedTypeLine: '瞬间\n转移', printedText: '文字' },
  ]);
});

test('buildCandidateFaces carries the flavor name and text of the row', () => {
  const faces = buildCandidateFaces([
    row(-1, null, { flavorName: '瓦纳·迪尔的冒险者', flavorText: '石板上刻着如尼文字：\\\\n巴林\\\\n芬丁之子' }),
  ], 1);
  expect(faces).toEqual([{
    printedName:     '全名',
    printedTypeLine: '生物',
    printedText:     '文字',
    flavorName:      '瓦纳·迪尔的冒险者',
    flavorText:      '石板上刻着如尼文字：\n巴林\n芬丁之子',
  }]);
});

test('buildCandidateFaces omits flavor the row does not assert', () => {
  const faces = buildCandidateFaces([row(-1, null, { flavorText: '', flavorName: null })], 1);
  expect(faces).toEqual([{ printedName: '全名', printedTypeLine: '生物', printedText: '文字' }]);
});

test('buildCandidateFaces keeps flavor out of the face a row does not fill', () => {
  const faces = buildCandidateFaces([row(1, '只有背面', { flavorText: '背面的风味' })], 2);
  expect(faces).toEqual([
    {},
    { printedName: '只有背面', printedTypeLine: '生物', printedText: '文字', flavorText: '背面的风味' },
  ]);
});

test('buildCandidateFaces feeds a single face from the whole-card row', () => {
  const faces = buildCandidateFaces([row(-1, null, { name: '整体名' })], 1);
  expect(faces).toEqual([{ printedName: '整体名', printedTypeLine: '生物', printedText: '文字' }]);
});

test('buildCandidateFaces leaves unfilled slots empty and pads index mismatches', () => {
  const faces = buildCandidateFaces([row(1, '只有背面')], 2);
  expect(faces).toEqual([
    {},
    { printedName: '只有背面', printedTypeLine: '生物', printedText: '文字' },
  ]);
});

test('buildCandidateFaces keeps slots empty when mtgch offers nothing', () => {
  expect(buildCandidateFaces([], 2)).toEqual([{}, {}]);
});

function card(overrides: Partial<CandidateCardFacts> = {}): CandidateCardFacts {
  return { layout: 'normal', name: 'Bolt', cardFaces: null, ...overrides };
}

test('candidateOracleEligible accepts normal cards and single-card DFTs', () => {
  expect(candidateOracleEligible(card())).toBe(true);
  expect(candidateOracleEligible(card({
    layout: 'double_faced_token',
    name: 'Incubator // Phyrexian',
    cardFaces: [{ name: 'Incubator' }, { name: 'Phyrexian' }],
  }))).toBe(true);
});

test('candidateOracleEligible rejects reversible cards, art-back and split DFTs', () => {
  expect(candidateOracleEligible(card({ layout: 'reversible_card' }))).toBe(false);
  // art-back: same-name faces without rules text nor P/T
  expect(candidateOracleEligible(card({
    layout: 'double_faced_token',
    name: 'Zombie // Zombie',
    cardFaces: [{ name: 'Zombie' }, { name: 'Zombie' }],
  }))).toBe(false);
  // split DFT: two differently-named faces that are not a known single-card pair
  expect(candidateOracleEligible(card({
    layout: 'double_faced_token',
    name: 'Angel // Demon',
    cardFaces: [{ name: 'Angel' }, { name: 'Demon' }],
  }))).toBe(false);
});

test('candidateFaceCount reads the face slots, defaulting to one', () => {
  expect(candidateFaceCount(card())).toBe(1);
  expect(candidateFaceCount(card({ cardFaces: [{ name: 'A' }, { name: 'B' }] }))).toBe(2);
});
