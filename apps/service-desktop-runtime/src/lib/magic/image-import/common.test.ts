import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { applyPathOverrides, setPathOverride } from '../../../runtime-config';
import { removePrintImageFiles, removeSameStemJpg, sha256Hex, writeCanonical, type EncodedImage } from './common';

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

/** Expected RemovedFiles for files whose content is their own name, as `write` lays them down. */
function removed(names: string[]) {
  return { files: names.length, bytes: names.reduce((sum, name) => sum + Buffer.byteLength(name), 0) };
}

describe('removeSameStemJpg', () => {
  test('sweeps the bare jpg and both legacy face variants, keeping the canonical webp', () => {
    const dir = freshImageDir();
    write(dir, ['100.webp', '100⁑.webp', '100.jpg', '100-0.jpg', '100-1.jpg', '100-0.webp', '100-1.webp']);

    expect(removeSameStemJpg('mid', 'en', '100')).toEqual(removed(['100.jpg', '100-0.jpg', '100-1.jpg', '100-0.webp', '100-1.webp']));
    expectFiles(dir, ['100.webp', '100⁑.webp']);
  });

  test('sweeps a pair whose extensions do not match', () => {
    const dir = freshImageDir();
    write(dir, ['100-0.jpg', '100-1.webp']);

    expect(removeSameStemJpg('mid', 'en', '100')).toEqual(removed(['100-0.jpg', '100-1.webp']));
    expectFiles(dir, []);
  });

  test('keeps a lone face variant: it belongs to a print numbered like it', () => {
    const dir = freshImageDir('purl');
    write(dir, ['2025-1.webp', '2025.jpg']);

    expect(removeSameStemJpg('purl', 'en', '2025')).toEqual(removed(['2025.jpg']));
    expectFiles(dir, ['2025-1.webp']);
  });

  test('returns 0 when no legacy file is on disk', () => {
    const dir = freshImageDir();
    write(dir, ['100.webp', '100⁑.webp']);

    expect(removeSameStemJpg('mid', 'en', '100')).toEqual({ files: 0, bytes: 0 });
    expectFiles(dir, ['100.webp', '100⁑.webp']);
  });
});

describe('removePrintImageFiles', () => {
  test('removes both canonical webp faces plus the legacy jpg and reports their bytes', () => {
    const dir = freshImageDir();
    write(dir, ['100.webp', '100⁑.webp', '100.jpg']);

    expect(removePrintImageFiles('mid', 'en', '100')).toEqual(removed(['100.webp', '100⁑.webp', '100.jpg']));
    expectFiles(dir, []);
  });
});

describe('writeCanonical', () => {
  /** A minimal EncodedImage standing in for a real webp encode. */
  const encoded = (content: string): EncodedImage => {
    const data = Buffer.from(content);
    return { data, sha256: sha256Hex(data), width: 1, height: 1, byteSize: data.length };
  };

  test('an insert reports no previous size, a replace reports the displaced file size', () => {
    freshImageDir();

    const insert = writeCanonical('mid', 'en', '100', undefined, encoded('aaaa'));
    expect(insert).toEqual({ ok: true, value: { result: 'written', previousBytes: null } });

    const unchanged = writeCanonical('mid', 'en', '100', undefined, encoded('aaaa'));
    expect(unchanged).toEqual({ ok: true, value: { result: 'unchanged', previousBytes: 4 } });

    const replace = writeCanonical('mid', 'en', '100', undefined, encoded('bbbbbb'));
    expect(replace).toEqual({ ok: true, value: { result: 'written', previousBytes: 4 } });
  });
});
