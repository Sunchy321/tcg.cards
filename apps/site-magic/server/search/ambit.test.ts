import { describe, expect, test } from 'bun:test';

import { PgDialect } from 'drizzle-orm/pg-core';

import Parser from '#search/parser';
import { simplify } from '#search/parser/simplify';
import { translate } from '#search/server/translate';
import type { TranslatedQuery } from '#search/server/translate';
import { QueryError } from '#search/command/error';

import { AMBITS, detectAmbit } from '#search/ambit';
import { ambitCeiling, searchWithAmbitCeiling } from '#search/server/ambit';
import type { Ambit } from '#search/ambit';

import { searchInput } from '#search/schema';

import { normalResult } from '#model/magic/schema/search';

import * as commandList from './command-list';

import { CardPrintView } from '#schema/shared/magic/print';

// Only finalized commands carry a command input; the namespace also exports the builder itself.
const commands = Object.values(commandList).filter(c => (c as any)?.options?.input != null);

const dialect = new PgDialect();

/** Runs a query through the site command pipeline and returns the built SQL. */
const build = (q: string): TranslatedQuery => {
  const expr = simplify(new Parser(q).parse());
  return translate(expr, commands as any, CardPrintView);
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
    for (const level of AMBITS) {
      expect(() => compile(`ambit:${level}`)).not.toThrow();
    }
  });

  test('values are matched case-insensitively', () => {
    expect(() => compile('ambit:Primary')).not.toThrow();
    expect(() => compile('ambit:FULL')).not.toThrow();
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
    expect(errorType('ambit:token')).toBe('invalid-query');
    expect(errorType('ambit:core')).toBe('invalid-query');
  });

  test('each level compiles to the ceiling predicate bound to that level', () => {
    for (const level of AMBITS) {
      const { query } = build(`ambit:${level}`);
      const { sql, params } = dialect.sqlToQuery(query!);

      expect(sql).toContain('ambit');
      expect(sql).toContain('<=');
      expect(params).toEqual([level]);
    }
  });

  test('the command is absent from other commands and needs no alias', () => {
    expect(() => compile('amb:primary')).toThrow();
  });
});

