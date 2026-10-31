import { expect, test } from 'bun:test';
import { get } from 'lodash-es';

import zhs from '../../i18n/locales/zhs';
import { explain } from '../../app/search';

/** Resolves actual locale messages using the search page's public key routing. */
function translate(key: string): string {
  const path = key.startsWith('$.')
    ? `hearthstone.search.${key.slice(2)}`
    : key.startsWith('#.') ? `hearthstone.${key.slice(2)}` : `search.${key}`;
  return String(get(zhs, path, path));
}

test('explains the new boolean commands and their negation in product language', () => {
  expect(explain.explain('in-tavern:true', translate)).toEqual({ type: 'result', text: '在酒馆随从池中' });
  expect(explain.explain('-in-tavern:false', translate)).toEqual({ type: 'result', text: '在酒馆随从池中' });
  expect(explain.explain('-elite:true', translate)).toEqual({ type: 'result', text: '非精英卡牌' });
});

test('recognizes the cooldown command with its localized field caption', () => {
  const result = explain.explain('cooldown>=2', translate);
  expect(result.type).toBe('result');
  expect(result.text).toContain('冷却时间');
  expect(result.text).not.toContain('$.');
});
