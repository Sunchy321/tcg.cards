import { afterEach, describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import { PgDialect } from 'drizzle-orm/pg-core';

import Parser from '#search/parser';
import { simplify } from '#search/parser/simplify';
import { resolveQueryRequest } from '#search/server/logical';
import { translate } from '#search/server/translate';
import { AcceleratedSearchFallbackError } from '#search/server/adapter';

import { runWithDb } from '@tcg-cards/db/db';
import { SearchCard, SearchCardPart, SearchCardPartLocalization } from '@tcg-cards/db/schema/shared/magic/search';
import { LOCAL_SEARCH_SCHEMA_VERSIONS } from '@tcg-cards/model/search/publication';
import type { MagicSearchManifest } from '@tcg-cards/model/magic/search/manifest';

import * as commands from './command-list';
import { MagicPgSearchAdapter, getMagicSearchManifest, refreshMagicSearchManifest, setMagicSearchManifest } from './accelerated-adapter';

const adapter = new MagicPgSearchAdapter();
const dialect = new PgDialect();

/** Resolves a public DSL string into the query request shape the adapter plans against. */
function request(q: string) {
  return resolveQueryRequest(simplify(new Parser(q).parse()), Object.values(commands) as any, {
    sort:     [{ kind: 'request', field: 'order', value: 'id+' }],
    group:    'card',
    page:     1,
    pageSize: 20,
    total:    true,
    ambit:    null,
    lang:     'en',
  });
}

/** The planner metadata shape a publication row carries, typed as the manifest expects it. */
const plannerMetadata: {
  typeSymbols: MagicSearchManifest['typeSymbols'];
  tagOwners:   MagicSearchManifest['tagOwners'];
} = {
  typeSymbols: ['creature', 'Artifact'],
  tagOwners:   {
    'dev:card':  'card-only',
    'dev:print': 'print-only',
    'dev:both':  'overlap',
  },
};

/** Builds one magic publication row as the production publisher would store it. */
function publicationRow(overrides: Record<string, unknown> = {}) {
  return {
    game:          'magic',
    dataVersion:   'fingerprint-1',
    pgFingerprint: 'fingerprint-1',
    releaseHash:   null,
    schemaVersion: LOCAL_SEARCH_SCHEMA_VERSIONS.magic,
    ready:         true,
    plannerMetadata,
    ...overrides,
  };
}

/** Stands in for the database with only the calls the manifest loader makes. */
function fakeDb(rows: () => Promise<unknown[]>, execute?: (query: unknown) => Promise<unknown[]>) {
  return {
    select: () => ({
      from: () => ({
        where: () => rows(),
      }),
    }),
    execute,
  } as never;
}

afterEach(() => setMagicSearchManifest(null));

describe('Magic planner manifest loading', () => {
  test('loads a ready publication as the version-matched planner manifest', async () => {
    await runWithDb(fakeDb(async () => [publicationRow()]), () => refreshMagicSearchManifest());

    expect(getMagicSearchManifest()).toEqual({
      dataVersion:   'fingerprint-1',
      pgFingerprint: 'fingerprint-1',
      releaseHash:   undefined,
      typeSymbols:   ['creature', 'Artifact'],
      tagOwners:     plannerMetadata.tagOwners,
    });
    expect(adapter.plan(request('type:creature')).type).toBe('exact');
    expect(adapter.plan(request('#dev:card')).type).toBe('exact');
    expect(adapter.plan(request('#dev:print')).type).toBe('original');
  });

  test('treats a missing, inactive, or stale publication as no manifest', async () => {
    for (const rows of [
      async () => [],
      async () => [publicationRow({ ready: false })],
      async () => [publicationRow({ schemaVersion: LOCAL_SEARCH_SCHEMA_VERSIONS.magic + 1 })],
      async () => [publicationRow({ dataVersion: '', pgFingerprint: 'fingerprint-1' })],
    ]) {
      await runWithDb(fakeDb(rows), () => refreshMagicSearchManifest());
      expect(getMagicSearchManifest()).toBeNull();
    }

    expect(adapter.plan(request('type:creature')).type).toBe('original');
    expect(adapter.plan(request('#dev:card')).type).toBe('original');
    const fields = adapter.descriptor().commands.map(command => command.field);
    expect(fields).not.toContain('type');
    expect(fields).not.toContain('hash');
  });

  test('rejects corrupted planner metadata without using any of it', async () => {
    for (const metadata of [
      null,
      'creature-list',
      { typeSymbols: ['creature', 5], tagOwners: plannerMetadata.tagOwners },
      { typeSymbols: 'creature', tagOwners: plannerMetadata.tagOwners },
      { typeSymbols: ['creature'], tagOwners: [] },
      { typeSymbols: ['creature'], tagOwners: { ...plannerMetadata.tagOwners, 'dev:bad': 'banana' } },
      { typeSymbols: ['creature'], tagOwners: { 'dev:card': null } },
    ]) {
      await runWithDb(fakeDb(async () => [publicationRow({ plannerMetadata: metadata })]), () => refreshMagicSearchManifest());
      expect(getMagicSearchManifest()).toBeNull();
    }

    expect(adapter.plan(request('type:creature')).type).toBe('original');
    expect(adapter.plan(request('#dev:card')).type).toBe('original');
  });

  test('treats an absent publication table as no manifest', async () => {
    await runWithDb(fakeDb(async () => {
      throw Object.assign(new Error('relation does not exist'), { code: '42P01' });
    }), () => refreshMagicSearchManifest());

    expect(getMagicSearchManifest()).toBeNull();
    expect(adapter.plan(request('type:creature')).type).toBe('original');
  });
});

describe('Magic accelerated publication guard', () => {
  test('falls back when the publication switches between refresh and execution', async () => {
    setMagicSearchManifest({
      dataVersion:   'fingerprint-1',
      pgFingerprint: 'fingerprint-1',
      typeSymbols:   ['creature', 'artifact'],
      tagOwners:     { 'dev:card': 'card-only' },
    });

    let guardSql = '';
    const pg = drizzle({ connection: 'postgres://localhost/unused' });
    const execute = async (query: Parameters<PgDialect['sqlToQuery']>[0]) => {
      guardSql = dialect.sqlToQuery(query).sql;
      return [{ total: 0, candidates: [], publicationReady: false }];
    };
    Object.assign(pg, { execute });

    let caught: unknown = null;
    try {
      await runWithDb(pg, () => adapter.execute(request('type:creature'), {
        page: 1, pageSize: 20, lang: 'en', groupBy: 'card', orderBy: 'id+', dsl: 'type:creature',
      }));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AcceleratedSearchFallbackError);
    expect(guardSql).toContain('search_publication_metadata');
    expect(getMagicSearchManifest()).toBeNull();
    expect(adapter.plan(request('type:creature')).type).toBe('original');
  });
});

describe('Magic type and tag routing under a loaded manifest', () => {
  /** Compiles a public DSL expression against the accelerated Magic tables. */
  const compile = (dsl: string) => {
    const expr = simplify(new Parser(dsl).parse());
    const { query } = translate(expr, Object.values(commands) as any, {
      card:                 SearchCard,
      cardPart:             SearchCardPart,
      cardPartLocalization: SearchCardPartLocalization,
      searchAcceleration:   {
        typeSymbols: new Set(plannerMetadata.typeSymbols.map(symbol => symbol.toLowerCase())),
        tagOwners:   plannerMetadata.tagOwners,
      },
    } as any);
    return dialect.sqlToQuery(query!);
  };

  test('routes known symbols to structure columns only when the value is unquoted', () => {
    const known = compile('type:creature');
    expect(known.sql).toContain('"magic"."search_card_parts"."type_super"');
    expect(known.sql).toContain('"magic"."search_card_parts"."type_main"');
    expect(known.sql).toContain('"magic"."search_card_parts"."type_sub"');
    expect(known.sql).not.toContain('part_typeline');
    expect(known.sql).not.toContain('part_loc_typeline');

    const upperCase = compile('type:CREATURE');
    expect(upperCase.sql).toContain('"magic"."search_card_parts"."type_super"');
    expect(upperCase.sql).not.toContain('part_typeline');

    const quoted = compile('type:"Creature"');
    expect(quoted.sql).toContain('"magic"."search_card_parts"."part_typeline"');
    expect(quoted.sql).not.toContain('"magic"."search_card_parts"."type_super"');

    const unknown = compile('type:zebu');
    expect(unknown.sql).toContain('"magic"."search_card_parts"."part_typeline"');
    expect(unknown.sql).not.toContain('"magic"."search_card_parts"."type_super"');
  });

  test('routes each multi-value item on its own while keeping AND, OR, and NOT semantics', () => {
    const andList = compile('type:creature,zebu');
    expect(andList.sql).toContain('"magic"."search_card_parts"."type_super"');
    expect(andList.sql).toContain('"magic"."search_card_parts"."part_typeline"');
    expect(andList.sql.toLowerCase()).toContain(' and ');

    const ampersand = compile('type:creature&zebu');
    expect(ampersand.sql.toLowerCase()).toContain(' and ');

    const orList = compile('type:creature|zebu');
    expect(orList.sql.toLowerCase()).toContain(' or ');

    const negated = compile('-type:creature,zebu');
    expect(negated.sql.toLowerCase()).toContain('not');

    const exactAlternatives = compile('type=creature,zebu');
    expect(exactAlternatives.sql.toLowerCase()).toContain(' or ');

    const quotedList = compile('type:"creature,zebu"');
    expect(quotedList.sql).not.toContain('"magic"."search_card_parts"."type_super"');
  });

  test('keeps only card-only tags on the accelerated tags column', () => {
    const cardOnly = compile('#dev:card');
    expect(cardOnly.sql).toContain('"magic"."search_cards"."tags"');
    expect(cardOnly.sql).not.toContain('print_tags');
  });
});
