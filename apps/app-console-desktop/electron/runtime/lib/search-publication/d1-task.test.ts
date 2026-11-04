import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { locale as magicLocale } from '@tcg-cards/model/magic/schema/basic';
import { setSearchServiceSessionOverride } from '../../runtime-config';
import { createSearchD1PublicationTask } from './d1-task';

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

let directory = '';

/** Creates one package with the shared schema and its role metadata. */
function createPackage(name: string, metadata: Record<string, string>, seed?: string): void {
  const path = join(directory, name);
  const database = new DatabaseSync(path);
  database.exec(PACKAGE_DDL);
  for (const [key, value] of Object.entries(metadata)) {
    database.prepare('INSERT INTO magic_search_meta (key, value) VALUES (?, ?)').run(key, value);
  }
  if (seed != null) database.exec(seed);
  database.close();
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'console-d1-task-'));
  createPackage('magic-base.sqlite', {
    ready: '1', package_role: 'base', data_version: 'v1', schema_version: '2',
  }, `
    INSERT INTO magic_search_cards VALUES ('adept', 'v1', 'normal', 3);
    INSERT INTO magic_search_card_parts VALUES ('adept', 'v1', 0, 'Adept', 'Creature — Human Wizard', '{2}{W}', '2', '2', NULL, NULL, NULL, NULL);
    INSERT INTO magic_search_costs VALUES ('{2}{W}', 2, 1, 0, 0, 0, 0, 0, 0);
    INSERT INTO magic_search_text_rows VALUES (1, 'part', 'adept', 'v1', 0, NULL, NULL, 'Draw a card.');
  `);
  // A release manifest names every supported locale, so the fixture must ship them all.
  for (const locale of magicLocale.options) {
    createPackage(`magic-${locale}.sqlite`, {
      ready: '1', package_role: 'locale', locale, data_version: 'v1', schema_version: '2',
    }, `
      INSERT INTO magic_search_candidates VALUES ('adept', 'v1', '${locale}', 'TST', '1', 'en', 'print', '2026-01-01', 'normal', 'normal', 'done');
      INSERT INTO magic_search_card_part_localizations VALUES ('adept', 'v1', '${locale}', 'print', 0, 'Adept', NULL, 'Creature — Human Wizard');
      INSERT INTO magic_search_text_rows VALUES (1, 'localization', 'adept', 'v1', 0, '${locale}', 'print', 'Draw a card.');
    `);
  }
  writeFileSync(join(directory, 'search-publication-input.json'), JSON.stringify({
    game:          'magic',
    pgFingerprint: 'b'.repeat(64),
    typeSymbols:   ['W', 'U'],
    tagOwners:     {},
  }));
  setSearchServiceSessionOverride({ baseUrl: 'https://console-api.tcg.cards/', cookieHeader: 'session=abc' });
});

afterEach(() => {
  setSearchServiceSessionOverride(null);
  rmSync(directory, { recursive: true, force: true });
});

const params = { game: 'magic' as const, directory: '' };

describe('search D1 publication task stages', () => {
  test('requires a console session before planning any load', async () => {
    setSearchServiceSessionOverride(null);
    const task = createSearchD1PublicationTask('magic');
    await expect(task.stages({ ...params, directory })).rejects.toThrow('请先登录控制台服务');
  });

  test('rejects a task whose game does not match its registration', async () => {
    const task = createSearchD1PublicationTask('hearthstone');
    await expect(task.stages({ ...params, directory })).rejects.toThrow('所选游戏与当前任务不一致');
  });

  test('rejects a relative export directory', async () => {
    const task = createSearchD1PublicationTask('magic');
    await expect(task.stages({ ...params, directory: 'relative/path' })).rejects.toThrow('请选择有效的搜索数据导出目录');
  });

  test('plans one durable bounded stage whose total matches the generated batches', async () => {
    const task = createSearchD1PublicationTask('magic');
    const stages = await task.stages({ ...params, directory });
    expect(stages.length).toBe(1);
    const [stage] = stages;
    expect(stage!.key).toBe('publish_search_d1');
    expect(stage!.progressMode).toBe('bounded');
    expect(stage!.resumeMode).toBe('durable');
    const preparation = await stage!.prepare!({ taskRunId: 'run-1', params });
    expect(preparation.total).toBeGreaterThan(4);
  });
});
