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
import { locale } from '@tcg-cards/model/hearthstone/schema/basic';
import type { Locale } from '@tcg-cards/model/hearthstone/schema/basic';
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
type CardFields = Partial<Omit<EssentialCardSearchItem, 'localization'>> & {
  localization?: Partial<EssentialCardSearchItem['localization']>;
};

/** Builds known latest list data without historical identity or complete mechanics. */
function card(
  cardId: string,
  fields: CardFields = {},
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
    ...fields,
    localization:     {
      name:        fields.localization?.name ?? 'Fireball',
      text:        fields.localization?.text ?? 'Deal 3 damage.',
      searchTerms: fields.localization?.searchTerms ?? null,
    },
  };
}

/** Executes actual prepared D1 SQL on SQLite instead of mocking query results. */
function binding(): HearthstoneSearchD1Database {
  const database = {
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
  };
  Object.defineProperty(database, Symbol.for('@tcg-cards/search/node-sqlite-d1'), { value: true });
  return database as unknown as HearthstoneSearchD1Database;
}

/** Resolves the public DSL using the same essential request contract. */
function request(dsl: string, orderBy = 'id+', lang: Locale = 'en') {
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
      lang,
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
  return reader.execute(request(dsl, options.orderBy, options.lang), options);
}

/** Loads one independently generated latest snapshot. */
function load(
  items: EssentialCardSearchItem[],
  keys: Array<Partial<Pick<FixtureItem, 'idOrder' | 'setOrder' | 'nameOrder'>>> = [],
): void {
  insertFixture(sqlite, withRanks(items, keys), manifest);
}

/** Quotes one fixture value for the test's own insert statements. */
function literal(value: unknown): string {
  if (value == null) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'string') return `CAST(X'${Buffer.from(value, 'utf8').toString('hex')}' AS TEXT)`;
  return `CAST(X'${Buffer.from(JSON.stringify(value), 'utf8').toString('hex')}' AS TEXT)`;
}

/**
 * Populates the fixture database directly. The test owns its rows instead of
 * running the publisher, so a publisher change cannot mask an adapter regression.
 */
function insertFixture(
  database: Database,
  items: FixtureItem[],
  fixtureManifest: { dataVersion: string, buildNumber: number },
): void {
  const safety = new Map<string, boolean>();
  for (const lang of ['all', ...locale.options]) {
    for (const field of ['name', 'text', 'searchTerms']) safety.set(`case_safe:${field}:${lang}`, true);
  }
  safety.set('case_safe:set:all', true);
  const cards = new Set<string>();
  const identities = new Set<string>();
  let textId = 0;
  for (const item of items) {
    const { lang, localization, renderHash, classes, rune, race, raceBucket, legalities, ...card } = item;
    const { idOrder, setOrder, nameOrder } = item;
    if (!cards.has(card.cardId)) {
      cards.add(card.cardId);
      const columns: Array<[string, unknown]> = [
        ['card_id', card.cardId], ['set', card.set], ['id_order', idOrder], ['set_order', setOrder],
        ['type', card.type], ['cost', card.cost], ['attack', card.attack], ['health', card.health],
        ['durability', card.durability], ['armor', card.armor], ['spell_school', card.spellSchool],
        ['collectible', card.collectible], ['elite', card.elite], ['rarity', card.rarity],
        ['ambit', card.ambit], ['tech_level', card.techLevel], ['in_bobs_tavern', card.inBobsTavern],
        ['mercenary_role', card.mercenaryRole], ['mercenary_faction', card.mercenaryFaction],
        ['colddown', card.colddown], ['class_count', classes.length],
        ['rune_count', rune?.length ?? null], ['race_count', race?.length ?? null],
        ['race_bucket_count', raceBucket?.length ?? null], ['simple_tags', card.simpleTags],
      ];
      database.exec(
        `INSERT INTO hearthstone_search_cards (${columns.map(([name]) => `"${name}"`).join(', ')}) VALUES (${columns.map(([, value]) => literal(value)).join(', ')})`,
      );
      for (const [field, values] of Object.entries({ classes, rune, race, raceBucket })) {
        for (const [position, value] of (values ?? []).entries()) {
          database.exec(`INSERT INTO hearthstone_search_card_values VALUES (${literal(card.cardId)}, ${literal(field)}, ${position}, ${literal(value)})`);
        }
      }
      for (const [format, status] of Object.entries(legalities)) {
        database.exec(`INSERT INTO hearthstone_search_card_legalities VALUES (${literal(card.cardId)}, ${literal(format)}, ${literal(status)})`);
      }
    }
    if (identities.has(`${card.cardId}:${lang}`)) {
      throw new Error(`Duplicate latest localization: ${card.cardId}:${lang}`);
    }
    identities.add(`${card.cardId}:${lang}`);
    for (const field of ['name', 'text', 'searchTerms'] as const) {
      const values = field === 'searchTerms' ? (localization.searchTerms ?? []) : [localization[field]];
      const safe = values.every(value => ![...value].some(char => char.codePointAt(0)! > 127 && /\p{Cased}/u.test(char)));
      for (const scope of ['all', lang]) {
        const key = `case_safe:${field}:${scope}`;
        safety.set(key, safety.get(key)! && safe);
      }
    }
    database.exec(
      `INSERT INTO hearthstone_search_card_localizations VALUES (${literal(card.cardId)}, ${literal(lang)}, ${literal(localization.name)}, ${nameOrder}, ${literal(localization.text)}, ${literal(renderHash)}, ${literal(localization.searchTerms ?? null)})`,
    );
    database.exec(
      `INSERT INTO hearthstone_search_text_rows VALUES (${++textId}, ${literal(card.cardId)}, ${literal(lang)}, ${literal(localization.text)})`,
    );
  }
  const metadata: Array<[string, string]> = [
    ['data_version', fixtureManifest.dataVersion],
    ['schema_version', '1'],
    ['build_number', String(fixtureManifest.buildNumber)],
    ['ready', '1'],
    ['sort_version', '1'],
    ...[...safety].map(([key, safe]) => [key, safe ? '1' : '0'] as [string, string]),
  ];
  database.exec('INSERT INTO hearthstone_search_text_fts(hearthstone_search_text_fts) VALUES (\'rebuild\');');
  for (const [key, value] of metadata) {
    database.exec(`INSERT INTO hearthstone_search_meta VALUES (${literal(key)}, ${literal(value)})`);
  }
}

