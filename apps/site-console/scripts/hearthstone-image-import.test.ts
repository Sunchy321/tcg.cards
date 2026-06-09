/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';

import type { ImageRequirementRequest } from '@tcg-cards/model/src/hearthstone/schema/data/image';

import {
  buildCardImagePngFileName,
  buildCardImageR2Key,
  buildCardImageRequestId,
  isIgnoredZipEntry,
  normalizeZipEntryNames,
  parsePngMetadata,
  shouldFailImport,
  validateRequirementRequest,
} from './hearthstone-image-import';

function buildPng(width: number, height: number) {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set([73, 72, 68, 82], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe('hearthstone image import helpers', () => {
  test('parses png dimensions from ihdr', () => {
    expect(parsePngMetadata(buildPng(512, 768))).toEqual({
      width:  512,
      height: 768,
    });
  });

  test('validates request identity fields', () => {
    const variant = {
      zone:     'hand',
      template: 'normal',
      premium:  'golden',
    } as const;
    const renderHash = '9f2c0f6e4e0c7f4d0f0b8c2e9c8d7a1a3c6b4e5f60123456789abcdef01';
    const requestId = buildCardImageRequestId(renderHash, variant);

    const request = {
      requestId,
      card: {
        cardId:           'CORE_EXAMPLE_001',
        lang:             'zhs',
        version:          [31001],
        revisionHash:     'rev-1',
        localizationHash: 'loc-1',
        renderHash,
      },
      variant,
      style: {
        styleKey:              'hand.normal.golden',
        zone:                  'hand',
        template:              'normal',
        premium:               'golden',
        layout:                'card.hand.v1',
        width:                 512,
        height:                768,
        transparentBackground: true,
      },
      output: {
        fileName:              buildCardImagePngFileName(requestId),
        format:                'png',
        width:                 512,
        height:                768,
        transparentBackground: true,
      },
      target: {
        r2Bucket:    'asset',
        r2Key:       buildCardImageR2Key(renderHash, variant),
        contentType: 'image/webp',
      },
      renderModel: {
        cardId:          'CORE_EXAMPLE_001',
        lang:            'zhs',
        variant:         'normal',
        templateVersion: 'v1',
        assetVersion:    'v1',
        localization:    {
          name:     '示例卡牌',
          richText: '造成 3 点伤害。',
        },
        type:              'spell',
        cost:              2,
        attack:            null,
        health:            null,
        durability:        null,
        armor:             null,
        classes:           ['mage'],
        race:              null,
        spellSchool:       'fire',
        mercenaryFaction:  null,
        set:               1637,
        overrideWatermark: null,
        rarity:            'common',
        elite:             false,
        techLevel:         null,
        rune:              null,
        renderMechanics:   {},
      },
    } satisfies ImageRequirementRequest;

    expect(() => validateRequirementRequest(request)).not.toThrow();
  });

  test('builds v1 storage key with updated prefix', () => {
    expect(buildCardImageR2Key('abcdef0123456789', {
      zone:     'hand',
      template: 'normal',
      premium:  'golden',
    })).toBe('hearthstone/card/v1/hand/normal/golden/ab/abcdef0123456789.webp');
  });

  test('does not fail import for missing files only', () => {
    expect(shouldFailImport({
      requirementName: 'requirements.json',
      expectedCount:   4,
      writtenCount:    3,
      skippedCount:    0,
      missingCount:    1,
      rejectedCount:   0,
      dryRun:          false,
    })).toBe(false);

    expect(shouldFailImport({
      requirementName: 'requirements.json',
      expectedCount:   4,
      writtenCount:    3,
      skippedCount:    0,
      missingCount:    0,
      rejectedCount:   1,
      dryRun:          false,
    })).toBe(true);
  });

  test('normalizes zip entries from a single top-level folder', () => {
    expect(normalizeZipEntryNames([
      'results/requirements.json',
      'results/a.png',
      'results/b.png',
    ])).toEqual(new Map([
      ['results/requirements.json', 'requirements.json'],
      ['results/a.png', 'a.png'],
      ['results/b.png', 'b.png'],
    ]));
  });

  test('rejects zip entries mixed across root and folders', () => {
    expect(() => normalizeZipEntryNames([
      'requirements.json',
      'results/a.png',
    ])).toThrow('ZIP input must contain root-level files or files inside one top-level folder');
  });

  test('ignores macOS metadata files inside zip entries', () => {
    expect(isIgnoredZipEntry('.DS_Store')).toBe(true);
    expect(isIgnoredZipEntry('results/.DS_Store')).toBe(true);
    expect(isIgnoredZipEntry('__MACOSX/results/._a.png')).toBe(true);
    expect(isIgnoredZipEntry('results/a.png')).toBe(false);
  });
});
