import { expect, test } from 'bun:test';
import { loadingSegments } from './hsdata-publish-progress';

test('keeps search rows visible and uses the same totals throughout a scan', () => {
  const totals = { cards: 10, search_cards: 10, search_card_localizations: 20 };
  const partial = loadingSegments(totals, { cards: 10, search_cards: 4 });
  expect(partial).toEqual([
    { name: 'cards', done: 10, total: 10 },
    { name: '搜索卡片', done: 4, total: 10 },
    { name: '搜索文本', done: 0, total: 20 },
  ]);
  const completed = loadingSegments(totals, totals);
  expect(completed.reduce((sum, segment) => sum + segment.total, 0)).toBe(40);
  expect(completed.reduce((sum, segment) => sum + segment.done, 0)).toBe(40);
  expect(loadingSegments({}, {})).toEqual([]);
});
