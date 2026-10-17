import { describe, expect, test } from 'bun:test';
import { buildBoosters, createPrintLookup, updateBoosters, type BoosterRows } from './boosters';

/** One weighted pack with two equally likely cards, using source UUIDs. */
const raw = { booster: { draft: {
  boostersTotalWeight: 1, boosters:            [{ weight: 1, contents: { rare: 1 } }],
  sheets:              { rare: { totalWeight: 2, foil: false, cards: { a: 1, b: 1 } } },
} } };

/** Compact identifiers exported by external source and local print storage. */
const lookup = createPrintLookup([{ uuid: 'a', scryfallId: 's-a' }, { uuid: 'b', scryfallId: 's-b' }], [
  { scryfallId: 's-a', cardId: 'alpha', set: 'neo', number: '1', lang: 'en' },
  { scryfallId: 's-b', cardId: 'beta', set: 'neo', number: '2', lang: 'en' },
]);

describe('booster import', () => {
  test('preserves complete pack contents, printed identities and source probabilities', () => {
    const result = buildBoosters('neo', raw, lookup);
    expect(result).toHaveLength(1);
    expect(result[0]!.sheets!.flatMap(s => s.cards).map(c => [c.cardId, c.set, c.number, c.lang, c.weight])).toEqual([
      ['alpha', 'neo', '1', 'en', 1], ['beta', 'neo', '2', 'en', 1],
    ]);
    expect(result[0]!.packs![0]!.contents[0]).toMatchObject({ type: 'rare', count: 1 });
    expect(result[0]!.sheets![0]).toMatchObject({ totalWeight: 2, isFoil: false });
    expect(buildBoosters('neo', raw, lookup)).toEqual(result);
  });

  test('retains failed and missing series, clears known empty configurations, and continues', async () => {
    const original = buildBoosters('bad', raw, lookup);
    const stored = new Map<string, BoosterRows>([['bad', original], ['missing', original], ['empty', original]]);
    const report = await updateBoosters(['bad', 'good', 'missing', 'empty'], {
      read: async code => code === 'missing'
        ? undefined
        : code === 'empty'
          ? {}
          : code === 'bad'
            ? { booster: { draft: { ...raw.booster.draft, sheets: { rare: { totalWeight: 1, foil: false, cards: { absent: 1 } } } } } }
            : raw,
      replace: async (code, rows) => { stored.set(code, rows); },
    }, lookup);
    expect(report.updated).toBe(2);
    expect(report.failed.map(f => f.setId)).toEqual(['bad']);
    expect(report.missing).toEqual(['missing']);
    expect(stored.get('bad')).toBe(original);
    expect(stored.get('missing')).toBe(original);
    expect(stored.get('empty')).toEqual([]);
    expect(stored.get('good')?.[0]?.sheets.flatMap(s => s.cards)).toHaveLength(2);
  });

  test('rejects broken weights and ambiguous print mappings before creating a replacement', () => {
    expect(() => buildBoosters('neo', { booster: { draft: { ...raw.booster.draft, boostersTotalWeight: 3 } } }, lookup)).toThrow('总权重');
    const ambiguous = createPrintLookup([{ uuid: 'a', scryfallId: 's-a' }], [
      { scryfallId: 's-a', cardId: 'front', set: 'neo', number: '1', lang: 'en' },
      { scryfallId: 's-a', cardId: 'back', set: 'neo', number: '1', lang: 'en' },
    ]);
    expect(() => ambiguous('a')).toThrow('唯一');
  });
});

test('reports storage failures without exposing database names or query details', async () => {
  const report = await updateBoosters(['neo'], {
    read:    async () => raw,
    replace: async () => { throw new Error('failed query: delete from magic.boosters'); },
  }, lookup);
  expect(report.failed).toEqual([{ setId: 'neo', message: '补充包资料暂时无法更新，请稍后重试。' }]);
});
