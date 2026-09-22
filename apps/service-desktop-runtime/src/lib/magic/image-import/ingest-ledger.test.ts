import { describe, expect, test } from 'bun:test';

import type { ImageInfoMeta } from '#model/magic/schema/print';

import { assetImageValues } from './ingest';

const meta: ImageInfoMeta = {
  status:       'lowres',
  type:         'webp',
  source:       'scryfall',
  sha256:       'a'.repeat(64),
  width:        320,
  height:       480,
  byteSize:     1234,
  qualityScore: null,
  verifiedAt:   '2026-09-22T10:00:00.000Z',
};

describe('assetImageValues', () => {
  test('maps every import-product field onto the ledger column', () => {
    expect(assetImageValues('large/mid/en/297.webp', meta)).toEqual({
      key:          'large/mid/en/297.webp',
      format:       'webp',
      source:       'scryfall',
      sha256:       'a'.repeat(64),
      width:        320,
      height:       480,
      byteSize:     1234,
      status:       'lowres',
      qualityScore: null,
      verifiedAt:   new Date('2026-09-22T10:00:00.000Z'),
    });
  });

  test('keeps a scored face scored', () => {
    expect(assetImageValues('k', { ...meta, qualityScore: 0.9 }).qualityScore).toBe(0.9);
  });
});
