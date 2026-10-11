import { describe, expect, test } from 'bun:test';

import { PgDialect } from 'drizzle-orm/pg-core';

import Parser from '#search/parser';
import { simplify } from '#search/parser/simplify';
import { translate } from '#search/server/translate';
import type { TranslatedQuery } from '#search/server/translate';
import { QueryError } from '#search/command/error';

import { detectAmbit } from '#search/ambit';
import { ambitCeiling } from '#search/server/ambit';

import { normalResult } from '#model/hearthstone/schema/search';

import * as commandList from './command-list';

import { LatestCardEntityView } from '#schema/shared/hearthstone/entity';

// Only finalized commands carry a command input; the namespace also exports the builder itself.
const commands = Object.values(commandList).filter(c => (c as any)?.options?.input != null);

const dialect = new PgDialect();

/** Runs a query through the site command pipeline and returns the built SQL. */
const build = (q: string): TranslatedQuery => {
  const expr = simplify(new Parser(q).parse());
  return translate(expr, commands as any, LatestCardEntityView);
};

/** Runs a query through the site command pipeline, discarding the built query. */
const compile = (q: string) => {
  build(q);
};

/** Error type raised for an invalid query. */
const errorType = (q: string): string => {
  try {
    compile(q);
  } catch (e) {
    if (e instanceof QueryError) {
      return e.type;
    }
    throw e;
  }

  throw new Error(`expected a query error for ${q}`);
};

describe('ambit command grammar', () => {
  test('all three ladder values compile', () => {
    for (const level of ['primary', 'additional', 'full'] as const) {
      expect(() => compile(`ambit:${level}`)).not.toThrow();
    }
  });

  test('negated mentions compile', () => {
    expect(() => compile('-ambit:full')).not.toThrow();
    expect(() => compile('!ambit:additional')).not.toThrow();
  });

  test('only the : operator is accepted', () => {
    expect(errorType('ambit=primary')).toBe('invalid-operator');
  });

  test('unknown levels are a query error', () => {
    expect(errorType('ambit:visible')).toBe('invalid-query');
  });
});

describe('ambit and collectible orthogonality', () => {
  test('collectible stays a plain field filter on its own', () => {
    expect(() => compile('collectible:true')).not.toThrow();
    expect(() => compile('collectible:false')).not.toThrow();
    expect(() => compile('collectible:all')).not.toThrow();
    expect(() => compile('!collectible:true')).not.toThrow();
    expect(errorType('collectible:sometimes')).toBe('invalid-query');
  });

  test('both commands compose freely in one query', () => {
    expect(() => compile('collectible:true ambit:additional')).not.toThrow();
    expect(() => compile('collectible:false -ambit:full')).not.toThrow();
  });

  test('collectible no longer gates the default ceiling: detection ignores it', () => {
    expect(detectAmbit('collectible:true')).toEqual({ explicit: false, pinned: null });
    expect(detectAmbit('collectible:false !collectible:true')).toEqual({ explicit: false, pinned: null });
  });

  test('only the ambit command itself makes a query explicit', () => {
    expect(detectAmbit('collectible:true ambit:additional')).toEqual({ explicit: true, pinned: 'additional' });
    expect(detectAmbit('collectible:true -ambit:full')).toEqual({ explicit: true, pinned: null });
  });
});

describe('ambit ceiling predicate', () => {
  test('each level compiles to the ceiling predicate bound to that level', () => {
    for (const level of ['primary', 'additional', 'full'] as const) {
      const { query } = build(`ambit:${level}`);
      const { sql, params } = dialect.sqlToQuery(query!);

      expect(sql).toContain('ambit');
      expect(sql).toContain('<=');
      expect(params).toEqual([level]);
    }
  });

  test('the default ceiling helper bounds the column by the level', () => {
    for (const level of ['primary', 'additional', 'full'] as const) {
      const { sql, params } = dialect.sqlToQuery(ambitCeiling(LatestCardEntityView.ambit, level));

      expect(sql).toContain('ambit');
      expect(sql).toContain('<=');
      expect(params).toEqual([level]);
    }
  });

  test('the response schema carries the landing ambit and no strict flag', () => {
    expect('ambit' in normalResult.shape).toBe(true);
    expect('strict' in normalResult.shape).toBe(false);
  });
});
