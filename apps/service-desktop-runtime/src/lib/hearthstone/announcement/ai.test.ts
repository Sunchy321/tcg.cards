import { describe, expect, test } from 'bun:test';
import type { GlowEntry } from '@tcg-cards/model/src/hearthstone/schema/announcement';

import { extractJsonObject, matchPatches, normalizeAiResult } from './ai';

describe('extractJsonObject', () => {
  test('parses plain JSON', () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  test('parses fenced JSON', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  test('parses JSON with surrounding prose', () => {
    expect(extractJsonObject('Here is the result: {"a":1} done')).toEqual({ a: 1 });
  });

  test('throws when no JSON object', () => {
    expect(() => extractJsonObject('no json here')).toThrow();
  });
});

describe('normalizeAiResult', () => {
  test('fills defaults for missing fields', () => {
    const result = normalizeAiResult({});

    expect(result.header).toEqual({ name: null, date: null, effectiveDate: null, version: null });
    expect(result.items).toEqual([]);
  });

  test('keeps valid header and rejects invalid dates', () => {
    const result = normalizeAiResult({
      header: { name: 'Patch 34.0.3', date: '2026-07-10', effectiveDate: 'soon', version: 224335 },
    });

    expect(result.header).toEqual({
      name: 'Patch 34.0.3', date: '2026-07-10', effectiveDate: null, version: 224335,
    });
  });

  test('normalizes items with defaults', () => {
    const result = normalizeAiResult({ items: [{ cardId: 'CS2_029', group: 'balance_wave' }] });

    expect(result.items[0]).toEqual({
      type:         'card_update', format:       null, status:       null,
      cardId:       'CS2_029', setId:        null, ruleId:       null, delta:        null, glow:         null,
      relatedCards: [], group:        null, score:        null,
    });
  });

  test('keeps known group values', () => {
    const result = normalizeAiResult({ items: [{ group: 'core_rotation' }] });

    expect(result.items[0]!.group).toBe('core_rotation');
  });

  test('preserves per-side deltas and glow markers', () => {
    const delta = { prev: { attack: 5, health: 6 }, curr: { attack: 4, health: 5 } };
    const glow: GlowEntry[] = [
      { part: 'attack', type: 'nerf' },
      { part: 'text', type: 'rework' },
      { part: 'name', type: 'neutral' },
    ];
    const result = normalizeAiResult({ items: [{ delta, glow }] });

    expect(result.items[0]!.delta).toEqual(delta);
    expect(result.items[0]!.glow).toEqual(glow);
  });
});

describe('matchPatches', () => {
  const patches = [
    { buildNumber: 100, name: '33.0.0.100', shortName: '33.0', releaseDate: null },
    { buildNumber: 200, name: '34.0.3.200', shortName: '34.0.3', releaseDate: '2026-07-01' },
    { buildNumber: 300, name: '34.0.3.300', shortName: '34.0.3', releaseDate: '2026-07-08' },
  ];

  test('matches shortName prefix, newest first', () => {
    expect(matchPatches(patches, '34.0.3').map(p => p.buildNumber)).toEqual([300, 200]);
  });

  test('matches name inclusion', () => {
    expect(matchPatches(patches, '0.100').map(p => p.buildNumber)).toEqual([100]);
  });

  test('empty query returns empty', () => {
    expect(matchPatches(patches, '  ')).toEqual([]);
  });
});
