import { describe, expect, test } from 'bun:test';

import { PgDialect } from 'drizzle-orm/pg-core';

import Parser from '#search/parser';
import type { Expression } from '#search/parser';
import { simplify } from '#search/parser/simplify';
import { translate, translateLegacy } from '#search/server/translate';
import { resolveQueryRequest } from '#search/server/logical';
import { PgSearchAdapter } from '#search/server/adapter';

import { CardPrintView } from '#schema/shared/magic/print';

import { order } from './command-list';
import * as commands from './command-list';

const dialect = new PgDialect();

/** Compiles one public query into parameterized SQL through the real chain. */
function compile(q: string) {
  const expr = new Parser(q).parse();
  const { query } = translate(simplify(expr), Object.values(commands) as any, CardPrintView);

  return dialect.sqlToQuery(query!);
}

/** Compiles one public query using the preserved historical translator. */
function compileLegacy(q: string) {
  const expr = new Parser(q).parse();
  const { query, post } = translateLegacy(simplify(expr), Object.values(commands) as any, CardPrintView);

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
    group:    'card',
    page:     1,
    pageSize: 100,
    total:    true,
    ambit:    null,
    lang:     'en',
  });
  const adapter = new PgSearchAdapter<any, undefined, typeof CardPrintView>(
    Object.values(commands) as any,
    CardPrintView,
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

describe('magic search semantics', () => {
  test('loyalty searches the part loyalty value', () => {
    const query = compile('loyalty:3');

    expect(query.sql).toContain('"card_print_view"."loyalty"');
    expect(query.sql).not.toContain('"card_print_view"."part_name"');
  });

  test('hand-modifier searches the part hand modifier value', () => {
    expect(compile('hand-modifier>=2').sql).toContain('"card_print_view"."hand_modifier"');
  });

  test('life-modifier searches the part life modifier value', () => {
    expect(compile('life-modifier<=-1').sql).toContain('"card_print_view"."life_modifier"');
  });

  test('rarity searches the print rarity field', () => {
    const query = compile('rarity:r');

    expect(query.sql).toContain('"card_print_view"."rarity"');
    expect(query.sql).not.toContain('"card_print_view"."part_text"');
    expect(query.params).toContain('rare');
  });

  test('rarity existence is an operator on the rarity command', () => {
    const parsed = new Parser('r~:c').parse();
    const request = resolveQueryRequest(parsed, Object.values(commands) as any);
    const resolved = request.filter?.kind === 'leaf' ? request.filter.command : undefined;
    const literalTilde = new Parser('foo~bar').parse();

    expect(parsed).toMatchObject({ type: 'simple', cmd: 'r', op: '~:', args: 'c' });
    expect(resolved).toMatchObject({ commandId: 'rarity', operator: '~:' });
    expect(resolved?.descriptor.witness).toEqual(['same-card-entity']);
    expect(literalTilde).toMatchObject({ type: 'raw', args: 'foo~bar' });
  });

  test('rarity existence aliases preserve card-level independent predicates', () => {
    const short = compile('r~:c');
    const long = compile('rarity~:common');
    const both = compile('r~:c r~:r');
    const either = compile('r~:c | r~:r');
    const negative = compile('-r~:c');

    expect(short.sql.toLowerCase()).toContain('exists');
    expect(short.params).toContain('common');
    expect(long).toEqual(short);
    expect(both.sql.toLowerCase().match(/exists/g)).toHaveLength(2);
    expect(both.params).toEqual(expect.arrayContaining(['common', 'rare']));
    expect(either.sql.toLowerCase()).toContain(' or ');
    expect(either.sql.toLowerCase().match(/exists/g)).toHaveLength(2);
    expect(negative.sql.toLowerCase()).toContain('not');
  });

  test('ordinary rarity uses a print witness and invalid rarity operators are rejected', () => {
    const request = resolveQueryRequest(new Parser('rarity:common').parse(), Object.values(commands) as any);
    const resolved = request.filter?.kind === 'leaf' ? request.filter.command : undefined;

    expect(resolved).toMatchObject({ commandId: 'rarity', operator: ':' });
    expect(resolved?.descriptor.witness).toContain('same-print');
    expect(() => compile('r~=common')).toThrow();
  });

  test('bare | in a color value means or instead of the old color intersection', () => {
    expect(compile('c:U|B').sql).toBe(compile('(c:U | c:B)').sql);
    expect(compile('c:U|B').sql).not.toBe(compile('c:U c:B').sql);
  });

  test('bare & in a color value means and', () => {
    expect(compile('c:U&B').sql).toBe(compile('c:U c:B').sql);
  });

  test('bare | in oracle text means or', () => {
    // The oracle handler matches two columns; compare the disjunct set.
    const grouped = compile('o:draw|gain');
    const spaced = compile('(o:draw | o:gain)');
    expect(grouped.sql.toLowerCase().match(/ilike/g)).toHaveLength(4);
    expect(spaced.sql.toLowerCase().match(/ilike/g)).toHaveLength(4);
    expect([...grouped.params].sort()).toEqual([...spaced.params].sort());
  });

  test('quoted strings keep their literal value', () => {
    expect(compile('o:"draw|gain"').params.every(param => param === '%draw|gain%')).toBe(true);
    expect(compile('n:"A|B"').params.every(param => param === '%A|B%')).toBe(true);
  });

  test('mana cost supports or across cost expressions', () => {
    expect(compile('mana:{W}|{U}').sql).toBe(compile('(mana:{W} | mana:{U})').sql);
  });

  test('name order ends in deterministic tail keys', () => {
    const sorter = order.call({ value: 'name+', operator: ':', qualifier: [] }, {
      meta:  {},
      table: CardPrintView,
    }) as any[];

    const compiled = sorter.map(fragment => dialect.sqlToQuery(fragment).sql);

    expect(compiled.at(-3)).toContain('card_id');
    expect(compiled.at(-2)).toContain('set');
    expect(compiled.at(-1)).toContain('number');
  });

  test('logical requests retain resolved modifiers and pattern captures', () => {
    const modifierExpr: Expression = {
      type:     'simple',
      cmd:      'name.oracle',
      op:       ':',
      argType:  'id',
      args:     'draw',
      tokens:   [],
      location: [0, 14],
      topLevel: true,
    };
    const modifierRequest = resolveQueryRequest(
      simplify(modifierExpr),
      Object.values(commands) as any,
    );

    expect(modifierRequest.filter).toMatchObject({
      kind:    'leaf',
      command: {
        commandId:  'name',
        modifier:   'oracle',
        descriptor: { field: 'name', modifiers: ['oracle', 'on', 'localized', 'ln', 'printed', 'pn'] },
      },
    });

    const patternRequest = resolveQueryRequest(
      simplify(new Parser('2/3').parse()),
      Object.values(commands) as any,
    );

    expect(patternRequest.filter).toMatchObject({
      kind:    'leaf',
      command: {
        commandId: 'stats',
        pattern:   { power: '2', toughness: '3' },
      },
    });
  });

  test('the logical PG path preserves every public command family', async () => {
    const queries = [
      'draw',
      '2/3',
      '#flying',
      'print:m20#123',
      'set:khm',
      'number:123',
      'lang:en',
      'cost:{W}',
      'mana-value:3',
      'color:U',
      'color-identity:U',
      'color-indicator:U',
      'power:2',
      'toughness:3',
      '[3]',
      'defense:3',
      'hand-modifier>=2',
      'life-modifier<=-1',
      'name:draw',
      'n:draw',
      'type:creature',
      'text:"draw a card"',
      'oracle:/draw/',
      'flavor-text:quote',
      'flavor-name:quote',
      'layout:normal',
      'image-status:missing',
      'rarity:r',
      'release-date>=2020-01-01',
      'format:modern',
      'counter:charge',
      'keyword:flying',
      'multiverse-id:123',
      'ambit:primary',
      'name:draw order:name+',
      'name:draw | text:gain',
      '!(name:draw | text:gain)',
    ];

    for (const query of queries) {
      await expectLegacyEquivalent(query);
    }
  });
});
