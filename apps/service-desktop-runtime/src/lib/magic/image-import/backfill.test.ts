import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { printImageKey } from '@tcg-cards/shared/magic/print-image';
import type { ImageInfo, ImageInfoMeta } from '#model/magic/schema/print';

import { applyPathOverrides, setPathOverride } from '../../../runtime-config';
import { checkFaceFile, ledgerRowsForPrint } from './backfill';
import { cardImageRoot } from './common';

const meta: ImageInfoMeta = {
  status:       'highres_scan',
  type:         'webp',
  source:       'manual',
  sha256:       'b'.repeat(64),
  width:        800,
  height:       1200,
  byteSize:     2048,
  qualityScore: 0.9,
  verifiedAt:   '2026-01-01T00:00:00.000Z',
};

/** Drops a file at `key` under `root`, creating the layout directories. */
function placeFile(root: string, key: string, size: number): void {
  const file = join(root, key);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.alloc(size));
}

describe('checkFaceFile', () => {
  const root = mkdtempSync(join(tmpdir(), 'tcg-magic-backfill-check-'));
  const key = printImageKey('mid', 'en', '297');
  placeFile(root, key, 2048);

  test('a file at the recorded size verifies', () => {
    expect(checkFaceFile(root, key, 2048)).toBe('ok');
  });

  test('a resized file mismatches', () => {
    expect(checkFaceFile(root, key, 4096)).toBe('mismatch');
  });

  test('an absent file is missing', () => {
    expect(checkFaceFile(root, printImageKey('mid', 'en', '298'), 2048)).toBe('missing');
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });
});

describe('ledgerRowsForPrint', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'tcg-magic-backfill-rows-'));
    setPathOverride('magic.image.card', root);
    // One print whose faces all verify ('297'), one with no file at all
    // ('298'), and one whose recorded size no longer matches ('299').
    placeFile(root, printImageKey('mid', 'en', '297'), meta.byteSize);
    placeFile(root, printImageKey('mid', 'en', '299'), 11);
  });

  afterAll(() => {
    applyPathOverrides({});
    rmSync(root, { recursive: true, force: true });
  });

  test('a verifying face converts with the backfill verification time', () => {
    const verifiedAt = new Date('2026-09-22T12:00:00.000Z');
    const prep = ledgerRowsForPrint(cardImageRoot(), { set: 'mid', lang: 'en', number: '297' }, [
      { ...meta },
    ], verifiedAt);
    expect(prep.faces).toBe(1);
    expect(prep.rows).toHaveLength(1);
    expect(prep.rows[0]).toEqual({
      key:          printImageKey('mid', 'en', '297'),
      format:       'webp',
      source:       'manual',
      sha256:       'b'.repeat(64),
      width:        800,
      height:       1200,
      byteSize:     2048,
      status:       'highres_scan',
      qualityScore: 0.9,
      verifiedAt,
    });
  });

  test('a print with no file on disk is reported, not converted', () => {
    const prep = ledgerRowsForPrint(cardImageRoot(), { set: 'mid', lang: 'en', number: '298' }, [
      { ...meta },
    ], new Date());
    expect(prep.faces).toBe(1);
    expect(prep.missing).toBe(1);
    expect(prep.missingKeys).toEqual([printImageKey('mid', 'en', '298')]);
    expect(prep.rows).toHaveLength(0);
  });

  test('a resized face mismatches and a null slot is skipped', () => {
    const imageInfo: ImageInfo = [
      { ...meta, byteSize: 4096 },
      null,
    ];
    const prep = ledgerRowsForPrint(cardImageRoot(), { set: 'mid', lang: 'en', number: '299' }, imageInfo, new Date());
    expect(prep.faces).toBe(1);
    expect(prep.mismatched).toBe(1);
    expect(prep.mismatchKeys).toEqual([printImageKey('mid', 'en', '299')]);
    expect(prep.rows).toHaveLength(0);
  });
});
