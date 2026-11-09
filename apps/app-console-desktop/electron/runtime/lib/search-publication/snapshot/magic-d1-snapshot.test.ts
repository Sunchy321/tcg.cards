import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import type { SearchPublicationManifest } from '@tcg-cards/model/search/publication';
import {
  generateMagicD1SnapshotBatches,
  openSearchSnapshotReaderBunSqlite,
  writeMagicD1Snapshot,
  type SearchSnapshotBatch,
} from './index';

const PACKAGE_DDL = `
CREATE TABLE magic_search_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE magic_search_cards (
  card_id TEXT NOT NULL, version TEXT NOT NULL, ambit TEXT NOT NULL, mana_value REAL NOT NULL,
  PRIMARY KEY (card_id, version)
);
CREATE TABLE magic_search_costs (
  cost TEXT PRIMARY KEY, generic INTEGER NOT NULL, w INTEGER NOT NULL, u INTEGER NOT NULL,
  b INTEGER NOT NULL, r INTEGER NOT NULL, g INTEGER NOT NULL, c INTEGER NOT NULL, x INTEGER NOT NULL
);
CREATE TABLE magic_search_cost_specials (
  cost TEXT NOT NULL, symbol TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (cost, symbol)
);
CREATE TABLE magic_search_card_parts (
  card_id TEXT NOT NULL, version TEXT NOT NULL, part_index INTEGER NOT NULL, name TEXT NOT NULL,
  typeline TEXT NOT NULL, cost TEXT, power TEXT, toughness TEXT, loyalty TEXT, defense TEXT,
  hand_modifier TEXT, life_modifier TEXT, PRIMARY KEY (card_id, version, part_index)
);
CREATE TABLE magic_search_card_part_localizations (
  card_id TEXT NOT NULL, version TEXT NOT NULL, locale TEXT NOT NULL, source TEXT NOT NULL,
  part_index INTEGER NOT NULL, name TEXT NOT NULL, ruby_name TEXT, typeline TEXT NOT NULL,
  PRIMARY KEY (card_id, version, locale, source, part_index)
);
CREATE TABLE magic_search_card_values (
  card_id TEXT NOT NULL, version TEXT NOT NULL, field TEXT NOT NULL, value TEXT NOT NULL,
  PRIMARY KEY (card_id, version, field, value)
);
CREATE TABLE magic_search_part_values (
  card_id TEXT NOT NULL, version TEXT NOT NULL, part_index INTEGER NOT NULL, field TEXT NOT NULL,
  value TEXT NOT NULL, PRIMARY KEY (card_id, version, part_index, field, value)
);
CREATE TABLE magic_search_candidates (
  card_id TEXT NOT NULL, version TEXT NOT NULL, request_locale TEXT NOT NULL, set_code TEXT NOT NULL,
  number TEXT NOT NULL, print_lang TEXT NOT NULL, print_source TEXT NOT NULL, release_date TEXT NOT NULL,
  layout TEXT NOT NULL, image_type TEXT NOT NULL, image_status TEXT NOT NULL,
  PRIMARY KEY (card_id, version, request_locale)
);
CREATE TABLE magic_search_text_rows (
  text_id INTEGER PRIMARY KEY, kind TEXT NOT NULL, card_id TEXT NOT NULL, version TEXT NOT NULL,
  part_index INTEGER NOT NULL, locale TEXT, source TEXT, body TEXT NOT NULL
);
CREATE VIRTUAL TABLE magic_search_text_fts USING fts5(
  body, content='magic_search_text_rows', content_rowid='text_id', tokenize='trigram'
);
`;

const manifest = {
  game:          'magic',
  dataVersion:   'v1',
  schemaVersion: 2,
  releaseHash:   'a'.repeat(64),
  pgFingerprint: 'b'.repeat(64),
  packages:      [
    { role: 'base', key: 'base', sha256: 'c'.repeat(64), bytes: 1 },
    { role: 'locale', locale: 'en', key: 'en', sha256: 'd'.repeat(64), bytes: 1 },
  ],
} as unknown as SearchPublicationManifest & { game: 'magic' };

