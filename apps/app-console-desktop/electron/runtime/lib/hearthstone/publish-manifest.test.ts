import { createHash } from 'node:crypto';
import { describe, expect, test } from 'bun:test';
import { hashManifest } from './publish-manifest';

/** Computes the legacy manifest identity for compatibility assertions. */
function legacyHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

describe('publication manifest identity', () => {
  test('retains existing identities for empty, escaped and multilingual rows', () => {
    const rows = [
      { tableName: 'cards', rowKey: JSON.stringify({ cardId: '炉石😀' + String.fromCharCode(92, 34) }), rowHash: 'a' },
      { tableName: 'search_cards', rowKey: '{"cardId":"A"}', rowHash: null },
    ];
    expect(hashManifest([])).toBe(legacyHash([]));
    expect(hashManifest(rows)).toBe(legacyHash(rows));
    expect(hashManifest([...rows].reverse())).not.toBe(hashManifest(rows));
  });
});
