import { describe, expect, test } from 'bun:test';

import { PgDialect } from 'drizzle-orm/pg-core';

import Parser from '#search/parser';
import { simplify } from '#search/parser/simplify';
import { translate } from '#search/server/translate';

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

  test('bare | in a value means or', () => {
    expect(compile('class:mage|class:warlock').sql).toBe(compile('(class:mage | class:warlock)').sql);
    expect(compile('c:4|5').sql).toBe(compile('(c:4 | c:5)').sql);

    // Multi-column text commands group per column; the disjunct set matches.
    const grouped = compile('x:deal|restore');
    const spaced = compile('(x:deal | x:restore)');
    expect(grouped.sql.toLowerCase().match(/ilike/g)).toHaveLength(4);
    expect(spaced.sql.toLowerCase().match(/ilike/g)).toHaveLength(4);
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
      meta: {},
      table: LatestCardEntityView as any,
    } as any) as any[];

    const compiled = sorter.map(fragment => dialect.sqlToQuery(fragment).sql);

    expect(compiled.at(-3)).toContain('card_id');
    expect(compiled.at(-2)).toContain('revision_hash');
    expect(compiled.at(-1)).toContain('localization_hash');
  });
});
