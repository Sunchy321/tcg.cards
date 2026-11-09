import { describe, expect, test } from 'bun:test';

import { printImageKey } from '@tcg-cards/shared/magic/print-image';

import { AssetImage } from '@tcg-cards/db/schema/local/magic';

import { carryOverPrintImages, fillPrintImagesFromLedger, type PrintImageCarry, type PrintImageCarryDraft, type PrintImageDraft } from './fill-print-images';

import type { ImageInfo } from '#model/magic/schema/print';

type LedgerEntry = typeof AssetImage.$inferSelect;

function entry(key: string, over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    key,
    format:       'webp',
    source:       'manual',
    sha256:       'a'.repeat(64),
    width:        800,
    height:       1200,
    byteSize:     2048,
    status:       'highres_scan',
    qualityScore: 0.9,
    verifiedAt:   new Date('2026-09-22T00:00:00.000Z'),
    createdAt:    new Date('2026-09-22T00:00:00.000Z'),
    updatedAt:    new Date('2026-09-22T00:00:00.000Z'),
    ...over,
  };
}

function draft(over: Partial<PrintImageDraft> = {}): PrintImageDraft {
  return {
    layout:      'normal',
    set:         'mid',
    lang:        'en',
    number:      '297',
    imageStatus: 'lowres',
    imageInfo:   null,
    ...over,
  };
}

function face(over: Partial<NonNullable<ImageInfo[number]>> = {}): NonNullable<ImageInfo[number]> {
  return {
    status:       'highres_scan',
    type:         'webp',
    source:       'mtgflame',
    sha256:       'b'.repeat(64),
    width:        780,
    height:       1082,
    byteSize:     4096,
    qualityScore: 0.88,
    verifiedAt:   '2026-09-20T00:00:00.000Z',
    ...over,
  };
}

function carryDraft(over: Partial<PrintImageCarryDraft> = {}): PrintImageCarryDraft {
  return {
    cardId:      'card-1',
    version:     '',
    set:         'mid',
    lang:        'en',
    number:      '297',
    source:      '',
    imageStatus: 'lowres',
    imageInfo:   null,
    ...over,
  };
}

function carriesOf(entries: Array<[PrintImageCarryDraft, ImageInfo]>): Map<string, PrintImageCarry> {
  return new Map(entries.map(([row, info]) => [
    `${row.cardId}\u0000${row.version ?? ''}\u0000${row.set}\u0000${row.number}\u0000${row.lang}\u0000${row.source ?? ''}`,
    { imageStatus: row.imageStatus ?? null, imageInfo: info },
  ]));
}

function ledgerOf(entries: LedgerEntry[]): Map<string, LedgerEntry> {
  return new Map(entries.map(e => [e.key, e]));
}

describe('carryOverPrintImages', () => {
  test('a stored image fact carries both columns over the source-side draft', () => {
    const rows = [carryDraft()];
    carryOverPrintImages(carriesOf([[carryDraft(), [face()]]]), rows);
    expect(rows[0]!.imageStatus).toBe('highres_scan');
    expect(rows[0]!.imageInfo).toEqual([face()]);
  });

  test('a stale placeholder column heals: the carried status derives from the faces', () => {
    const rows = [carryDraft({ imageStatus: 'placeholder' })];
    carryOverPrintImages(carriesOf([[carryDraft({ imageStatus: 'placeholder' }), [face()]]]), rows);
    expect(rows[0]!.imageStatus).toBe('highres_scan');
  });

  test('a back-face-only fact derives the status from the first non-null face', () => {
    const rows = [carryDraft()];
    carryOverPrintImages(carriesOf([[carryDraft(), [null, face({ status: 'lowres' })]]]), rows);
    expect(rows[0]!.imageStatus).toBe('lowres');
    expect(rows[0]!.imageInfo).toEqual([null, face({ status: 'lowres' })]);
  });

  test('drafts without a stored fact keep the source-side draft standing', () => {
    const rows = [carryDraft()];
    carryOverPrintImages(carriesOf([]), rows);
    expect(rows[0]!.imageStatus).toBe('lowres');
    expect(rows[0]!.imageInfo).toBeNull();
  });

  test('the ledger fill outranks the carry-over when a ledger row exists', () => {
    const rows = [{ ...carryDraft(), layout: 'normal' }];
    carryOverPrintImages(carriesOf([[carryDraft({ set: 'mid', number: '297' }), [face({ source: 'gatherer' })]]]), rows);
    fillPrintImagesFromLedger(ledgerOf([entry(printImageKey('mid', 'en', '297'), { source: 'manual' })]), rows);
    expect(rows[0]!.imageStatus).toBe('highres_scan');
    expect(rows[0]!.imageInfo).toHaveLength(1);
    expect(rows[0]!.imageInfo![0]!.source).toBe('manual');
  });
});

describe('fillPrintImagesFromLedger', () => {
  test('a real face row fills status and metadata over the source-side draft', () => {
    const rows = [draft()];
    fillPrintImagesFromLedger(ledgerOf([entry(printImageKey('mid', 'en', '297'))]), rows);
    expect(rows[0]!.imageStatus).toBe('highres_scan');
    const info = (rows[0]!.imageInfo as NonNullable<PrintImageDraft['imageInfo']>)!;
    expect(info).toHaveLength(1);
    expect(info[0]).toMatchObject({ source: 'manual', type: 'webp', byteSize: 2048, verifiedAt: '2026-09-22T00:00:00.000Z' });
  });

  test('a tombstone pins the placeholder state with no metadata', () => {
    const rows = [draft()];
    fillPrintImagesFromLedger(ledgerOf([entry(printImageKey('mid', 'en', '297'), { status: 'placeholder', byteSize: 0, qualityScore: null })]), rows);
    expect(rows[0]!.imageStatus).toBe('placeholder');
    expect(rows[0]!.imageInfo).toBeNull();
  });

  test('absent keys leave the source-side draft standing', () => {
    const rows = [draft()];
    fillPrintImagesFromLedger(ledgerOf([]), rows);
    expect(rows[0]!.imageStatus).toBe('lowres');
    expect(rows[0]!.imageInfo).toBeNull();
  });

  test('two-image layouts fill both faces and read the status off the front', () => {
    const rows = [draft({ layout: 'transform', number: '10' })];
    fillPrintImagesFromLedger(ledgerOf([
      entry(printImageKey('mid', 'en', '10')),
      entry(printImageKey('mid', 'en', '10', 1), { sha256: 'b'.repeat(64), status: 'lowres', qualityScore: null }),
    ]), rows);
    const info = (rows[0]!.imageInfo as NonNullable<PrintImageDraft['imageInfo']>)!;
    expect(info).toHaveLength(2);
    expect(info[0]!.status).toBe('highres_scan');
    expect(info[1]!.status).toBe('lowres');
    expect(rows[0]!.imageStatus).toBe('highres_scan');
  });

  test('a missing front face with a real back face keeps the back metadata', () => {
    const rows = [draft({ layout: 'transform', number: '10' })];
    fillPrintImagesFromLedger(ledgerOf([entry(printImageKey('mid', 'en', '10', 1), { status: 'lowres', qualityScore: null })]), rows);
    const info = (rows[0]!.imageInfo as NonNullable<PrintImageDraft['imageInfo']>)!;
    expect(info[0]).toBeNull();
    expect(info[1]!.status).toBe('lowres');
    expect(rows[0]!.imageStatus).toBe('lowres');
  });
});
