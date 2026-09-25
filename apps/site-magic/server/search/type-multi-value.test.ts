import { describe, expect, test } from 'bun:test';

import Parser from '#search/parser';
import { simplify } from '#search/parser/simplify';
import { translate } from '#search/server/translate';
import { QueryError } from '#search/command/error';

import * as commandList from './command-list';

import { CardPrintView } from '#schema/shared/magic/print';

// Only finalized commands carry a command input; the namespace also exports the builder itself.
const commands = Object.values(commandList).filter(c => (c as any)?.options?.input != null);

/** Runs a query through the site command pipeline, discarding the built query. */
const compile = (q: string) => {
  const expr = simplify(new Parser(q).parse());
  translate(expr, commands as any, CardPrintView);
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

describe('type command multi-value grammar', () => {
  test('single values, AND lists, OR lists and exact lists all compile', () => {
    for (const q of [
      't:human',
      't:human,wizard',
      't:human&wizard',
      't:instant|sorcery',
      't=human,wizard',
      '!t:human,wizard',
      '-t:instant|sorcery',
      '-t:human,wizard',
      '-t:human&wizard',
      'lt:Mensch,Zauberer',
      'ot:creature,legendary',
      'pt:creature',
    ]) {
      expect(() => compile(q)).not.toThrow();
    }
  });

  test('mixing AND separators with the pipe is a query error', () => {
    for (const q of ['t:human,wizard|goblin', 't:human&wizard|goblin', 't=human,wizard|goblin']) {
      expect(errorType(q)).toBe('mixed-separator');
    }
  });

  test('empty list items are a query error', () => {
    for (const q of ['t:|', 't:human,', 't:,human', 't:human,,wizard', 't:human|', 't:&']) {
      expect(errorType(q)).toBe('empty-term');
    }
  });

  test('quoted values are exempt from splitting', () => {
    for (const q of ['t:"human,wizard"', 't:"a|b"', 't="human,wizard"']) {
      expect(() => compile(q)).not.toThrow();
    }
  });

  test('regular expressions are exempt from splitting', () => {
    expect(() => compile('t:/creature|vehicle/')).not.toThrow();
  });

  test('other text commands keep accepting their literal values', () => {
    for (const q of ['n:a,b', 'x:lifelink,deathtouch', 'o:draw,a card']) {
      expect(() => compile(q)).not.toThrow();
    }
  });
});
