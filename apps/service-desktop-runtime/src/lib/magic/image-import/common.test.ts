import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { applyPathOverrides, setPathOverride } from '../../../runtime-config';
import { removeSameStemJpg } from './common';

afterEach(() => {
  applyPathOverrides({});
});

/** Points the card image root at a fresh temp dir and returns its `large/{set}/{lang}` folder. */
function freshImageDir(set = 'mid', lang = 'en'): string {
  const root = mkdtempSync(join(tmpdir(), 'card-image-'));
  setPathOverride('magic.image.card', root);
  const dir = join(root, 'large', set, lang);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function write(dir: string, names: string[]) {
  for (const name of names) writeFileSync(join(dir, name), name);
}

/** Asserts the exact set of image files left in the folder, order-independent. */
function expectFiles(dir: string, expected: string[]) {
  expect(readdirSync(dir).sort()).toEqual([...expected].sort());
}

describe('removeSameStemJpg', () => {
  test('sweeps the bare jpg and both legacy face variants, keeping the canonical webp', () => {
    const dir = freshImageDir();
    write(dir, ['100.webp', '100⁑.webp', '100.jpg', '100-0.jpg', '100-1.jpg', '100-0.webp', '100-1.webp']);

    expect(removeSameStemJpg('mid', 'en', '100')).toBe(5);
    expectFiles(dir, ['100.webp', '100⁑.webp']);
  });

  test('sweeps a pair whose extensions do not match', () => {
    const dir = freshImageDir();
    write(dir, ['100-0.jpg', '100-1.webp']);

    expect(removeSameStemJpg('mid', 'en', '100')).toBe(2);
    expectFiles(dir, []);
  });

  test('keeps a lone face variant: it belongs to a print numbered like it', () => {
    const dir = freshImageDir('purl');
    write(dir, ['2025-1.webp', '2025.jpg']);

    expect(removeSameStemJpg('purl', 'en', '2025')).toBe(1);
    expectFiles(dir, ['2025-1.webp']);
  });

  test('returns 0 when no legacy file is on disk', () => {
    const dir = freshImageDir();
    write(dir, ['100.webp', '100⁑.webp']);

    expect(removeSameStemJpg('mid', 'en', '100')).toBe(0);
    expectFiles(dir, ['100.webp', '100⁑.webp']);
  });
});