/** Exports the SQLite search schema from its Drizzle definitions for the fixture database. */
function exportSearchDdl(): string {
  const result = Bun.spawnSync(['bun', 'run', '--filter', '@tcg-cards/db', 'db:export:hearthstone-search']);
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  const prefix = '@tcg-cards/db db:export:hearthstone-search: ';
  return result.stdout.toString().split('\n')
    .filter(line => line.startsWith(prefix) && line !== `${prefix}Exited with code 0`)
    .map(line => line.slice(prefix.length))
    .join('\n');
}

/** Carries one fixture row with the ranks the snapshot stores instead of SQL collation. */
type FixtureItem = EssentialCardSearchItem & {
  idOrder:   number;
  setOrder:  number;
  nameOrder: number;
};

/** Supplies fixture ranks independently of SQLite collation. */
function withRanks(
  items: EssentialCardSearchItem[],
  keys: Array<Partial<Pick<FixtureItem, 'idOrder' | 'setOrder' | 'nameOrder'>>> = [],
): FixtureItem[] {
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
    = exportSearchDdl()
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
  test('matches localized raw terms with card attributes and keeps full-text matches', async () => {
    load([
      card('WHELP', { simpleTags: { 12: false, 1665: 3, 1676: 0, 2355: true } }),
      card('TEXT_EN', { localization: { name: 'Text match', text: '雏龙' } }),
      card('TEXT', { lang: 'zhs', localization: { name: '幼龙', text: '雏龙' } }),
      card('OTHER', { lang: 'zhs' }),
    ]);

    expect(reader.plan(request('lang:en 雏龙', 'id+', 'zhs'))).toEqual({ type: 'exact' });
    const tagResult = await search('lang:en 雏龙', { lang: 'zhs' });
    expect(fallbacks).toBe(0);
    expect(tagResult.total).toBe(2);
    expect(tagResult.result.map(row => row.cardId).sort()).toEqual(['TEXT_EN', 'WHELP']);

    const textResult = await search('雏龙', { lang: 'zhs' });
    expect(textResult.result.map(row => row.cardId)).toEqual(['TEXT']);
    expect((await search('金卡', { lang: 'zhs' })).variant).toBe('golden');
    expect(() => request('special:whelp')).toThrow();
  });

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
        localization: { name: 'Updated only', text: 'Fresh translation.', searchTerms: null },
      },
    ]);
    expect((await search('name:Updated')).result[0]?.renderHash).toBe('render-v2');
    expect((await search('name:Fireball')).total).toBe(0);
    // Duplicate-row rejection belongs to the publisher and is asserted there.
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
