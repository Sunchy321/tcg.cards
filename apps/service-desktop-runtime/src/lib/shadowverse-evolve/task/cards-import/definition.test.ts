import { describe, expect, test } from 'bun:test';

import { advanceCursor } from './definition';

const fullTotals = { ja: 127, en: 4648, zh: 6661 };

function at(phase: 'ja' | 'en' | 'zh', index: number) {
  return { phase, index, addedCount: 0, updatedCount: 0, skippedCount: 0, failedCount: 0 };
}

describe('advanceCursor', () => {
  test('stays in phase while the chunk stays inside the phase total', () => {
    const result = advanceCursor(at('ja', 0), 20, fullTotals);
    expect(result.finished).toBe(false);
    expect(result.cursor.phase).toBe('ja');
    expect(result.cursor.index).toBe(20);
  });

  test('advances from ja to en when the ja cards are exhausted', () => {
    const result = advanceCursor(at('ja', 120), 20, fullTotals);
    expect(result.finished).toBe(false);
    expect(result.cursor.phase).toBe('en');
    expect(result.cursor.index).toBe(0);
  });

  test('advances from en to zh when the en cards are exhausted', () => {
    const result = advanceCursor(at('en', 4640), 20, fullTotals);
    expect(result.finished).toBe(false);
    expect(result.cursor.phase).toBe('zh');
    expect(result.cursor.index).toBe(0);
  });

  test('marks finished when the zh rows are consumed', () => {
    const result = advanceCursor(at('zh', 6641), 20, fullTotals);
    expect(result.finished).toBe(true);
    expect(result.cursor.phase).toBe('zh');
    expect(result.cursor.index).toBe(6661);
  });

  test('skips phases with no work', () => {
    const noEn = advanceCursor(at('ja', 120), 20, { ja: 127, en: 0, zh: 50 });
    expect(noEn.finished).toBe(false);
    expect(noEn.cursor.phase).toBe('zh');
    expect(noEn.cursor.index).toBe(0);

    const noEnNoZh = advanceCursor(at('ja', 120), 20, { ja: 127, en: 0, zh: 0 });
    expect(noEnNoZh.finished).toBe(true);
    expect(noEnNoZh.cursor.phase).toBe('zh');
  });

  test('handles the zh phase advancing by its actual remaining count', () => {
    const result = advanceCursor(at('zh', 6631), 30, fullTotals);
    expect(result.finished).toBe(true);
    expect(result.cursor.index).toBe(6661);
  });
});
