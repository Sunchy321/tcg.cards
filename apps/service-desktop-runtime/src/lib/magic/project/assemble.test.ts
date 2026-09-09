import { describe, expect, test } from 'bun:test';

import { isBattleFront } from './assemble';

describe('isBattleFront', () => {
  test('matches battle type lines', () => {
    expect(isBattleFront('Battle — Siege')).toBe(true);
    expect(isBattleFront('Battle — Control Point')).toBe(true);
  });

  test('ignores other card types and missing lines', () => {
    expect(isBattleFront('Creature — Angel')).toBe(false);
    expect(isBattleFront('Legendary Creature — Human Noble')).toBe(false);
    expect(isBattleFront(null)).toBe(false);
    expect(isBattleFront(undefined)).toBe(false);
  });
});
