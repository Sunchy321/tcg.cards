import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { runWithDb } from '@tcg-cards/db/db';

import Parser from '#search/parser';
import { simplify } from '#search/parser/simplify';
import type { CommonServerCommand } from '#search/server/command';
import { resolveQueryRequest } from '#search/server/logical';
import { compileQueryRequest } from '#search/server/translate';
import { LatestCardEntityView } from '#schema/shared/hearthstone/entity';
import { essentialCardSearchItem } from '#model/hearthstone/schema/search';
import { pickSimpleTags } from '#model/hearthstone/search/manifest';

import * as commands from './command-list';
import { hasLanguageCommand } from './context';
import { HearthstonePgEssentialSearchAdapter, setHearthstoneSearchDataset } from './accelerated-adapter';

const adapter = new HearthstonePgEssentialSearchAdapter();
const dialect = new PgDialect();

/** Resolves real public DSL into the same request supplied to the adapter. */
function request(dsl: string, orderBy = 'name+', lang = 'en') {
  return resolveQueryRequest(simplify(new Parser(dsl).parse()), Object.values(commands) as CommonServerCommand[], {
    sort:     [{ kind: 'request', field: 'order', value: orderBy }],
    group:    null,
    page:     1,
    pageSize: 20,
    total:    true,
    ambit:    null,
    lang,
  });
}

/** Activates matching latest metadata without connecting to a database. */
function ready(): void {
  setHearthstoneSearchDataset({
    manifest:    { dataVersion: 'test', buildNumber: 123 },
    dataVersion: 'test',
    buildNumber: 123,
    ready:       true,
  });
}

