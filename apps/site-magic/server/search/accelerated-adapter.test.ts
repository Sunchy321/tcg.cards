import { afterEach, describe, expect, test } from 'bun:test';
import { PgDialect } from 'drizzle-orm/pg-core';

import Parser from '#search/parser';
import { simplify } from '#search/parser/simplify';
import { resolveQueryRequest } from '#search/server/logical';
import { translate } from '#search/server/translate';

import type { MagicSearchManifest } from '@tcg-cards/model/magic/search/manifest';
import { essentialCardSearchItem } from '@tcg-cards/model/magic/schema/search';
import { SearchCard, SearchCardPart, SearchCardPartLocalization } from '@tcg-cards/db/schema/shared/magic/search';
import * as commands from './command-list';
import { MagicPgEssentialSearchAdapter, MagicPgSearchAdapter, setMagicSearchManifest } from './accelerated-adapter';

const adapter = new MagicPgSearchAdapter();
const essentialAdapter = new MagicPgEssentialSearchAdapter();
const dialect = new PgDialect();

function request(q: string, options: { group?: string, orderBy?: string } = {}) {
  const expr = simplify(new Parser(q).parse());

  return resolveQueryRequest(expr, Object.values(commands) as any, {
    sort:     [{ kind: 'request', field: 'order', value: options.orderBy ?? 'id+' }],
    group:    options.group ?? 'card',
    page:     1,
    pageSize: 20,
    total:    true,
    ambit:    null,
    lang:     'en',
  });
}

const manifest: MagicSearchManifest = {
  dataVersion: 'test-version',
  typeSymbols: ['creature', 'artifact'],
  tagOwners:   {
    'dev:card':  'card-only',
    'dev:print': 'print-only',
    'dev:both':  'overlap',
  },
};

afterEach(() => setMagicSearchManifest(null));

