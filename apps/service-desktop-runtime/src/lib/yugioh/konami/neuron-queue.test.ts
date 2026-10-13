import { describe, expect, test } from 'bun:test';

import { NEURON_LOCALE_WAVE, neuronLocaleSelection, neuronLocaleWorklist } from './neuron-queue';

describe('neuronLocaleSelection', () => {
  test('omitted or empty selection means the full wave in wave order', () => {
    expect(neuronLocaleSelection()).toEqual([...NEURON_LOCALE_WAVE]);
    expect(neuronLocaleSelection([])).toEqual([...NEURON_LOCALE_WAVE]);
  });

  test('a subset keeps wave order regardless of the requested order', () => {
    expect(neuronLocaleSelection(['pt', 'ja', 'de'])).toEqual(['ja', 'de', 'pt']);
  });

  test('unknown locales are dropped', () => {
    expect(neuronLocaleSelection(['ja', 'xx'])).toEqual(['ja']);
  });

  test('the wave puts core regions first and covers all nine locales', () => {
    expect(NEURON_LOCALE_WAVE).toEqual(['ja', 'en', 'ae', 'ko', 'fr', 'de', 'it', 'es', 'pt']);
  });
});

describe('neuronLocaleWorklist', () => {
  test('puts new cids first, keeping index order within both parts', () => {
    expect(neuronLocaleWorklist([1, 2, 3, 4, 5], [4, 2])).toEqual([4, 2, 1, 3, 5]);
  });

  test('covers every cid exactly once', () => {
    const cids = [10, 20, 30, 40];
    const worklist = neuronLocaleWorklist(cids, [30]);
    expect([...worklist].sort((a, b) => a - b)).toEqual(cids);
    expect(worklist.length).toBe(cids.length);
  });

  test('without new cids the index order is kept as-is', () => {
    expect(neuronLocaleWorklist([5, 4, 3], [])).toEqual([5, 4, 3]);
  });
});
