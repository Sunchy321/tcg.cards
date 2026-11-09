import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';

import type { EssentialCardSearchItem } from '@tcg-cards/model/hearthstone/schema/search';
import {
  createSnapshotSql,
  generateHearthstoneD1SnapshotBatches,
  type SnapshotItem,
} from './hearthstone-d1-snapshot';
import type { SearchSnapshotBatch } from './snapshot-batch';

const manifest = { dataVersion: 'test-v1', buildNumber: 123 };

const SNAPSHOT_DDL = `
CREATE TABLE hearthstone_search_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE hearthstone_search_cards (
  card_id TEXT PRIMARY KEY, "set" TEXT NOT NULL, id_order INTEGER NOT NULL, set_order INTEGER NOT NULL,
  type TEXT NOT NULL, cost INTEGER NOT NULL, attack INTEGER, health INTEGER, durability INTEGER, armor INTEGER,
  spell_school TEXT, collectible INTEGER NOT NULL, elite INTEGER NOT NULL, rarity TEXT, ambit TEXT NOT NULL,
  tech_level INTEGER, in_bobs_tavern INTEGER NOT NULL, mercenary_role TEXT, mercenary_faction TEXT,
  colddown INTEGER, class_count INTEGER NOT NULL, rune_count INTEGER, race_count INTEGER, race_bucket_count INTEGER,
  simple_tags TEXT NOT NULL
);
CREATE TABLE hearthstone_search_card_localizations (
  card_id TEXT NOT NULL, lang TEXT NOT NULL, name TEXT NOT NULL, name_order INTEGER NOT NULL,
  text TEXT NOT NULL, render_hash TEXT, PRIMARY KEY (card_id, lang)
);
CREATE TABLE hearthstone_search_card_values (
  card_id TEXT NOT NULL, field TEXT NOT NULL, position INTEGER NOT NULL, value TEXT NOT NULL,
  PRIMARY KEY (card_id, field, position)
);
CREATE TABLE hearthstone_search_card_legalities (
  card_id TEXT NOT NULL, format TEXT NOT NULL, status TEXT NOT NULL, PRIMARY KEY (card_id, format)
);
CREATE TABLE hearthstone_search_text_rows (
  text_id INTEGER PRIMARY KEY, card_id TEXT NOT NULL, lang TEXT NOT NULL, body TEXT NOT NULL
);
CREATE VIRTUAL TABLE hearthstone_search_text_fts USING fts5(
  body, content='hearthstone_search_text_rows', content_rowid='text_id', tokenize='trigram'
);
`;

/** Builds one known latest list row without historical identity. */
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

/** Attaches the positive sort ranks the snapshot contract requires, mirroring PG dense ranks. */
function withRanks(items: EssentialCardSearchItem[]): SnapshotItem[] {
  const cardIds = [...new Set(items.map(item => item.cardId))];
  const sets = [...new Set(items.map(item => item.set))];
  const names = [...new Set(items.map(item => item.localization.name))].sort();
  return items.map(item => ({
    ...item,
    idOrder:   cardIds.indexOf(item.cardId) + 1,
    setOrder:  sets.indexOf(item.set) + 1,
    nameOrder: names.indexOf(item.localization.name) + 1,
  }));
}

const fixtureItems = withRanks([
  card('A'),
  card('A', { lang: 'zhs', localization: { name: '火球术', text: '造成 3 点伤害。' } }),
  card('B', {
    localization: { name: 'It\'s "hot"', text: 'Line one\nLine two' },
    classes:      ['mage', 'warrior'],
  }),
]);

/** Collects one full generation of batches for assertions. */
async function collect(ftsMode: 'rebuild' | 'incremental'): Promise<SearchSnapshotBatch[]> {
  const batches: SearchSnapshotBatch[] = [];
  for await (const batch of generateHearthstoneD1SnapshotBatches({
    items: fixtureItems,
    manifest,
    ftsMode,
  })) {
    batches.push(batch);
  }
  return batches;
}

/** Applies batches the way the remote applier does: deletes first, then statements. */
function applyBatch(database: Database, batch: SearchSnapshotBatch): void {
  for (const statement of batch.deleteStatements ?? []) database.exec(statement);
  for (const statement of batch.statements) database.exec(statement);
}

function tableCount(database: Database, table: string): number {
  const row = database.query(`SELECT COUNT(*) AS row_count FROM ${table}`).get() as { row_count: number } | null;
  return Number(row?.row_count ?? -1);
}

