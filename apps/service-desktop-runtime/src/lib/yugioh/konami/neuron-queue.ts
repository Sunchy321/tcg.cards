/**
 * Locale and queue policy for the Neuron crawler: which locales exist, in what
 * wave order a run visits them, and in what order cards within one locale are
 * crawled (newly discovered cards first).
 */

/**
 * Supported locales in crawl wave order: core regions first, so an interrupted
 * run leaves the most important regions complete.
 */
export const NEURON_LOCALE_WAVE = ['ja', 'en', 'ae', 'ko', 'fr', 'de', 'it', 'es', 'pt'] as const;

export type NeuronLocale = typeof NEURON_LOCALE_WAVE[number];

/**
 * Resolves a requested locale subset into crawl order. An empty or omitted
 * selection means the full wave; any subset keeps wave order.
 */
export function neuronLocaleSelection(requested?: readonly string[]): NeuronLocale[] {
  if (!requested || requested.length === 0) return [...NEURON_LOCALE_WAVE];
  const wanted = new Set(requested);
  return NEURON_LOCALE_WAVE.filter(locale => wanted.has(locale));
}

/**
 * Per-locale crawl queue: cards absent from the cache (newly added cards)
 * first, then the remaining index order. Both parts keep index order, and the
 * result always covers every cid exactly once.
 */
export function neuronLocaleWorklist(cids: readonly number[], newCids: readonly number[]): number[] {
  if (newCids.length === 0) return [...cids];
  const fresh = new Set(newCids);
  return [...newCids, ...cids.filter(cid => !fresh.has(cid))];
}
