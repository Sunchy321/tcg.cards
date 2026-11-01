import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Identifies a game whose local search files share a versioned SQLite projection. */
export type LocalSearchGame = 'magic' | 'hearthstone';

/** Carries the attached files and their shared data version for one read-only session. */
export type LocalSearchSession = {
  database:    DatabaseSync;
  game:        LocalSearchGame;
  dataVersion: string;
  close():    void;
};

const packageTables: Record<LocalSearchGame, { base: string[], locale: string[] }> = {
  magic: {
    base: [
      'magic_search_cards',
      'magic_search_card_parts',
      'magic_search_card_values',
      'magic_search_part_values',
      'magic_search_text_rows',
      'magic_search_text_fts',
      'magic_search_meta',
    ],
    locale: [
      'magic_search_card_part_localizations',
      'magic_search_candidates',
      'magic_search_text_rows',
      'magic_search_text_fts',
      'magic_search_meta',
    ],
  },
  hearthstone: {
    base: [
      'hearthstone_search_cards',
      'hearthstone_search_card_values',
      'hearthstone_search_card_legalities',
      'hearthstone_search_meta',
    ],
    locale: [
      'hearthstone_search_card_localizations',
      'hearthstone_search_text_rows',
      'hearthstone_search_text_fts',
      'hearthstone_search_meta',
    ],
  },
};

const metadataTables: Record<LocalSearchGame, string> = {
  magic:       'magic_search_meta',
  hearthstone: 'hearthstone_search_meta',
};

/** Attaches matching base and locale packages without copying either file. */
export function openLocalSearchSession(input: {
  game:       LocalSearchGame;
  locale:     string;
  basePath:   string;
  localePath: string;
}): LocalSearchSession {
  const database = new DatabaseSync(':memory:');
  try {
    database.prepare('ATTACH DATABASE ? AS search_locale').run(readOnlyUri(input.localePath));
    database.prepare('ATTACH DATABASE ? AS search_base').run(readOnlyUri(input.basePath));

    assertPackageTables(database, 'search_base', packageTables[input.game].base);
    assertPackageTables(database, 'search_locale', packageTables[input.game].locale);

    const metadataTable = metadataTables[input.game];
    const baseVersion = readDataVersion(database, 'search_base', metadataTable);
    const localeVersion = readDataVersion(database, 'search_locale', metadataTable);
    if (baseVersion !== localeVersion) {
      throw new Error('The local search base and locale packages have different data versions.');
    }
    if (readMetadataValue(database, 'search_base', metadataTable, 'package_role') !== 'base') {
      throw new Error('The base file is not a local search base package.');
    }
    if (readMetadataValue(database, 'search_locale', metadataTable, 'package_role') !== 'locale') {
      throw new Error('The locale file is not a local search locale package.');
    }
    if (readMetadataValue(database, 'search_locale', metadataTable, 'locale') !== input.locale) {
      throw new Error('The local search locale package does not match the requested locale.');
    }

    createMetadataView(database, input.game, metadataTable);
    database.exec('PRAGMA query_only = ON');
    return {
      database,
      game:        input.game,
      dataVersion: baseVersion,
      close:       () => database.close(),
    };
  } catch (error) {
    database.close();
    throw error;
  }
}

/** Combines package metadata while keeping single-locale safety keys truthful. */
function createMetadataView(
  database: DatabaseSync,
  game: LocalSearchGame,
  table: string,
): void {
  const sharedKeys = game === 'magic'
    ? '\'data_version\', \'ready\', \'package_role\''
    : '\'data_version\', \'build_number\', \'ready\', \'sort_version\', \'package_role\'';
  database.exec(`
    CREATE TEMP VIEW ${table} AS
      SELECT key, value FROM search_base.${table}
      UNION ALL
      SELECT key, value FROM search_locale.${table}
      WHERE key NOT IN (${sharedKeys});
  `);
}

/** Converts a filesystem path into a read-only SQLite URI. */
function readOnlyUri(path: string): string {
  return `${pathToFileURL(resolve(path)).href}?mode=ro`;
}

/** Rejects a file that does not contain the tables required for its package role. */
function assertPackageTables(database: DatabaseSync, schema: 'search_base' | 'search_locale', tables: string[]): void {
  const available = new Set(
    database.prepare(`SELECT name FROM ${schema}.sqlite_master WHERE type IN ('table', 'view')`).all()
      .map(row => String(row.name)),
  );
  const missing = tables.filter(table => !available.has(table));
  if (missing.length > 0) {
    throw new Error(`The ${schema} file is missing required search tables: ${missing.join(', ')}.`);
  }
}

/** Reads the immutable projection version from one attached package. */
function readDataVersion(
  database: DatabaseSync,
  schema: 'search_base' | 'search_locale',
  table: string,
): string {
  const value = readMetadataValue(database, schema, table, 'data_version');
  if (value === '') {
    throw new Error(`The ${schema} file has no search data version.`);
  }
  return value;
}

/** Reads one required value from a package's key-value metadata table. */
function readMetadataValue(
  database: DatabaseSync,
  schema: 'search_base' | 'search_locale',
  table: string,
  key: string,
): string {
  const row = database.prepare(`SELECT value FROM ${schema}.${table} WHERE key = ?`).get(key);
  if (typeof row?.value !== 'string') {
    throw new Error(`The ${schema} file is missing search metadata: ${key}.`);
  }
  return row.value;
}
