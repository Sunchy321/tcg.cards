import { describe, expect, test } from 'bun:test';

import {
  CardIdentityConflictError,
  resolveCardIdentity,
  shouldSkipCardImport,
  shouldSoftDeleteCard,
} from './cards-import';

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
