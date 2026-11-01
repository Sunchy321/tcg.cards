import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { file } from 'bun';
import { runWithDb } from '@tcg-cards/db/db';
import { PgDialect } from 'drizzle-orm/pg-core';
import Parser from '#search/parser';
import { simplify } from '#search/parser/simplify';
import { resolveQueryRequest } from '#search/server/logical';
import type { CommonServerCommand } from '#search/server/command';
import type { EssentialCardSearchItem } from '@tcg-cards/model/hearthstone/schema/search';
import { createSnapshotSql, snapshotDdl } from '../../../scripts/d1-snapshot';
import type { SnapshotItem } from '../../../scripts/d1-snapshot';
import { setHearthstoneSearchDataset } from '../accelerated-adapter';
import type { SearchOption } from '../action';
import * as commands from '../command-list';
import { HearthstoneD1EssentialSearchAdapter } from './adapter';
import type { HearthstoneSearchD1Database } from './types';

const manifest = { dataVersion: 'test-v1', buildNumber: 123 };
let ddl: string;
let sqlite: Database;
let reads = 0;
let fallbacks = 0;
let lastSql = '';
let reader: HearthstoneD1EssentialSearchAdapter;

/** Builds known latest list data without historical identity or complete mechanics. */
function card(
  cardId: string,
  fields: Partial<EssentialCardSearchItem> = {},
): EssentialCardSearchItem {
  return {
    cardId,
    lang:             'en',
    renderHash:       'render-v1',
    ambit:            'primary',
    set:              'CORE',
    classes:          ['mage'],
    type:             'minion',
    cost:             4,
    attack:           4,
    health:           5,
    durability:       null,
    armor:            null,
    rune:             null,
    race:             null,
    spellSchool:      null,
    collectible:      true,
    elite:            false,
    rarity:           'rare',
    legalities:       { standard: 'legal', wild: 'minor' },
    techLevel:        null,
    inBobsTavern:     false,
    raceBucket:       null,
    mercenaryRole:    null,
    mercenaryFaction: null,
    colddown:         null,
    simpleTags:       { 12: false, 1665: 3, 1676: 0 },
    localization:     { name: 'Fireball', text: 'Deal 3 damage.' },
    ...fields,
  };
}

/** Executes actual prepared D1 SQL on SQLite instead of mocking query results. */
function binding(): HearthstoneSearchD1Database {
  return {
    prepare(query: string) {
      lastSql = query;
      let params: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          params = values;
          return this;
        },
        async raw() {
          reads++;
          return sqlite.query(query).values(...(params as never[]));
        },
        async all() {
          reads++;
          return { results: sqlite.query(query).all(...(params as never[])) };
        },
      };
    },
  } as unknown as HearthstoneSearchD1Database;
}

/** Resolves the public DSL using the same essential request contract. */
function request(dsl: string, orderBy = 'id+') {
  return resolveQueryRequest(
    simplify(new Parser(dsl).parse()),
    Object.values(commands) as CommonServerCommand[],
    {
      sort:     [{ kind: 'request', field: 'order', value: orderBy }],
      group:    null,
      page:     1,
      pageSize: 20,
      total:    true,
      ambit:    null,
      lang:     'en',
    },
  );
}

/** Searches through the adapter's public execution boundary. */
async function search(dsl: string, overrides: Partial<SearchOption> = {}) {
  const options: SearchOption = {
    dsl,
    lang:     'en',
    page:     1,
    pageSize: 20,
    orderBy:  'id+',
    d1:       binding(),
    ...overrides,
  };
  return reader.execute(request(dsl, options.orderBy), options);
}

/** Loads one independently generated latest snapshot. */
function load(
  items: EssentialCardSearchItem[],
  keys: Array<Partial<Pick<SnapshotItem, 'idOrder' | 'setOrder' | 'nameOrder'>>> = [],
): void {
  sqlite.exec(createSnapshotSql(withRanks(items, keys), manifest));
}

/** Supplies fixture ranks independently of SQLite collation. */
function withRanks(
  items: EssentialCardSearchItem[],
  keys: Array<Partial<Pick<SnapshotItem, 'idOrder' | 'setOrder' | 'nameOrder'>>> = [],
): SnapshotItem[] {
  const ids = [...new Set(items.map(item => item.cardId))];
  return items.map((item, index) => ({
    ...item,
    idOrder:   ids.indexOf(item.cardId) + 1,
    setOrder:  1,
    nameOrder: 1,
    ...keys[index],
  }));
}

