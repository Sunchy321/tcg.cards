import { test, expect } from 'bun:test';
import {
  commitFaceSummary,
  normalizeCommitFaces,
  normalizeCommitMetadata,
  validateCommitSave,
  type CommitSaveInput,
} from './commits';

const valid: CommitSaveInput = {
  oracleId: 'o1',
  set:      'msc',
  number:   '806',
  lang:     'zhs',
  faces:    [],
  metadata: null,
  note:     null,
};

test('validateCommitSave passes a well-formed commit with an existing position', () => {
  expect(validateCommitSave(valid, { cardExists: true, positionExists: true })).toBeNull();
});

test('validateCommitSave rejects missing card or position in product language', () => {
  expect(validateCommitSave(valid, { cardExists: false, positionExists: false })).toContain('未找到该卡牌');
  expect(validateCommitSave(valid, { cardExists: true, positionExists: false })).toContain('英文印刷');
});

test('validateCommitSave demands the anchor fields before anything else', () => {
  expect(validateCommitSave({ ...valid, oracleId: ' ' }, { cardExists: false, positionExists: false })).toContain('选择一张卡牌');
  expect(validateCommitSave({ ...valid, set: '', number: '806' }, { cardExists: true, positionExists: true })).toContain('系列代码');
  expect(validateCommitSave({ ...valid, lang: '' }, { cardExists: true, positionExists: true })).toContain('语言');
});

test('normalizeCommitFaces trims strings, keeps interior slots, drops trailing empties', () => {
  const faces = normalizeCommitFaces([
    { printedName: ' 闪电击 ', artist: ' ' },
    {},
    { printedText: '……' },
    {},
  ]);
  expect(faces).toEqual([
    { printedName: '闪电击' },
    {},
    { printedText: '……' },
  ]);
});

test('normalizeCommitMetadata keeps only whitelisted non-empty values', () => {
  expect(normalizeCommitMetadata({ rarity: ' rare ', releaseDate: ' ', isPromo: true })).toEqual({ rarity: 'rare', isPromo: true });
  expect(normalizeCommitMetadata({ finishes: [' nonfoil ', ''] })).toEqual({ finishes: ['nonfoil'] });
  expect(normalizeCommitMetadata({ rarity: ' ' })).toBeNull();
  expect(normalizeCommitMetadata(null)).toBeNull();
});

test('commitFaceSummary surfaces the first asserted printed name', () => {
  expect(commitFaceSummary([{}, { printedName: '乙太' }])).toBe('乙太');
  expect(commitFaceSummary([{ printedText: 'x' }])).toBe('');
  expect(commitFaceSummary(null)).toBe('');
});
