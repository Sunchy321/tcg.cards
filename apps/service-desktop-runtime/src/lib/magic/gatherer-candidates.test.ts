import { test, expect } from 'bun:test';
import {
  alignedGathererMultiverseIds,
  buildGathererFaces,
  gathererLocale,
  gathererLocaleMatches,
  gathererSurfacesAgree,
  normalizeGathererText,
  type GathererFaceRow,
} from './gatherer-candidates';

function row(oracleName: string, overrides: Partial<GathererFaceRow> = {}): GathererFaceRow {
  return {
    languageCode:     'ja',
    languageName:     'Japanese',
    oracleName,
    instanceName:     '名称',
    instanceTypeLine: '生物',
    instanceText:     '文字',
    flavorText:       '',
    ...overrides,
  };
}

test('gathererLocale maps the commit locales and rejects unusable entries', () => {
  expect(gathererLocale({ languageCode: 'en', languageName: 'English' })).toBeNull();
  expect(gathererLocale({ languageCode: 'zh', languageName: 'Chinese Simplified' })).toBe('zhs');
  expect(gathererLocale({ languageCode: 'zh', languageName: 'Chinese Traditional' })).toBe('zht');
  expect(gathererLocale({ languageCode: 'pt', languageName: 'Portuguese (Brazil)' })).toBe('pt');
  expect(gathererLocale({ languageCode: 'pt', languageName: 'Portuguese Brazilian' })).toBe('pt');
  expect(gathererLocale({ languageCode: 'ja', languageName: 'Japanese' })).toBe('ja');
  expect(gathererLocale({ languageCode: 'xx', languageName: 'Klingon' })).toBeNull();
});

test('normalizeGathererText decodes entities, strips tags, and unfolds line separators', () => {
  expect(normalizeGathererText('見た目以上のもの{R}{W}&lt;i&gt;（代言者）&lt;/i&gt;+|\n先制攻撃')).toBe(
    '見た目以上のもの{R}{W}（代言者）\n先制攻撃',
  );
  expect(normalizeGathererText('first<i>tagged</i>+|+|second')).toBe('firsttagged\nsecond');
  expect(normalizeGathererText('  ')).toBeNull();
  expect(normalizeGathererText(null)).toBeNull();
});

test('buildGathererFaces aligns MDFC rows to their faces by English name', () => {
  const faces = buildGathererFaces([
    row('Arcee, Acrobatic Coupe', { instanceName: '腾空飞驾阿尔茜' }),
    row('Arcee, Sharpshooter', { instanceName: '神准射士阿尔茜', instanceText: '先制攻撃' }),
  ], ['Arcee, Sharpshooter', 'Arcee, Acrobatic Coupe'], 2);
  expect(faces).toEqual([
    { printedName: '神准射士阿尔茜', printedTypeLine: '生物', printedText: '先制攻撃' },
    { printedName: '腾空飞驾阿尔茜', printedTypeLine: '生物', printedText: '文字' },
  ]);
});

test('buildGathererFaces fills unmatched rows into empty slots and drops surplus', () => {
  const faces = buildGathererFaces([
    row('Mystery Face', { instanceName: '无名面' }),
    row('Known', { instanceName: '有名面', flavorText: '风味' }),
    row('Extra', { instanceName: '多余' }),
  ], ['Known', 'Second'], 2);
  expect(faces).toEqual([
    { printedName: '有名面', printedTypeLine: '生物', printedText: '文字', flavorText: '风味' },
    { printedName: '无名面', printedTypeLine: '生物', printedText: '文字' },
  ]);
});

test('buildGathererFaces keeps silent fields out of the slot', () => {
  const faces = buildGathererFaces([
    row('Known', { instanceName: '', instanceTypeLine: '', instanceText: '', flavorText: '' }),
  ], ['Known'], 1);
  expect(faces).toEqual([{}]);
});

test('gathererSurfacesAgree ignores coverage gaps and whitespace but reports wording diffs', () => {
  const mtgch = [{ printedName: '阿尔茜', printedText: '先制攻撃\n转移' }];
  const sameWords = [{ printedName: '阿尔茜', printedTypeLine: '', printedText: '先制攻撃 转移' }];
  const different = [{ printedName: '阿尔茜', printedText: '敏捷\n转移' }];
  expect(gathererSurfacesAgree(mtgch, sameWords)).toBe(true);
  expect(gathererSurfacesAgree(mtgch, different)).toBe(false);
  expect(gathererSurfacesAgree([{ flavorName: '只有社区有的风味名' }], [{}])).toBe(true);
});

test('gathererLocaleMatches splits the shared zh code by script name', () => {
  expect(gathererLocaleMatches('zhs', { languageCode: 'zh', languageName: 'Chinese Simplified' })).toBe(true);
  expect(gathererLocaleMatches('zhs', { languageCode: 'zh', languageName: 'Chinese Traditional' })).toBe(false);
  expect(gathererLocaleMatches('zht', { languageCode: 'zh', languageName: 'Chinese Traditional' })).toBe(true);
  expect(gathererLocaleMatches('zht', { languageCode: 'zh', languageName: 'Chinese Simplified' })).toBe(false);
  expect(gathererLocaleMatches('ja', { languageCode: 'ja', languageName: 'Japanese' })).toBe(true);
  expect(gathererLocaleMatches('ja', { languageCode: 'de', languageName: 'German' })).toBe(false);
});

test('alignedGathererMultiverseIds aligns face rows by English name', () => {
  const ids = alignedGathererMultiverseIds([
    { oracleName: 'Arcee, Acrobatic Coupe', multiverseId: 588127 },
    { oracleName: 'Arcee, Sharpshooter', multiverseId: 588126 },
  ], ['Arcee, Sharpshooter', 'Arcee, Acrobatic Coupe'], 2);
  expect(ids).toEqual([588126, 588127]);
});

test('alignedGathererMultiverseIds needs full coverage and refuses partial arrays', () => {
  expect(alignedGathererMultiverseIds([
    { oracleName: 'Arcee, Sharpshooter', multiverseId: 588126 },
  ], ['Arcee, Sharpshooter', 'Arcee, Acrobatic Coupe'], 2)).toBeNull();
  // a single-faced card needs the one row it has
  expect(alignedGathererMultiverseIds([
    { oracleName: 'Lightning Bolt', multiverseId: 42 },
  ], ['Lightning Bolt'], 1)).toEqual([42]);
});