describe('hearthstone snapshot statements', () => {
  test('the combined SQL loads every row and preserves awkward text', () => {
    const database = new Database(':memory:');
    database.exec(SNAPSHOT_DDL);
    database.exec(createSnapshotSql(fixtureItems, manifest, { kind: 'combined', replace: true }));

    expect(tableCount(database, 'hearthstone_search_cards')).toBe(2);
    expect(tableCount(database, 'hearthstone_search_card_values')).toBe(3);
    expect(tableCount(database, 'hearthstone_search_card_legalities')).toBe(4);
    expect(tableCount(database, 'hearthstone_search_card_localizations')).toBe(3);
    expect(tableCount(database, 'hearthstone_search_text_rows')).toBe(3);

    const awkward = database
      .query('SELECT text FROM hearthstone_search_card_localizations WHERE card_id = \'B\'')
      .get() as { text: string };
    expect(awkward.text).toBe('Line one\nLine two');
    const meta = (database
      .query('SELECT key, value FROM hearthstone_search_meta')
      .all()) as Array<{ key: string, value: string }>;
    const values = new Map(meta.map(row => [row.key, row.value]));
    expect(values.get('ready')).toBe('1');
    expect(values.get('data_version')).toBe('test-v1');
    expect(values.get('build_number')).toBe('123');
    const matched = database
      .query('SELECT COUNT(*) AS row_count FROM hearthstone_search_text_fts WHERE hearthstone_search_text_fts MATCH \'damage\'')
      .get() as { row_count: number };
    expect(Number(matched.row_count)).toBe(1);
    database.close();
  });

  test('incremental batches frame segments parents-first with idempotent deletes', async () => {
    const batches = await collect('incremental');
    expect(batches[0]!.role).toBe('meta-clear');
    expect(batches[1]!.role).toBe('clear');
    expect(batches[1]!.statements).not.toContain('DELETE FROM hearthstone_search_meta;');
    expect(batches[2]!.role).toBe('fts');
    expect(batches[2]!.statements[0]).toContain('delete-all');

    const insertSegments = batches.filter(batch => batch.role === 'insert');
    const segmentTables = [...new Set(insertSegments.map(batch => batch.table))];
    expect(segmentTables).toEqual([
      'hearthstone_search_cards',
      'hearthstone_search_card_values',
      'hearthstone_search_card_legalities',
      'hearthstone_search_card_localizations',
      'hearthstone_search_text_rows',
    ]);
    for (const batch of insertSegments) {
      if (batch.final !== true && batch.statements.length === 0) {
        throw new Error('unexpected empty non-final batch');
      }
    }
    for (const table of segmentTables) {
      const first = insertSegments.find(batch => batch.table === table)!;
      expect(first.deleteStatements).toEqual([`DELETE FROM ${table};`]);
    }

    const textRows = insertSegments.filter(batch => batch.table === 'hearthstone_search_text_rows');
    const finalTextBatch = textRows.find(batch => batch.final)!;
    expect(finalTextBatch.expectedRows).toBe(3);
    const ftsCompanions = finalTextBatch.statements.filter((statement: string) => statement.includes('_text_fts(rowid'));
    expect(ftsCompanions.length).toBe(3);
    expect(batches.some(batch => batch.role === 'fts' && batch.statements[0]?.includes('rebuild'))).toBe(false);
    expect(batches.at(-1)!.role).toBe('meta');
  });

  test('rebuild mode keeps one closing FTS rebuild instead of per-row inserts', async () => {
    const batches = await collect('rebuild');
    const textRows = batches.filter(batch => batch.role === 'insert' && batch.table === 'hearthstone_search_text_rows');
    expect(textRows.some(batch => (batch.statements ?? []).some((statement: string) => statement.includes('_text_fts(rowid')))).toBe(false);
    expect(batches.some(batch => batch.role === 'fts' && batch.statements[0]?.includes('rebuild'))).toBe(true);
  });

  test('replaying the text segment keeps counts stable', async () => {
    const database = new Database(':memory:');
    database.exec(SNAPSHOT_DDL);
    const batches = await collect('incremental');
    for (const batch of batches) applyBatch(database, batch);

    const textSegment = batches.filter(batch => batch.role === 'insert' && batch.table === 'hearthstone_search_text_rows');
    for (const batch of textSegment) applyBatch(database, batch);

    expect(tableCount(database, 'hearthstone_search_text_rows')).toBe(3);
    const matched = database
      .query('SELECT COUNT(*) AS row_count FROM hearthstone_search_text_fts WHERE hearthstone_search_text_fts MATCH \'damage\'')
      .get() as { row_count: number };
    expect(Number(matched.row_count)).toBe(1);
    database.close();
  });
});