describe('Hearthstone essential acceleration', () => {
  beforeEach(ready);
  afterEach(() => setHearthstoneSearchDataset(null));

  test('covers selected fields and nested logic with existing command semantics', () => {
    for (const dsl of [
      'fire', '3/4/5', '4/5', 'lang:en', 'l:en', 'n:Fireball', 'text:damage',
      'set:bgs', 'class:mage', 'type:minion', 'cost>=3', 'attack:4', 'health:5',
      'durability:2', 'armor:1', 'rune:blood', 'race:dragon', 'spell-school:fire',
      'tech-level:3', 'race-bucket:beast', 'mercenary-role:caster', 'mercenary-faction:horde',
      'rarity:rare', 'collectible:true', 'elite:false', 'in-tavern:true', 'cooldown>=2',
      'format:standard', 'ambit:primary', '(n:fire OR text:draw) -cost:0',
      'type:minion order:stats-', 'x:/deal.{0,24}damage/',
    ]) {
      expect(adapter.plan(request(dsl))).toEqual({ type: 'exact' });
      expect(() => adapter.compile(request(dsl), { dsl, lang: 'en', page: 1, pageSize: 20, orderBy: 'name+' })).not.toThrow();
    }
  });

  test('routes every unsupported or mixed request wholly to original PG', () => {
    for (const dsl of ['#taunt', 'faction:human', 'n:fire #taunt', 'n:fire OR #taunt', '-(#taunt OR cost:2)', 'artist:alex', 'flavor-text:magic', 'change:major']) {
      expect(adapter.plan(request(dsl)).type).toBe('original');
    }
    expect(adapter.plan(request('type:minion', 'artist+')).type).toBe('original');
    expect(adapter.plan(request('type:minion order:artist+')).type).toBe('original');
  });

  test('does not activate absent, incomplete, or mismatched data', () => {
    setHearthstoneSearchDataset(null);
    expect(adapter.plan(request('cost:3')).type).toBe('original');
    for (const state of [
      { dataVersion: 'other', buildNumber: 123, ready: true },
      { dataVersion: 'test', buildNumber: 124, ready: true },
      { dataVersion: 'test', buildNumber: 123, ready: false },
    ]) {
      setHearthstoneSearchDataset({ manifest: { dataVersion: 'test', buildNumber: 123 }, ...state });
      expect(adapter.plan(request('cost:3')).type).toBe('original');
    }
  });

  test('compiles page, empty-page total, and ambit selection without domain reads', () => {
    const dsl = 'type:minion';
    const query = dialect.sqlToQuery(adapter.compile(request(dsl), { dsl, lang: 'en', page: 9999, pageSize: 20, orderBy: 'name+' }));
    expect(query.sql).toContain('search_cards');
    expect(query.sql).toContain('search_card_localizations');
    expect(query.sql).toContain('count(*)');
    expect(query.sql).toContain('LEFT JOIN page ON TRUE');
    expect(query.sql).not.toMatch(/latest_card_entity_view|entity_localizations|revision_hash|localization_hash|display_text/);
  });

  test('keeps plain text matching separate from the bare name-or-text expansion', () => {
    /** Compiles one public DSL expression against the Hearthstone search projection. */
    const compile = (dsl: string) => dialect.sqlToQuery(adapter.compile(request(dsl), {
      dsl,
      lang:     'en',
      page:     1,
      pageSize: 20,
      orderBy:  'name+',
    }));

    const text = compile('text:"deal 3 damage"');
    expect(text.sql).toContain('"hearthstone"."search_card_localizations"."text"');
    expect(text.sql).not.toContain('display_text');
    expect(text.sql).not.toContain(' || ');
    expect(text.params).toContain('%deal 3 damage%');

    const exact = compile('text="T07%_literal"');
    expect(exact.params).toContain('T07\\%\\_literal');

    const short = compile('text:of');
    expect(adapter.plan(request('text:of'))).toEqual({ type: 'exact' });
    expect(short.params).toContain('%of%');

    const multiline = compile(`text:"alpha\nbeta"`);
    expect(multiline.params).toContain('%alpha\nbeta%');

    const bare = compile('T07BodyToken');
    expect(bare.sql).toContain('"hearthstone"."search_card_localizations"."name"');
    expect(bare.sql).toContain('"hearthstone"."search_card_localizations"."text"');
    expect(bare.sql.toLowerCase()).toContain(' or ');
    expect(bare.sql).not.toContain(' || ');
  });

  test('applies localized exact raw terms through card data on both PostgreSQL paths', () => {
    const dsl = '雏龙';
    const resolved = request(dsl, 'name+', 'zhs');
    expect(adapter.plan(resolved)).toEqual({ type: 'exact' });

    const original = compileQueryRequest(resolved, Object.values(commands) as CommonServerCommand[], LatestCardEntityView);
    const originalQuery = dialect.sqlToQuery(original.query!);
    expect(originalQuery.params).toContain('2355');
    expect(originalQuery.sql).toContain('mechanics');
    expect(originalQuery.sql.toLowerCase()).toContain(' or ');

    const accelerated = dialect.sqlToQuery(adapter.compile(resolved, {
      dsl,
      lang:     'zhs',
      page:     1,
      pageSize: 20,
      orderBy:  'name+',
    }));
    expect(accelerated.params).toContain('2355');
    expect(accelerated.sql).toContain('simple_tags');
    expect(() => request('special:whelp')).toThrow();
  });

  test('detects parsed language aliases without matching literal text', () => {
    expect(hasLanguageCommand('l:en')).toBe(true);
    expect(hasLanguageCommand('lang:en OR lang:zhs')).toBe(true);
    expect(hasLanguageCommand('name:"lang:en"')).toBe(false);
  });

  test('preserves only approved tag keys and their original false or numeric values', () => {
    expect(pickSimpleTags({ 12: false, 1665: 3, 1855: true, 1676: 0, 4503: 1, 999: true }))
      .toEqual({ 12: false, 1665: 3, 1855: true, 1676: 0, 4503: 1 });
    expect(pickSimpleTags({ 999: true })).toEqual({});
  });

  test('keeps outer boolean negation equivalent on the original and accelerated bindings', () => {
    for (const dsl of ['-elite:true', '-elite:false', '-in-tavern:true', '-in-tavern:false']) {
      const resolved = request(dsl);
      expect(adapter.plan(resolved)).toEqual({ type: 'exact' });
      const original = compileQueryRequest(resolved, Object.values(commands) as CommonServerCommand[], LatestCardEntityView);
      const compiled = dialect.sqlToQuery(original.query!);
      expect(compiled.params).toEqual([dsl.includes(':false')]);
      const accelerated = dialect.sqlToQuery(adapter.compile(resolved, { dsl, lang: 'en', page: 1, pageSize: 20, orderBy: 'name+' }));
      expect(accelerated.params).toContain(dsl.includes(':false'));
    }
  });

  test('excludes full detail and historical identity fields from the essential schema', () => {
    const keys = Object.keys(essentialCardSearchItem.shape);
    expect(keys).toContain('renderHash');
    expect(keys).toContain('simpleTags');
    for (const key of ['version', 'revisionHash', 'localizationHash', 'mechanics', 'legacyPayload']) {
      expect(keys).not.toContain(key);
    }
    expect(Object.keys(essentialCardSearchItem.shape.localization.shape)).toEqual(['name', 'text', 'searchTerms']);
  });

  test('falls back when tables disappear, but does not turn valid zero results into fallback', async () => {
    let fallbackCalls = 0;
    const expected = { result: [], total: 0, page: 1, totalPage: 0, elapsed: 0, variant: 'normal' as const, ambit: 'primary' as const };
    const reader = new HearthstonePgEssentialSearchAdapter(async () => {
      fallbackCalls++;
      return expected;
    });
    const options = { dsl: 'cost:3', lang: 'en' as const, page: 1, pageSize: 20, orderBy: 'name+' };
    const missing = {
      execute: async () => { throw new Error('Query failed', { cause: { code: '42P01' } }); },
    } as unknown as Parameters<typeof runWithDb>[0];
    expect(await runWithDb(missing, () => reader.execute(request(options.dsl), options))).toEqual(expected);
    expect(fallbackCalls).toBe(1);
    expect(reader.plan(request(options.dsl)).type).toBe('original');

    ready();
    const empty = {
      execute: async () => [{ result: [], total: 0, ambit: 'full' }],
    } as unknown as Parameters<typeof runWithDb>[0];
    const result = await runWithDb(empty, () => reader.execute(request(options.dsl), options));
    expect(result.total).toBe(0);
    expect(result.ambit).toBe('full');
    expect(fallbackCalls).toBe(1);
  });
});
