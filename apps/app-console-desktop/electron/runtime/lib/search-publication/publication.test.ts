import assert from 'node:assert/strict';
import { test } from 'bun:test';

import { bucketKey, runSearchPublication } from './publication';

import type { SearchPublishRemote } from './remote';
import type { SearchPackageFile } from './manifest';
import type { SearchPublicationManifest } from '@tcg-cards/model/search/publication';

const baseSha = 'a'.repeat(64);
const localeSha = 'b'.repeat(64);

const manifest = {
  manifestVersion: 1,
  game:            'magic',
  dataVersion:     '2026-11-01',
  schemaVersion:   2,
  pgFingerprint:   'c'.repeat(64),
  releaseHash:     'd'.repeat(64),
  generatedAt:     '2026-11-04T00:00:00.000Z',
  packages:        [
    { role: 'base', key: `/search/magic/objects/${baseSha}.sqlite`, sha256: baseSha, bytes: 100 },
    { role: 'locale', locale: 'en', key: `/search/magic/objects/${localeSha}.sqlite`, sha256: localeSha, bytes: 50 },
  ],
  typeSymbols: [],
  tagOwners:   {},
} as unknown as SearchPublicationManifest;

const files: SearchPackageFile[] = [
  { key: `/search/magic/objects/${baseSha}.sqlite`, path: '/tmp/base.sqlite', sha256: baseSha, bytes: 100 },
  { key: `/search/magic/objects/${localeSha}.sqlite`, path: '/tmp/en.sqlite', sha256: localeSha, bytes: 50 },
];

/** Records every remote call so the ordering can be asserted. */
function fakeRemote(options: { verified?: boolean } = {}) {
  const calls: string[] = [];
  const remote: SearchPublishRemote = {
    async requestUploads(input) {
      calls.push(`request:${input.objects.map(object => object.key).join(',')}`);
      return {
        uploads: input.objects.map(object => ({
          key:     bucketKey(object.key),
          url:     `https://upload.test/${object.key}`,
          headers: { 'content-length': String(object.bytes) },
        })),
        existing: [],
      };
    },
    async verify(input) {
      calls.push(`verify:${input.objects.map(object => object.key).join(',')}`);
      return options.verified === false
        ? { ok: false, missing: ['x'], mismatched: [] }
        : { ok: true, missing: [], mismatched: [] };
    },
  };
  return { remote, calls };
}

test('a direct target writes only local files and never calls the service', async () => {
  const calls: string[] = [];
  const result = await runSearchPublication({
    isAccountTarget:    false,
    manifest,
    files,
    remote:             null,
    uploadFile:         async () => { calls.push('upload'); },
    uploadBuffer:       async () => { calls.push('buffer'); },
    writeLocalManifest: async () => { calls.push('local-manifest'); },
    progress:           async () => {},
  });

  assert.deepEqual(calls, ['local-manifest']);
  assert.equal(result.mode, 'local');
});

test('an account target uploads, verifies, then writes manifests in that order', async () => {
  const { remote, calls } = fakeRemote();
  const uploads: string[] = [];
  const result = await runSearchPublication({
    isAccountTarget:    true,
    manifest,
    files,
    remote,
    uploadFile:         async upload => { uploads.push(upload.key); },
    uploadBuffer:       async upload => { uploads.push(upload.key); },
    writeLocalManifest: async () => { calls.push('local-manifest'); },
    progress:           async () => {},
  });

  // Packages are uploaded before verification; both manifests follow it.
  assert.deepEqual(calls, [
    `request:search/magic/objects/${baseSha}.sqlite,search/magic/objects/${localeSha}.sqlite`,
    `verify:search/magic/objects/${baseSha}.sqlite,search/magic/objects/${localeSha}.sqlite`,
    `request:search/magic/releases/${manifest.releaseHash}/manifest.json`,
    'request:search/magic/manifest.json',
    'local-manifest',
  ]);
  assert.deepEqual(uploads, [
    `search/magic/objects/${baseSha}.sqlite`,
    `search/magic/objects/${localeSha}.sqlite`,
    `search/magic/releases/${manifest.releaseHash}/manifest.json`,
    'search/magic/manifest.json',
  ]);
  assert.equal(result.mode, 'remote');
  assert.equal(result.uploadedObjects, 2);
});

test('a failed verification stops the run before any manifest is written', async () => {
  const { remote, calls } = fakeRemote({ verified: false });
  let wroteManifest = false;

  await assert.rejects(runSearchPublication({
    isAccountTarget:    true,
    manifest,
    files,
    remote,
    uploadFile:         async () => {},
    uploadBuffer:       async () => {},
    writeLocalManifest: async () => { wroteManifest = true; },
    progress:           async () => {},
  }), /校验未通过/);

  assert.equal(wroteManifest, false);
  assert.equal(calls.some(call => call.startsWith('request:search/magic/releases')), false);
  assert.equal(calls.at(-1)?.startsWith('verify:'), true);
});
