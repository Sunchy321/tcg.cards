import { describe, expect, test } from 'bun:test';

import {
  CardIdentityConflictError,
  projectCardLocalizations,
  projectCardNameVariants,
  resolveCardIdentity,
  shouldSkipCardImport,
  shouldSoftDeleteCard,
} from './cards-import';

import type { NormalizedCard } from './cards-source';

/** Normalized source fixture containing distinct Chinese names for projection tests. */
function makeSourceCard(overrides: Partial<NormalizedCard> = {}): NormalizedCard {
  return {
    sourceRecordId: '4007',
    sourceHash: 'source-hash',
    cid: 4007,
    password: '89631139',
    cnName: '青眼白龙',
    scName: '青眼白龍',
    mdName: '青眼白龙 MD',
    nwbbsName: '青眼白龙 NWBBS',
    cnocgName: '蓝眼白龙',
    jpRuby: 'ブルーアイズ・ホワイト・ドラゴン',
    jpName: '青眼の白龍',
    enName: 'Blue-Eyes White Dragon',
    mdEnName: null,
    wikiEnName: null,
    setExt: null,
    typesText: '[怪兽|通常]',
    pendulumDescription: null,
    description: '传说之龙。',
    ot: 11,
    setcode: '221',
    type: 17,
    attack: 3000,
    defense: 2500,
    level: 8,
    race: 8192,
    attribute: 16,
    ...overrides,
  };
}

describe('resolveCardIdentity', () => {
  test('keeps the mapped card when external identifiers agree', () => {
    expect(resolveCardIdentity({
      mappedCardId: 10,
      cidCardId: 10,
      passwordCardId: 10,
    })).toEqual({ kind: 'existing', cardId: 10 });
  });

  test('rejects an identifier that points away from the mapped card', () => {
    expect(() => resolveCardIdentity({
      mappedCardId: 10,
      cidCardId: 11,
      passwordCardId: null,
    })).toThrow(CardIdentityConflictError);
  });

  test('reuses one card when cid and password resolve to the same row', () => {
    expect(resolveCardIdentity({
      mappedCardId: null,
      cidCardId: 42,
      passwordCardId: 42,
    })).toEqual({ kind: 'existing', cardId: 42 });
  });

  test('reuses the only identifier candidate', () => {
    expect(resolveCardIdentity({
      mappedCardId: null,
      cidCardId: null,
      passwordCardId: 42,
    })).toEqual({ kind: 'existing', cardId: 42 });
  });

  test('rejects cid and password candidates that resolve to different cards', () => {
    expect(() => resolveCardIdentity({
      mappedCardId: null,
      cidCardId: 41,
      passwordCardId: 42,
    })).toThrow('cid and password resolve to different cards');
  });

  test('creates a new internal card when no stable identifier matches', () => {
    expect(resolveCardIdentity({
      mappedCardId: null,
      cidCardId: null,
      passwordCardId: null,
    })).toEqual({ kind: 'new' });
  });
});

describe('idempotent import decisions', () => {
  test('skips only identical active mappings for active cards', () => {
    expect(shouldSkipCardImport({
      sourceHash: 'same',
      previousSourceHash: 'same',
      mappingRetired: false,
      cardDeleted: false,
    })).toBe(true);
    expect(shouldSkipCardImport({
      sourceHash: 'same',
      previousSourceHash: 'same',
      mappingRetired: true,
      cardDeleted: true,
    })).toBe(false);
  });

  test('soft-deletes only after the last active source retires', () => {
    expect(shouldSoftDeleteCard(0)).toBe(true);
    expect(shouldSoftDeleteCard(1)).toBe(false);
  });
});

describe('card name projections', () => {
  test('uses the YGOPro name as the Chinese primary localization', () => {
    expect(projectCardLocalizations(makeSourceCard(), 42)).toEqual([
      expect.objectContaining({ cardId: 42, locale: 'zhs', name: '青眼白龙', description: '传说之龙。' }),
      expect.objectContaining({ cardId: 42, locale: 'ja', name: '青眼の白龍', nameRuby: 'ブルーアイズ・ホワイト・ドラゴン' }),
      expect.objectContaining({ cardId: 42, locale: 'en', name: 'Blue-Eyes White Dragon' }),
    ]);
  });

  test('retains each distinct official and community Chinese name as searchable data', () => {
    expect(projectCardNameVariants(makeSourceCard(), 42)).toEqual([
      { cardId: 42, locale: 'zhs', kind: 'official', name: '青眼白龍' },
      { cardId: 42, locale: 'zhs', kind: 'master_duel', name: '青眼白龙 MD' },
      { cardId: 42, locale: 'zhs', kind: 'nwbbs', name: '青眼白龙 NWBBS' },
      { cardId: 42, locale: 'zhs', kind: 'cnocg', name: '蓝眼白龙' },
    ]);
  });

  test('does not store a duplicate variant when it equals the primary Chinese name', () => {
    expect(projectCardNameVariants(makeSourceCard({ mdName: '青眼白龙' }), 42))
      .not.toContainEqual({ cardId: 42, locale: 'zhs', kind: 'master_duel', name: '青眼白龙' });
  });
});
