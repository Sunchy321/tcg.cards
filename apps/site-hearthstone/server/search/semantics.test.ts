import { describe, expect, test } from 'bun:test';

import { PgDialect } from 'drizzle-orm/pg-core';

import Parser from '#search/parser';
import { simplify } from '#search/parser/simplify';
import { translate, translateLegacy } from '#search/server/translate';
import { resolveQueryRequest } from '#search/server/logical';
import { PgSearchAdapter } from '#search/server/adapter';

import { LatestCardEntityView } from '#schema/shared/hearthstone/entity';

import { order } from './command-list';
import * as commands from './command-list';

const dialect = new PgDialect();

/** Compiles one public query into parameterized SQL through the real chain. */
function compile(q: string) {
  const expr = new Parser(q).parse();
  const { query } = translate(simplify(expr), Object.values(commands) as any, LatestCardEntityView);

  return dialect.sqlToQuery(query!);
}

/** Compiles one public query using the preserved historical translator. */
function compileLegacy(q: string) {
  const expr = new Parser(q).parse();
  const { query, post } = translateLegacy(simplify(expr), Object.values(commands) as any, LatestCardEntityView);

  return {
    query: query == null ? undefined : dialect.sqlToQuery(query),
    post:  post.map(action => action.action.map(fragment => dialect.sqlToQuery(fragment as any))),
  };
}

/** Compiles one request through the PostgreSQL adapter and its planner. */
async function compileWithAdapter(q: string) {
  const expr = simplify(new Parser(q).parse());
  const request = resolveQueryRequest(expr, Object.values(commands) as any, {
    sort:     [{ kind: 'action-default' }],
    group:    null,
    page:     1,
    pageSize: 100,
    total:    true,
    ambit:    null,
    lang:     'en',
  });
  const adapter = new PgSearchAdapter<any, undefined, typeof LatestCardEntityView>(
    Object.values(commands) as any,
    LatestCardEntityView,
    async (query, post) => ({
      query: dialect.sqlToQuery(query),
      post:  post.map(action => action.action.map(fragment => dialect.sqlToQuery(fragment as any))),
    }),
  );

  expect(adapter.plan(request)).toEqual({ type: 'exact' });
  return adapter.execute(request, undefined);
}

/** Asserts that one query produces the same parameterized PG output on both paths. */
async function expectLegacyEquivalent(q: string) {
  try {
    const current = await compileWithAdapter(q);
    const legacy = compileLegacy(q);

    if (JSON.stringify(current) !== JSON.stringify(legacy)) {
      throw new Error(`New=${JSON.stringify(current)} Legacy=${JSON.stringify(legacy)}`);
    }
  } catch (error) {
    const message = error instanceof Error ? `${error.message} ${(error as any).type ?? ''}` : String(error);
    throw new Error(`Compatibility query failed: ${q}; ${message}`, { cause: error });
  }
}

/** Compiles one query and asserts that it throws (invalid for its command). */
function compileThrows(q: string) {
  expect(() => compile(q)).toThrow();
}

describe('hearthstone search semantics', () => {
  test('a is an attack alias and no longer resolves to artist', () => {
    expect(compile('a:4').sql).toBe(compile('attack:4').sql);
    expect(compile('a:4').params).toEqual(compile('attack:4').params);
  });

  test('a with a non-numeric value fails as attack instead of searching artist', () => {
    compileThrows('a:"Alex Horley"');
    expect(compile('artist:"Alex Horley"').sql).toContain('ilike');
  });

  test('print rarity existence is not inferred from Hearthstone card rarity', () => {
    compileThrows('r~:c');
    compileThrows('rarity~:common');
  });

  test('bare | in a value means or', () => {
    expect(compile('class:mage|class:warlock').sql).toBe(compile('(class:mage | class:warlock)').sql);
    expect(compile('c:4|5').sql).toBe(compile('(c:4 | c:5)').sql);

    // Text search now matches only the normalized plain-text column.
    const grouped = compile('x:deal|restore');
    const spaced = compile('(x:deal | x:restore)');
    expect(grouped.sql.toLowerCase().match(/ilike/g)).toHaveLength(2);
    expect(spaced.sql.toLowerCase().match(/ilike/g)).toHaveLength(2);
    expect([...grouped.params].sort()).toEqual([...spaced.params].sort());
  });

  test('bare & in a value means and', () => {
    expect(compile('class:mage&class:warlock').sql).toBe(compile('class:mage class:warlock').sql);
  });

  test('quoted strings keep their literal value', () => {
    expect(compile('n:"A|B"').sql.toLowerCase()).not.toContain(' or ');
  });

  test('name order ends in deterministic tail keys', () => {
    const sorter = order.call({ value: 'name+', operator: ':', qualifier: [] }, {
      meta:  {},
      table: LatestCardEntityView as any,
    } as any) as any[];

    const compiled = sorter.map(fragment => dialect.sqlToQuery(fragment).sql);

    expect(compiled.at(-4)).toContain('card_id');
    expect(compiled.at(-3)).toContain('lang');
    expect(compiled.at(-2)).toContain('revision_hash');
    expect(compiled.at(-1)).toContain('localization_hash');
  });

  test('the logical PG path preserves every public command family', async () => {
    const queries = [
      'draw',
      '3/4/5',
      '4/5',
      '#taunt',
      'lang:en',
      'name:"Fireball"',
      'text:deal',
      'flavor-text:flavor',
      'set:standard',
      'class:mage',
      'type:minion',
      'cost:3',
      'attack:4',
      'health:5',
      'durability:2',
      'armor:1',
      'rune:blood',
      'race:dragon',
      'spell-school:arcane',
      'tech-level:3',
      'race-bucket:beast',
      'mercenary-role:caster',
      'faction:human',
      'mercenary-faction:human',
      'rarity:common',
      'artist:/alex/',
      'collectible:true',
      'ambit:primary',
      'change:added',
      'format:standard',
      'name:fire order:name+',
      'name:fire | text:deal',
      '!(name:fire | text:deal)',
    ];

    for (const query of queries) {
      await expectLegacyEquivalent(query);
    }
  });
});