let directory = '';

/** Creates one fixture package with the shared schema and its package metadata. */
function createPackage(name: string, metadata: Record<string, string>): string {
  const path = join(directory, name);
  const database = new Database(path);
  database.exec(PACKAGE_DDL);
  for (const [key, value] of Object.entries(metadata)) {
    database.query('INSERT INTO magic_search_meta (key, value) VALUES (?, ?)').run(key, value);
  }
  return path;
}

/** Seeds one base package with a card, part, cost, and part body. */
function seedBase(path: string): void {
  const database = new Database(path);
  database.exec(`
    INSERT INTO magic_search_cards VALUES ('adept', 'v1', 'normal', 3);
    INSERT INTO magic_search_card_parts VALUES ('adept', 'v1', 0, 'Adept', 'Creature — Human Wizard', '{2}{W}', '2', '2', NULL, NULL, NULL, NULL);
    INSERT INTO magic_search_costs VALUES ('{2}{W}', 2, 1, 0, 0, 0, 0, 0, 0);
    INSERT INTO magic_search_text_rows VALUES (1, 'part', 'adept', 'v1', 0, NULL, NULL, 'Draw a card. It''s fine.');
  `);
  database.close();
}

/** Seeds one locale package with a candidate, a localization, and a body that the loader renumbers. */
function seedLocale(path: string): void {
  const database = new Database(path);
  database.exec(`
    INSERT INTO magic_search_candidates VALUES ('adept', 'v1', 'en', 'TST', '1', 'en', 'print', '2026-01-01', 'normal', 'normal', 'done');
    INSERT INTO magic_search_card_part_localizations VALUES ('adept', 'v1', 'en', 'print', 0, 'Adept', NULL, 'Creature — Human Wizard');
    INSERT INTO magic_search_text_rows VALUES (1, 'localization', 'adept', 'v1', 0, 'en', 'print', 'Draw a card.');
  `);
  database.close();
}

