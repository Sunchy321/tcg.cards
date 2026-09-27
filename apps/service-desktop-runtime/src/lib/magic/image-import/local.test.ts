import { test, expect } from 'bun:test';
import { findLocalAssetFile, localAssetCandidates } from './local';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

test('orders face-0 candidates: legacy -0 forms first, then unmarked non-webp', () => {
  expect(localAssetCandidates('9', 0)).toEqual([
    '9-0.webp', '9-0.jpg', '9-0.jpeg', '9.jpg', '9.jpeg',
  ]);
});

test('orders face-1 candidates: legacy -1 forms only (⁑ is the output name)', () => {
  expect(localAssetCandidates('9', 1)).toEqual(['9-1.webp', '9-1.jpg', '9-1.jpeg']);
});

test('escapes slashes in the collector number', () => {
  expect(localAssetCandidates('123/19', 0)[0]).toBe('123_19-0.webp');
  expect(localAssetCandidates('123/19', 1)[0]).toBe('123_19-1.webp');
});

test('findLocalAssetFile picks the best existing candidate', () => {
  const dir = import.meta.dir + '/.tmp-local-asset';
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(`${dir}/9-0.jpg`, 'x');
    writeFileSync(`${dir}/9-1.jpeg`, 'x');
    // face 0: the legacy -0 jpg is the best match
    expect(findLocalAssetFile(dir, '9', 0)?.fileName).toBe('9-0.jpg');
    // face 1: the legacy -1 jpeg is the best match
    expect(findLocalAssetFile(dir, '9', 1)?.fileName).toBe('9-1.jpeg');
    // a face with no candidates on disk resolves to nothing
    expect(findLocalAssetFile(dir, '9', 2)).toBeNull();
    expect(findLocalAssetFile(dir, '10', 0)).toBeNull();
    // a newly dropped -0 webp outranks the already-consumed -0 jpg
    writeFileSync(`${dir}/9-0.webp`, 'x');
    expect(findLocalAssetFile(dir, '9', 0)?.fileName).toBe('9-0.webp');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
