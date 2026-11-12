import { expect, test } from 'bun:test';
import { get } from 'lodash-es';

import en from '../../i18n/locales/en';
import zhs from '../../i18n/locales/zhs';
import { explain } from '../../app/search';
import { createSearchExplainI18n } from '../../app/search/explain';
import type { Locale } from '#model/hearthstone/schema/basic';

/** Resolves actual locale messages using the search page's public key routing. */
function translateFrom(locale: object, key: string, args?: object): string {
  const path = key.startsWith('$.')
    ? `hearthstone.search.${key.slice(2)}`
    : key.startsWith('#.') ? `hearthstone.${key.slice(2)}` : `search.${key}`;
  let message = String(get(locale, path, path));
  for (const [name, value] of Object.entries(args ?? {})) {
    message = message.replaceAll(`{${name}}`, String(value));
  }
  return message;
}

/** Builds the page's language-aware explanation translator for one test locale. */
function searchExplainI18n(locale: object, searchLang: Locale) {
  return createSearchExplainI18n(
    (key, args) => translateFrom(locale, key, args),
    () => searchLang,
  );
}

test('explains the new boolean commands and their negation in product language', () => {
  expect(explain.explain('in-tavern:true', (key, args) => translateFrom(zhs, key, args))).toEqual({ type: 'result', text: '在酒馆随从池中' });
  expect(explain.explain('-in-tavern:false', (key, args) => translateFrom(zhs, key, args))).toEqual({ type: 'result', text: '在酒馆随从池中' });
  expect(explain.explain('-elite:true', (key, args) => translateFrom(zhs, key, args))).toEqual({ type: 'result', text: '非精英卡牌' });
});

test('recognizes the cooldown command with its localized field caption', () => {
  const result = explain.explain('cooldown>=2', (key, args) => translateFrom(zhs, key, args));
  expect(result.type).toBe('result');
  expect(result.text).toContain('冷却时间');
  expect(result.text).not.toContain('$.');
});

test('distinguishes localized special raw terms from ordinary and quoted text', () => {
  expect(explain.explain('雏龙', searchExplainI18n(zhs, 'zhs'))).toEqual({
    type: 'result',
    text: '搜索“雏龙”，也会找到带有雏龙标记的卡牌',
  });
  expect(explain.explain('雏龙', searchExplainI18n(en, 'zhs'))).toEqual({
    type: 'result',
    text: 'Search “雏龙”, including Whelp-tagged cards',
  });
  expect(explain.explain('whelp', searchExplainI18n(en, 'en'))).toEqual({
    type: 'result',
    text: 'Search “whelp”, including Whelp-tagged cards',
  });
  expect(explain.explain('whelp', searchExplainI18n(en, 'zhs'))).toEqual({
    type: 'result',
    text: 'Search “whelp”',
  });
  expect(explain.explain('"雏龙"', searchExplainI18n(zhs, 'zhs'))).toEqual({
    type: 'result',
    text: '搜索“雏龙”',
  });
});

test('explains the matched property for every localized special term', () => {
  const terms = [
    ['金卡', '有金色版本的卡牌'],
    ['钻石', '钻石卡牌'],
    ['异画', '异画卡牌'],
    ['雏龙', '带有雏龙标记的卡牌'],
    ['小鬼', '带有小鬼标记的卡牌'],
    ['鲜血', '带有鲜血符文的卡牌'],
    ['冰霜', '带有冰霜符文的卡牌'],
    ['邪恶', '带有邪恶符文的卡牌'],
  ] as const;

  for (const [term, property] of terms) {
    expect(explain.explain(term, searchExplainI18n(zhs, 'zhs')).text).toContain(property);
  }
});
