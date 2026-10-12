import { describe, expect, test } from 'bun:test';

import { PgDialect } from 'drizzle-orm/pg-core';

import Parser from '#search/parser';
import { simplify } from '#search/parser/simplify';
import { translate } from '#search/server/translate';
import type { TranslatedQuery } from '#search/server/translate';
import { QueryError } from '#search/command/error';

import { detectAmbit } from '#search/ambit';
import type { Ambit } from '#search/ambit';
import { ambitCeiling, searchWithAmbitCeiling } from '#search/server/ambit';
import type { AmbitSearchRun } from '#search/server/ambit';

import { searchInput } from '#search/schema';

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

  test('comparison operators compile', () => {
    for (const q of ['ambit=primary', 'ambit<additional', 'ambit<=additional', 'ambit>primary', 'ambit>=primary']) {
      expect(() => compile(q)).not.toThrow();
    }
  });

  test('the bracket form desugars to the ambit command', () => {
    expect(() => compile('[[additional]]')).not.toThrow();
    expect(() => compile('[[=additional]]')).not.toThrow();
    expect(() => compile('-[[full]]')).not.toThrow();
  });

  test('bracket and plain forms build the same SQL', () => {
    for (const [bracket, plain] of [['[[additional]]', 'ambit:additional'], ['[[=additional]]', 'ambit=additional']] as const) {
      const bracketQuery = dialect.sqlToQuery(build(bracket).query!);
      const plainQuery = dialect.sqlToQuery(build(plain).query!);

      expect(bracketQuery.sql).toEqual(plainQuery.sql);
      expect(bracketQuery.params).toEqual(plainQuery.params);
    }
  });

  test('an unknown bracket level is a query error', () => {
    expect(errorType('[[token]]')).toBe('invalid-query');
  });

  test('an unterminated bracket is rejected', () => {
    expect(() => compile('[[additional')).toThrow();
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

  test('every positive operator pins its level', () => {
    expect(detectAmbit('ambit=additional')).toEqual({ explicit: true, pinned: 'additional' });
    expect(detectAmbit('ambit>=full')).toEqual({ explicit: true, pinned: 'full' });
  });

  test('bracket forms detect like their plain forms', () => {
    expect(detectAmbit('[[additional]]')).toEqual({ explicit: true, pinned: 'additional' });
    expect(detectAmbit('[[=full]]')).toEqual({ explicit: true, pinned: 'full' });
    expect(detectAmbit('-[[additional]]')).toEqual({ explicit: true, pinned: null });
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

  test('the shared search input accepts an optional ambit level', () => {
    expect(searchInput.safeParse({ q: 'fire' }).success).toBe(true);
    expect(searchInput.safeParse({ q: 'fire', ambit: 'additional' }).success).toBe(true);
    expect(searchInput.safeParse({ q: 'fire', ambit: 'visible' }).success).toBe(false);
  });
});

describe('stepwise widening runner', () => {
  /** Fakes a search run under a ceiling; each level reports its own total. */
  const fakeRun = (totals: Partial<Record<Ambit, number>>) => {
    const calls: Array<Ambit | null> = [];
    const run: AmbitSearchRun<{ total: number }> = async ceiling => {
      calls.push(ceiling);
      return { total: ceiling == null ? 0 : totals[ceiling] ?? 0 };
    };
    return { run, calls };
  };

  test('a query without ambit input starts at primary and widens on empty results', async () => {
    const { run, calls } = fakeRun({ full: 5 });
    const { landing, result } = await searchWithAmbitCeiling({ pinned: null, explicit: false, run });

    expect(landing).toBe('full');
    expect(result.total).toBe(5);
    expect(calls).toEqual(['primary', 'additional', 'full']);
  });

  test('the ambit param replaces the starting ceiling and widens from there', async () => {
    const { run, calls } = fakeRun({ full: 5 });
    const { landing } = await searchWithAmbitCeiling({ pinned: null, explicit: false, start: 'additional', run });

    expect(landing).toBe('full');
    expect(calls).toEqual(['additional', 'full']);
  });

  test('a start level with results never widens', async () => {
    const { run, calls } = fakeRun({ additional: 3 });
    const { landing, result } = await searchWithAmbitCeiling({ pinned: null, explicit: false, start: 'additional', run });

    expect(landing).toBe('additional');
    expect(result.total).toBe(3);
    expect(calls).toEqual(['additional']);
  });

  test('a full start is terminal', async () => {
    const { run, calls } = fakeRun({});
    const { landing } = await searchWithAmbitCeiling({ pinned: null, explicit: false, start: 'full', run });

    expect(landing).toBe('full');
    expect(calls).toEqual(['full']);
  });

  test('a pinned DSL command outruns the start level and applies no ceiling', async () => {
    const { run, calls } = fakeRun({});
    const { landing } = await searchWithAmbitCeiling({ pinned: 'additional', explicit: true, start: 'full', run });

    expect(landing).toBe('additional');
    expect(calls).toEqual([null]);
  });

  test('an explicit DSL command without a pin ignores the start level and never widens', async () => {
    const { run, calls } = fakeRun({});
    const { landing } = await searchWithAmbitCeiling({ pinned: null, explicit: true, start: 'additional', run });

    expect(landing).toBe('primary');
    expect(calls).toEqual(['primary']);
  });
});