describe('ambit detection in a query', () => {
  test('a query without the command is neither explicit nor pinned', () => {
    expect(detectAmbit('t:creature')).toEqual({ explicit: false, pinned: null });
  });

  test('a plain command pins its level and makes the query explicit', () => {
    expect(detectAmbit('t:creature ambit:additional')).toEqual({ explicit: true, pinned: 'additional' });
    expect(detectAmbit('ambit:full')).toEqual({ explicit: true, pinned: 'full' });
  });

  test('several pins annotate with the strictest one', () => {
    expect(detectAmbit('ambit:full | ambit:primary')).toEqual({ explicit: true, pinned: 'primary' });
    expect(detectAmbit('(ambit:additional) (ambit:additional)')).toEqual({ explicit: true, pinned: 'additional' });
  });

  test('negated mentions stay explicit without pinning a ceiling', () => {
    expect(detectAmbit('-ambit:full')).toEqual({ explicit: true, pinned: null });
    expect(detectAmbit('!ambit:primary')).toEqual({ explicit: true, pinned: null });
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

describe('stepwise widening', () => {
  test('the default ceiling helper bounds the column by the level', () => {
    for (const level of AMBITS) {
      const { sql, params } = dialect.sqlToQuery(ambitCeiling(CardPrintView.card.ambit, level));

      expect(sql).toContain('ambit');
      expect(sql).toContain('<=');
      expect(params).toEqual([level]);
    }
  });

  test('the response schema carries the landing ambit and no strict flag', () => {
    expect('ambit' in normalResult.shape).toBe(true);
    expect('strict' in normalResult.shape).toBe(false);
  });
  /** The recorded ceilings plus the scripted totals answered per call. */
  type Run = { ceilings: Array<Ambit | null>, totals: number[] };

  /** A fake runner that records the requested ceilings and answers with scripted totals. */
  const makeRun = (totals: number[]) => {
    const run: Run = { ceilings: [], totals };

    return {
      run: async (ceiling: Ambit | null) => {
        run.ceilings.push(ceiling);

        return { total: run.totals[run.ceilings.length - 1] ?? 0 };
      },
      ceilings: run.ceilings,
    };
  };

  test('a default query starts at primary and lands there on hits', async () => {
    const fake = makeRun([7]);

    const { landing, result } = await searchWithAmbitCeiling({
      pinned:   null,
      explicit: false,
      run:      fake.run,
    });

    expect(fake.ceilings).toEqual(['primary']);
    expect(landing).toBe('primary');
    expect(result.total).toBe(7);
  });

  test('an empty primary widens to additional and annotates the landing', async () => {
    const fake = makeRun([0, 5]);

    const { landing, result } = await searchWithAmbitCeiling({
      pinned:   null,
      explicit: false,
      run:      fake.run,
    });

    expect(fake.ceilings).toEqual(['primary', 'additional']);
    expect(landing).toBe('additional');
    expect(result.total).toBe(5);
  });

  test('an empty ladder lands on full with the full-level result', async () => {
    const fake = makeRun([0, 0, 0]);

    const { landing, result } = await searchWithAmbitCeiling({
      pinned:   null,
      explicit: false,
      run:      fake.run,
    });

    expect(fake.ceilings).toEqual(['primary', 'additional', 'full']);
    expect(landing).toBe('full');
    expect(result.total).toBe(0);
  });

  test('a pinned query runs once with no default ceiling and never widens', async () => {
    const fake = makeRun([0]);

    const { landing, result } = await searchWithAmbitCeiling({
      pinned:   'additional',
      explicit: true,
      run:      fake.run,
    });

    expect(fake.ceilings).toEqual([null]);
    expect(landing).toBe('additional');
    expect(result.total).toBe(0);
  });

  test('an explicit query without a pin keeps the primary ceiling and never widens', async () => {
    const fake = makeRun([0]);

    const { landing, result } = await searchWithAmbitCeiling({
      pinned:   null,
      explicit: true,
      run:      fake.run,
    });

    expect(fake.ceilings).toEqual(['primary']);
    expect(landing).toBe('primary');
    expect(result.total).toBe(0);
  });

  test('the ambit param replaces the starting ceiling and widens from there', async () => {
    const fake = makeRun([0, 4]);

    const { landing, result } = await searchWithAmbitCeiling({
      pinned:   null,
      explicit: false,
      start:    'additional',
      run:      fake.run,
    });

    expect(fake.ceilings).toEqual(['additional', 'full']);
    expect(landing).toBe('full');
    expect(result.total).toBe(4);
  });

  test('a start level with results never widens', async () => {
    const fake = makeRun([9]);

    const { landing, result } = await searchWithAmbitCeiling({
      pinned:   null,
      explicit: false,
      start:    'additional',
      run:      fake.run,
    });

    expect(fake.ceilings).toEqual(['additional']);
    expect(landing).toBe('additional');
    expect(result.total).toBe(9);
  });

  test('a full start is terminal', async () => {
    const fake = makeRun([0]);

    const { landing } = await searchWithAmbitCeiling({
      pinned:   null,
      explicit: false,
      start:    'full',
      run:      fake.run,
    });

    expect(fake.ceilings).toEqual(['full']);
    expect(landing).toBe('full');
  });

  test('the shared search input accepts an optional ambit level', () => {
    expect(searchInput.safeParse({ q: 't:creature' }).success).toBe(true);
    expect(searchInput.safeParse({ q: 't:creature', ambit: 'additional' }).success).toBe(true);
    expect(searchInput.safeParse({ q: 't:creature', ambit: 'token' }).success).toBe(false);
  });
});