beforeAll(async () => {
  ddl
    = snapshotDdl()
      + '\n'
      + (await file(
        new URL(import.meta.resolve('@tcg-cards/db/schema/sqlite/hearthstone/search-fts.sql')),
      ).text());
});
beforeEach(() => {
  sqlite = new Database(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(ddl);
  reads = 0;
  fallbacks = 0;
  reader = new HearthstoneD1EssentialSearchAdapter(async () => {
    fallbacks++;
    return {
      result:    [],
      total:     777,
      page:      1,
      totalPage: 1,
      elapsed:   0,
      ambit:     'primary',
      variant:   'normal',
    };
  });
  setHearthstoneSearchDataset({ manifest, ...manifest, ready: true });
});
afterEach(() => {
  sqlite.close();
  setHearthstoneSearchDataset(null);
});

describe('Hearthstone D1 essential search', () => {
  test('returns exact list fields and display-only tags in one statement', async () => {
    const expected = card('A');
    load([expected]);
    expect(reader.plan(request('cost:4'))).toEqual({ type: 'exact' });
    const result = await search('cost:4');
    expect(result.result).toEqual([expected]);
    expect(result.total).toBe(1);
    expect(reads).toBe(1);
    expect(fallbacks).toBe(0);
    expect(lastSql).not.toMatch(
      /latest_card_entity_view|revision_hash|localization_hash|json_extract/,
    );
    expect(lastSql.match(/simple_tags/g)?.length).toBe(1);
  });
  test('keeps explicit language entries reachable and retains empty-page totals', async () => {
    load([
      card('A'),
      card('A', { lang: 'zhs', localization: { name: '火球', text: '造成3点伤害。' } }),
      card('B'),
    ]);
    const first = await search('lang:en|zhs cost:4', { lang: 'fr', pageSize: 1 });
    const second = await search('lang:en|zhs cost:4', { lang: 'fr', pageSize: 1, page: 2 });
    expect(first.total).toBe(3);
    expect(first.result.map(row => `${row.cardId}:${row.lang}`)).toEqual(['A:en']);
    expect(second.result.map(row => `${row.cardId}:${row.lang}`)).toEqual(['A:zhs']);
    const empty = await search('l:en cost:4', { lang: 'zhs', page: 999 });
    expect(empty.result).toEqual([]);
    expect(empty.total).toBe(2);
    expect(reads).toBe(3);
  });
  test('widens ambit in one statement and keeps valid zero results away from history', async () => {
    load([
      card('A', { ambit: 'additional' }),
      card('B', { ambit: 'full', cost: 9 }),
      card('E', { type: 'enchantment' }),
    ]);
    expect((await search('cost:4')).ambit).toBe('additional');
    expect((await search('cost:4')).result.map(row => row.cardId)).toEqual(['A']);
    expect((await search('cost:4 ambit=primary')).total).toBe(0);
    expect((await search('cost:12345')).total).toBe(0);
    expect((await search('cost:4 ambit:full')).ambit).toBe('full');
    expect(reads).toBe(5);
    expect(fallbacks).toBe(0);
  });
  test('preserves nullable arrays, duplicates, ordered equality, and NOT', async () => {
    load([
      card('A'),
      card('B', { rune: [] }),
      card('C', { rune: ['blood', 'blood', 'frost'] }),
      card('D', { rune: ['frost', 'blood', 'blood'] }),
    ]);
    expect((await search('rune:bf')).result.map(row => row.cardId)).toEqual(['C', 'D']);
    expect((await search('rune=bbf')).result.map(row => row.cardId)).toEqual(['C']);
    expect((await search('rune!:bbf')).result.map(row => row.cardId)).toEqual(['B']);
    expect((await search('-(rune:b)')).result.map(row => row.cardId)).toEqual(['B']);
    expect((await search('class:mage -attack:9')).result).toHaveLength(4);
  });
  test('preserves groups, boolean negation, legality NULLs, and stats patterns', async () => {
    load([
      card('A'),
      card('B', { cost: 5, attack: null, legalities: {}, elite: true, inBobsTavern: true }),
      card('C', { legalities: { standard: 'banned' } }),
    ]);
    for (const dsl of [
      '4/4/5',
      '4/5',
      'cost:4|9',
      'cost:4&4',
      'cost:4 (elite:false | in-tavern:false)',
    ]) {
      expect((await search(dsl)).result.map(row => row.cardId)).toEqual(['A', 'C']);
    }
    expect((await search('format!:standard')).result.map(row => row.cardId)).toEqual(['C']);
    expect((await search('format:standard')).result.map(row => row.cardId)).toEqual(['A']);
    expect((await search('-elite:true')).result.map(row => row.cardId)).toEqual(['A', 'C']);
    expect((await search('-in-tavern:false')).result.map(row => row.cardId)).toEqual(['B']);
    expect((await search('cost>=4 -attack:4')).result).toHaveLength(0);
  });
  test('uses body trigram candidates and exact literals without combining sources', async () => {
    load([
      card('A', {
        localization: { name: 'NameOnly', text: 'Alpha\nBeta 100%_literal "quoted" 中文正文' },
      }),
      card('B', { localization: { name: 'Alpha', text: 'Unrelated body' } }),
      card('C', { localization: { name: 'Unrelated', text: 'Alpha without literal percent' } }),
    ]);
    for (const dsl of [
      'text:"100%_literal"',
      'text:"Alpha\nBeta"',
      'text:中文正文',
      'text:"\\"quoted\\""',
    ]) {
      expect(reader.plan(request(dsl))).toEqual({ type: 'exact' });
      expect((await search(dsl)).result.map(row => row.cardId)).toEqual(['A']);
    }
    expect((await search('text!:Alpha')).result.map(row => row.cardId)).toEqual(['B']);
    expect((await search('Alpha')).result.map(row => row.cardId)).toEqual(['A', 'B', 'C']);
    expect((await search('name:"Alpha|NameOnly"')).total).toBe(0);
    expect((await search('text="Alpha"')).total).toBe(0);
    expect(fallbacks).toBe(0);
  });
  test('routes unsupported mixed conditions and unproven ordering wholly to PG', () => {
    for (const dsl of [
      '#taunt',
      'faction:human',
      '(cost:4 | #taunt)',
      '-(#taunt | cost:2)',
      'text:of',
      'of',
      'name:Éclair',
      'artist:alex',
      'type:unknown-type',
      'lang:xx',
      'class:unknown',
      'cost:2147483648',
      'rune:u',
    ]) {
      expect(reader.plan(request(dsl)).type).toBe('original');
    }
    expect(reader.plan(request('cost:4', 'artist+')).type).toBe('original');
    expect(reader.plan(request('cost:4 order:artist+')).type).toBe('original');
    expect(reads).toBe(0);
    expect(reader.plan({ ...request('cost:4', 'artist+'), filter: null }).type).toBe('original');
  });
  test('preserves PG enum language order for same-card pagination', async () => {
    load([card('A', { lang: 'de' }), card('A')]);
    expect((await search('lang:en|de cost:4', { pageSize: 1 })).result[0]?.lang).toBe('en');
    expect((await search('lang:en|de cost:4', { pageSize: 1, page: 2 })).result[0]?.lang).toBe(
      'de',
    );
  });
  test('falls back when stored Unicode makes ASCII case folding unproven', async () => {
    load([
      card('A', { localization: { name: 'Kelvin', text: 'Deal damage.' } }),
      card('B', { lang: 'fr', localization: { name: 'Éclair', text: 'Dégâts.' } }),
    ]);
    expect((await search('name:kelvin')).total).toBe(777);
    expect((await search('text:damage')).total).toBe(1);
    expect((await search('text:damage lang:en')).total).toBe(777);
    expect((await search('cost:4')).total).toBe(1);
    sqlite.exec('UPDATE hearthstone_search_meta SET value = \'0\' WHERE key = \'case_safe:set:all\'');
    expect((await search('set:core')).total).toBe(777);
    sqlite.exec('DELETE FROM hearthstone_search_meta WHERE key = \'case_safe:text:en\'');
    expect((await search('text:damage')).total).toBe(777);
    expect(fallbacks).toBe(4);
  });
  test('rejects snapshots missing the sort-key version', async () => {
    load([card('B'), card('A')]);
    sqlite.exec('DELETE FROM hearthstone_search_meta WHERE key = \'sort_version\'');
    expect((await search('cost:4')).total).toBe(777);
    expect(fallbacks).toBe(1);
  });
  test('uses PG text ranks for default, reverse, and combined order independently of byte order', async () => {
    load(
      [
        card('A2', { localization: { name: 'Eclair', text: 'Text.' } }),
        card('A1', { localization: { name: 'fireball', text: 'Text.' } }),
        card('A_2', { localization: { name: 'Éclair', text: 'Text.' } }),
        card('A_1', { localization: { name: 'Fireball', text: 'Text.' } }),
      ],
      [
        { idOrder: 4, nameOrder: 1 },
        { idOrder: 2, nameOrder: 3 },
        { idOrder: 3, nameOrder: 2 },
        { idOrder: 1, nameOrder: 4 },
      ],
    );
    expect(reader.plan(request('cost:4', 'name+'))).toEqual({ type: 'exact' });
    expect((await search('cost:4', { orderBy: 'id+' })).result.map(row => row.cardId)).toEqual([
      'A_1',
      'A1',
      'A_2',
      'A2',
    ]);
    expect((await search('cost:4', { orderBy: 'name+' })).result.map(row => row.cardId)).toEqual([
      'A2',
      'A_2',
      'A1',
      'A_1',
    ]);
    expect(
      (await search('cost:4 order:name-', { orderBy: 'id+' })).result.map(row => row.cardId),
    ).toEqual(['A_1', 'A1', 'A_2', 'A2']);
    expect(
      (await search('cost:4', { orderBy: 'cost-,id-' })).result.map(row => row.cardId),
    ).toEqual(['A2', 'A_2', 'A1', 'A_1']);
    expect(fallbacks).toBe(0);
  });
  test('preserves numeric NULL placement, stats exceptions, and fixed business orders', async () => {
    load(
      [
        card('A', { type: 'hero', attack: 0, health: 30, classes: ['warrior'] }),
        card('B', { type: 'minion', attack: 4, health: 5, classes: ['mage'] }),
        card('C', { type: 'weapon', attack: 5, health: null, durability: 3, classes: ['druid'] }),
        card('D', { type: 'spell', attack: null, health: null, classes: [] }),
      ],
      [{ setOrder: 4 }, { setOrder: 3 }, { setOrder: 2 }, { setOrder: 1 }],
    );
    expect(
      (await search('cost:4', { orderBy: 'attack+' })).result.map(row => row.cardId),
    ).toEqual(['A', 'B', 'C', 'D']);
    expect(
      (await search('cost:4', { orderBy: 'attack-' })).result.map(row => row.cardId),
    ).toEqual(['D', 'C', 'B', 'A']);
    expect((await search('cost:4', { orderBy: 'stats+' })).result.map(row => row.cardId)).toEqual(
      ['C', 'B', 'A', 'D'],
    );
    expect((await search('cost:4', { orderBy: 'stats-' })).result.map(row => row.cardId)).toEqual(
      ['B', 'C', 'A', 'D'],
    );
    expect((await search('cost:4', { orderBy: 'type+' })).result.map(row => row.cardId)).toEqual([
      'A',
      'B',
      'D',
      'C',
    ]);
    expect((await search('cost:4', { orderBy: 'class+' })).result.map(row => row.cardId)).toEqual(
      ['C', 'B', 'A', 'D'],
    );
    expect((await search('cost:4', { orderBy: 'set+' })).result.map(row => row.cardId)).toEqual([
      'D',
      'C',
      'B',
      'A',
    ]);
    expect(fallbacks).toBe(0);
  });
  test('rejects absent, incomplete, and mismatched datasets', async () => {
    load([card('A')]);
    sqlite.exec('UPDATE hearthstone_search_meta SET value = \'122\' WHERE key = \'build_number\'');
    expect((await search('cost:4')).total).toBe(777);
    sqlite.exec('UPDATE hearthstone_search_meta SET value = \'123\' WHERE key = \'build_number\'');
    sqlite.exec('UPDATE hearthstone_search_meta SET value = \'other\' WHERE key = \'data_version\'');
    expect((await search('cost:4')).total).toBe(777);
    setHearthstoneSearchDataset({ manifest, ...manifest, ready: false });
    expect(reader.plan(request('cost:4')).type).toBe('original');
    expect((await search('cost:4')).total).toBe(777);
    expect(fallbacks).toBe(3);
    expect(reads).toBe(2);
  });
  test('falls back on missing binding, failed reads, or activation changes during reads', async () => {
    load([card('A')]);
    expect((await search('cost:4', { d1: undefined })).total).toBe(777);
    const native = binding();
    const swapped = {
      prepare(query: string) {
        const statement = native.prepare(query);
        setHearthstoneSearchDataset({
          manifest:    { ...manifest, dataVersion: 'new' },
          dataVersion: 'new',
          buildNumber: 123,
          ready:       true,
        });
        return statement;
      },
    } as unknown as HearthstoneSearchD1Database;
    expect((await search('cost:4', { d1: swapped })).total).toBe(777);
    setHearthstoneSearchDataset({ manifest, ...manifest, ready: true });
    sqlite.exec('DROP TABLE hearthstone_search_meta');
    expect((await search('cost:4')).total).toBe(777);
    expect(fallbacks).toBe(3);
  });
  test('loads independent translation snapshots and retains variant selection', async () => {
    const original = card('A', { set: 'BGS' });
    load([original]);
    expect((await search('set:bgs')).variant).toBe('battlegrounds');
    sqlite.close();
    sqlite = new Database(':memory:');
    sqlite.exec(ddl);
    load([
      {
        ...original,
        renderHash:   'render-v2',
        localization: { name: 'Updated only', text: 'Fresh translation.' },
      },
    ]);
    expect((await search('name:Updated')).result[0]?.renderHash).toBe('render-v2');
    expect((await search('name:Fireball')).total).toBe(0);
    expect(() => createSnapshotSql(withRanks([card('A'), card('A')]), manifest)).toThrow(
      'Duplicate latest localization',
    );
    expect(() =>
      createSnapshotSql(withRanks([card('A'), card('A', { lang: 'zhs', cost: 9 })]), manifest),
    ).toThrow('Inconsistent latest card');
  });
});

describe('Hearthstone regex routes', () => {
  test('executes literal branches, NOT, flags, empty pages and short literals exactly', async () => {
    load([card('A'), card('B', { localization: { name: 'Draw', text: 'Draw a card.' } })]);
    expect((await search('text:/damage|card/')).total).toBe(2);
    expect((await search('text:/DAMAGE/')).result.map(item => item.cardId)).toEqual(['A']);
    expect((await search('text:/3/')).total).toBe(1);
    expect((await search('-text:/damage/')).result.map(item => item.cardId)).toEqual(['B']);
    const empty = await search('text:/damage|card/', { page: 99, pageSize: 1 });
    expect(empty.result).toEqual([]);
    expect(empty.total).toBe(2);
    expect(fallbacks).toBe(0);
  });

  test('plans candidates conservatively through NOT, OR, optionality and equality', () => {
    expect(reader.plan(request('text:/draw.*card/')).type).toBe('candidate');
    expect(reader.plan(request('text=/(draw|card)/')).type).toBe('candidate');
    expect(reader.plan(request('text:/draw.*card/ | name:/fire/')).type).toBe('candidate');
    expect(reader.plan(request('-text:/draw.*card/')).type).toBe('original');
    expect(reader.plan(request('text!:/draw.*card/')).type).toBe('original');
    expect(reader.plan(request('text:/draw.*card/ | text:/[a-z]+/')).type).toBe('original');
  });

  test('reads all candidates without paging, language or ambit pruning before PG verification', async () => {
    load([
      card('A', { localization: { name: 'A', text: 'card before draw' } }),
      card('B', { ambit: 'additional', localization: { name: 'B', text: 'draw a card' } }),
      card('C', { localization: { name: 'draw', text: 'card' } }),
    ]);
    let checked = 0;
    const pg = {
      execute: async (query: Parameters<PgDialect['sqlToQuery']>[0]) => {
        checked++;
        const compiled = new PgDialect().sqlToQuery(query);
        // A is a false positive; B must survive despite the empty primary exact scope.
        expect(compiled.params).toContain('["A","B"]');
        expect(compiled.params).toContain('draw.*card');
        expect(lastSql.toLowerCase()).not.toContain(' offset ');
        expect(lastSql.toLowerCase()).not.toContain('row_number');
        return [{ total: 1, ambit: 'additional', result: [card('B')] }];
      },
    } as unknown as Parameters<typeof runWithDb>[0];
    const result = await runWithDb(pg, () => search('text:/draw.*card/', { pageSize: 1 }));
    expect(checked).toBe(1);
    expect(result.total).toBe(1);
    expect(result.ambit).toBe('additional');
    expect(fallbacks).toBe(0);
  });

  test('rejects unproven Unicode and stale candidate snapshots', async () => {
    load([card('A', { localization: { name: 'A', text: 'draw K card' } })]);
    expect((await search('text:/draw.*card/')).total).toBe(777);
    expect((await search('text:/draw/')).total).toBe(777);
    sqlite.exec('UPDATE hearthstone_search_meta SET value = \'old\' WHERE key = \'data_version\'');
    expect((await search('text:/draw.*card/')).total).toBe(777);
    expect(fallbacks).toBe(3);
  });
});
