import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { hashManifest } from './publish-manifest.ts';

// Electron uses V8; Bun's string limit does not reproduce this failure.
test('hashes a manifest larger than the V8 string limit', { skip: Boolean(process.versions.bun) }, () => {
  const row = { tableName: 'entity_localizations', rowKey: 'x'.repeat(256), rowHash: 'a'.repeat(64) };
  const rows = Array(Math.ceil(540000000 / (JSON.stringify(row).length + 1))).fill(row);
  assert.throws(() => JSON.stringify(rows), { name: 'RangeError', message: 'Invalid string length' });
  assert.match(hashManifest(rows), /^[a-f0-9]{64}$/);
});
