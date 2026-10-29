import { describe, expect, test } from 'bun:test';

import { PgDialect } from 'drizzle-orm/pg-core';

import Parser from '#search/parser';
import { simplify } from '#search/parser/simplify';
import { translate } from '#search/server/translate';

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

describe('magic search semantics', () => {
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
      meta: {},
      table: CardPrintView,
    }) as any[];

    const compiled = sorter.map(fragment => dialect.sqlToQuery(fragment).sql);

    expect(compiled.at(-3)).toContain('card_id');
    expect(compiled.at(-2)).toContain('set');
    expect(compiled.at(-1)).toContain('number');
  });
});