/** Collects one full generation of batches for assertions. */
async function collect(ftsMode: 'rebuild' | 'incremental', manifestInput = manifest): Promise<SearchSnapshotBatch[]> {
  const base = await openSearchSnapshotReaderBunSqlite(join(directory, 'magic-base.sqlite'), 'magic');
  const en = await openSearchSnapshotReaderBunSqlite(join(directory, 'magic-en.sqlite'), 'magic');
  try {
    const batches: SearchSnapshotBatch[] = [];
    for await (const batch of generateMagicD1SnapshotBatches({
      manifest: manifestInput,
      packages: { base, locales: { en } },
      ftsMode,
      sizing:   { maxStatements: 300, maxBytes: 512 * 1024 },
    })) {
      batches.push(batch);
    }
    return batches;
  } finally {
    base.close();
    en.close();
  }
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

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'magic-snapshot-'));
  seedBase(createPackage('magic-base.sqlite', {
    ready: '1', package_role: 'base', data_version: 'v1', schema_version: '2',
  }));
  seedLocale(createPackage('magic-en.sqlite', {
    ready: '1', package_role: 'locale', locale: 'en', data_version: 'v1', schema_version: '2',
  }));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('magic snapshot batches', () => {
  test('segments stream parents-first with localized body renumbering', async () => {
    const batches = await collect('incremental');
    expect(batches[0]!.role).toBe('ddl');
    expect(batches[1]!.role).toBe('meta-clear');
    expect(batches[2]!.role).toBe('clear');
    expect(batches[2]!.statements.length).toBe(9);

    const insertSegments = batches.filter(batch => batch.role === 'insert');
    const segmentTables = insertSegments.filter(batch => batch.final).map(batch => batch.table);
    expect(segmentTables).toEqual([
      'magic_search_cards',
      'magic_search_card_parts',
      'magic_search_card_values',
      'magic_search_costs',
      'magic_search_cost_specials',
      'magic_search_part_values',
      'magic_search_text_rows',
      'magic_search_candidates',
      'magic_search_card_part_localizations',
      'magic_search_text_rows',
    ]);

    const localizedText = insertSegments.filter(batch => batch.table === 'magic_search_text_rows').at(-1)!;
    expect(localizedText.deleteStatements).toEqual([
      `DELETE FROM magic_search_text_rows WHERE kind = 'localization' AND locale = 'en';`,
    ]);
    const bodyStatement = localizedText.statements.find(statement => statement.includes('\'localization\''));
    expect(bodyStatement).toStartWith('INSERT INTO "magic_search_text_rows" ("text_id", "kind",');
    expect(bodyStatement).toContain(`VALUES (2,`);
    expect(localizedText.expectedRows).toBe(1);
  });

  test('the full incremental load lands every row with a live FTS index', async () => {
    const database = new Database(':memory:');
    database.exec(PACKAGE_DDL);
    const batches = await collect('incremental');
    for (const batch of batches) applyBatch(database, batch);

    expect(tableCount(database, 'magic_search_cards')).toBe(1);
    expect(tableCount(database, 'magic_search_card_parts')).toBe(1);
    expect(tableCount(database, 'magic_search_costs')).toBe(1);
    expect(tableCount(database, 'magic_search_candidates')).toBe(1);
    expect(tableCount(database, 'magic_search_card_part_localizations')).toBe(1);
    expect(tableCount(database, 'magic_search_text_rows')).toBe(2);

    const values = new Map(
      ((database.query('SELECT key, value FROM magic_search_meta').all()) as Array<{ key: string, value: string }>)
        .map(row => [row.key, row.value]),
    );
    expect(values.get('ready')).toBe('1');
    expect(values.get('data_version')).toBe('v1');
    expect(values.get('release_hash')).toBe(manifest.releaseHash);
    const matched = database
      .query('SELECT COUNT(*) AS row_count FROM magic_search_text_fts WHERE magic_search_text_fts MATCH \'draw\'')
      .get() as { row_count: number };
    expect(Number(matched.row_count)).toBe(2);
    database.close();
  });

  test('replaying the localized text segment keeps counts stable', async () => {
    const database = new Database(':memory:');
    database.exec(PACKAGE_DDL);
    const batches = await collect('incremental');
    for (const batch of batches) applyBatch(database, batch);

    const localizedText = batches.filter(batch => batch.role === 'insert' && batch.table === 'magic_search_text_rows').at(-1)!;
    applyBatch(database, localizedText);

    expect(tableCount(database, 'magic_search_text_rows')).toBe(2);
    database.close();
  });

  test('rebuild mode closes with one rebuild statement and no per-row index inserts', async () => {
    const batches = await collect('rebuild');
    const textBatches = batches.filter(batch => batch.role === 'insert' && batch.table === 'magic_search_text_rows');
    expect(textBatches.some(batch => (batch.statements ?? []).some((statement: string) => statement.includes('_text_fts(rowid')))).toBe(false);
    expect(batches.some(batch => batch.role === 'fts' && batch.statements[0]?.includes('rebuild'))).toBe(true);
  });

  test('package metadata must match the release', async () => {
    const mismatch = {
      ...manifest,
      dataVersion: 'v2',
    } as unknown as SearchPublicationManifest & { game: 'magic' };
    await expect(collect('incremental', mismatch)).rejects.toThrow('does not match the selected release');
  });

  test('the file writer produces one loadable snapshot', async () => {
    const outputPath = join(directory, 'snapshot.sql');
    await writeMagicD1Snapshot({
      outputPath,
      manifest,
      packagePaths: {
        base:    join(directory, 'magic-base.sqlite'),
        locales: { en: join(directory, 'magic-en.sqlite') },
      },
      openReader: openSearchSnapshotReaderBunSqlite,
    });
    const sql = await Bun.file(outputPath).text();
    expect(sql).toContain('CREATE VIRTUAL TABLE IF NOT EXISTS magic_search_text_fts');
    expect(sql).toContain('INSERT INTO magic_search_meta (key, value) VALUES (\'ready\', \'1\');');

    const database = new Database(':memory:');
    database.exec(PACKAGE_DDL);
    database.exec(sql);
    expect(tableCount(database, 'magic_search_text_rows')).toBe(2);
    database.close();
  });
});
