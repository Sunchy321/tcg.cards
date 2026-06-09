/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';

import { normalizeZipEntryNames } from './hearthstone-image-import-zip';

describe('browser hearthstone image import helpers', () => {
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

  test('keeps root-level zip entries unchanged', () => {
    expect(normalizeZipEntryNames([
      'requirements.json',
      'a.png',
    ])).toEqual(new Map([
      ['requirements.json', 'requirements.json'],
      ['a.png', 'a.png'],
    ]));
  });

  test('rejects nested folders inside the top-level folder', () => {
    expect(() => normalizeZipEntryNames([
      'results/requirements.json',
      'results/images/a.png',
    ])).toThrow('ZIP input only supports files directly inside the top-level folder');
  });
});
