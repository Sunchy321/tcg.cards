import { describe, expect, test } from 'bun:test';

import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { matchValueGroups, splitValueGroups } from './terms';

const dialect = new PgDialect();

describe('splitValueGroups', () => {
  test('splits | into groups and & into terms', () => {
    expect(splitValueGroups('a|b&c')).toEqual([['a'], ['b', 'c']]);
    expect(splitValueGroups('a&b|c')).toEqual([['a', 'b'], ['c']]);
  });

  test('keeps a separator-free value as one single term', () => {
    expect(splitValueGroups('mage')).toEqual([['mage']]);
  });

  test('treats commas as part of the term', () => {
    expect(splitValueGroups('a,b|c')).toEqual([['a,b'], ['c']]);
  });
});

describe('matchValueGroups', () => {
  const term = (value: string) => sql`col = ${value}`;
  const compiled = (query: any) => dialect.sqlToQuery(query).sql;

  test('single term returns the term predicate unchanged', () => {
    expect(compiled(matchValueGroups([['mage']], term))).toBe(compiled(term('mage')));
  });

  test('| combines term predicates with or', () => {
    expect(compiled(matchValueGroups([['a'], ['b']], term))).toBe(
      compiled(sql`(${term('a')} or ${term('b')})`),
    );
  });

  test('& combines term predicates with and', () => {
    expect(compiled(matchValueGroups([['a', 'b']], term))).toBe(
      compiled(sql`(${term('a')} and ${term('b')})`),
    );
  });

  test('| and & nest as or-of-ands', () => {
    expect(compiled(matchValueGroups([['a'], ['b', 'c']], term))).toBe(
      compiled(sql`(${term('a')} or (${term('b')} and ${term('c')}))`),
    );
  });
});