describe('Magic PG accelerated search coverage', () => {
  test('validates only the essential list payload and its candidate identity', () => {
    const item = {
      cardId:               'blacker-lotus',
      version:              '',
      locale:               'zhs',
      source:               'mtgch',
      set:                  'lea',
      number:               '232',
      lang:                 'en',
      partIndex:            0,
      cardPartLocalization: {
        name:     '黑莲花',
        rubyName: null,
      },
      print: {
        layout:      'normal',
        imageType:   'webp',
        imageStatus: 'highres_scan',
      },
    } as const;

    expect(essentialCardSearchItem.parse(item)).toEqual(item);
    expect(() => essentialCardSearchItem.parse({ ...item, card: {} })).toThrow();
    expect(() => essentialCardSearchItem.parse({ ...item, printSource: 'scryfall' })).toThrow();
  });

  test('accelerates covered card and part filters without manifest metadata', () => {
    expect(adapter.plan(request('mv>=3')).type).toBe('exact');
    expect(adapter.plan(request('loyalty:3 hand-modifier>=1')).type).toBe('exact');
    expect(adapter.plan(request('text:draw a card')).type).toBe('exact');

    const fields = adapter.descriptor().commands.map(command => command.field);
    expect(fields).toContain('mana-value');
    expect(fields).not.toContain('set');
    expect(fields).not.toContain('cost');
    expect(fields).not.toContain('hash');
    expect(fields).not.toContain('type');
  });

  test('keeps the essential adapter on the same exact and original boundaries', () => {
    expect(essentialAdapter.plan(request('mv>=3')).type).toBe('exact');
    expect(essentialAdapter.plan(request('name:lotus')).type).toBe('exact');
    expect(essentialAdapter.plan(request('cost:{W}')).type).toBe('original');
    expect(essentialAdapter.plan(request('mv:3', { group: 'print' })).type).toBe('original');

    setMagicSearchManifest(manifest);
    expect(essentialAdapter.plan(request('#dev:card')).type).toBe('exact');
    expect(essentialAdapter.plan(request('#dev:print')).type).toBe('original');
  });

  test('keeps cost searches on the original PG path until its projection is designed', () => {
    expect(adapter.plan(request('mana:{W}')).type).toBe('original');
    expect(adapter.plan(request('cost:{W}')).type).toBe('original');
  });

  test('accelerates the rarity existence operator while preserving ordinary print rarity on PG', () => {
    expect(adapter.plan(request('r~:c')).type).toBe('exact');
    expect(adapter.plan(request('rarity~:common -r~:u')).type).toBe('exact');
    expect(adapter.plan(request('rarity:common')).type).toBe('original');

    const rarity = adapter.descriptor().commands.find(command => command.field === 'rarity');
    expect(rarity?.operators).toEqual(['~:']);
    expect(rarity?.witness).toEqual(['same-card-entity']);
  });

  test('uses the loaded manifest to decide whether tags and type symbols are covered', () => {
    expect(adapter.plan(request('#dev:card')).type).toBe('original');
    expect(adapter.plan(request('type:creature')).type).toBe('original');

    setMagicSearchManifest(manifest);
    expect(adapter.plan(request('#dev:card')).type).toBe('exact');
    expect(adapter.plan(request('#dev:print')).type).toBe('original');
    expect(adapter.plan(request('#dev:both')).type).toBe('original');
    expect(adapter.plan(request('type:creature')).type).toBe('exact');
    expect(adapter.plan(request('type:"Creature"')).type).toBe('exact');
  });

  test('compiles card-only tags and known type symbols against their accelerated columns', () => {
    const table = {
      card:                 SearchCard,
      cardPart:             SearchCardPart,
      cardPartLocalization: SearchCardPartLocalization,
      searchAcceleration:   {
        typeSymbols: new Set(manifest.typeSymbols),
        tagOwners:   manifest.tagOwners,
      },
    };
    const compile = (q: string) => {
      const expr = simplify(new Parser(q).parse());
      const { query } = translate(expr, Object.values(commands) as any, table as any);
      return dialect.sqlToQuery(query!);
    };

    const typeQuery = compile('type:creature|permanent');
    expect(typeQuery.sql).toContain('"magic"."search_card_parts"."type_super"');
    expect(typeQuery.sql).toContain('"magic"."search_card_parts"."type_main"');
    expect(typeQuery.sql).toContain('"magic"."search_card_parts"."part_typeline"');
    expect(typeQuery.sql).toContain(' or ');
    expect(typeQuery.sql).toContain('COALESCE');

    const negativeTypeQuery = compile('!type:creature');
    expect(negativeTypeQuery.sql.toLowerCase()).toContain('not');

    const tagQuery = compile('#dev:card');
    expect(tagQuery.sql).toContain('"magic"."search_cards"."tags"');
    expect(tagQuery.sql).not.toContain('print_tags');
  });

  test('compiles rarity existence against the card-version summary', () => {
    const table = {
      card:                 SearchCard,
      cardPart:             SearchCardPart,
      cardPartLocalization: SearchCardPartLocalization,
      searchAcceleration:   {
        typeSymbols: new Set(manifest.typeSymbols),
        tagOwners:   manifest.tagOwners,
      },
    };
    const expr = simplify(new Parser('r~:c r~:r').parse());
    const { query } = translate(expr, Object.values(commands) as any, table as any);
    const compiled = dialect.sqlToQuery(query!);

    expect(compiled.sql).toContain('"magic"."search_cards"."rarities"');
    expect(compiled.sql).toContain('@>');
    expect(JSON.stringify(compiled.params)).toContain('common');
    expect(JSON.stringify(compiled.params)).toContain('rare');
  });

  test('falls back when result grouping or ordering needs uncached print details', () => {
    expect(adapter.plan(request('mv:3', { group: 'print' })).type).toBe('original');
    expect(adapter.plan(request('mv:3', { orderBy: 'name+' })).type).toBe('original');
    expect(adapter.plan(request('set:neo')).type).toBe('original');
  });
});
