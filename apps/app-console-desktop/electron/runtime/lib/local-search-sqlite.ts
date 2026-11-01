import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LOCAL_SEARCH_SCHEMA_VERSIONS } from '@tcg-cards/model/search/publication';

/** Identifies a game whose local search files share a versioned SQLite projection. */
export type LocalSearchGame = 'magic' | 'hearthstone';

/** Carries the attached files and their shared data version for one read-only session. */
export type LocalSearchSession = {
  database:      DatabaseSync;
  game:          LocalSearchGame;
  dataVersion:   string;
  schemaVersion: number;
  releaseHash:   string | null;
  close():    void;
};

export type LocalSearchPackageMetadata = {
  game:          LocalSearchGame;
  packageRole:   'base' | 'locale';
  locale:        string | null;
  dataVersion:   string;
  schemaVersion: number;
  buildNumber:   number | null;
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

/** Inspects one downloaded package through a read-only attached SQLite connection. */
export function inspectLocalSearchPackage(input: {
  game: LocalSearchGame;
  path: string;
}): LocalSearchPackageMetadata {
  const database = new DatabaseSync(':memory:');
  try {
    database.prepare('ATTACH DATABASE ? AS inspected').run(readOnlyUri(input.path));
    const metadataTable = metadataTables[input.game];
    const role = readMetadataValue(database, 'inspected', metadataTable, 'package_role');
    if (role !== 'base' && role !== 'locale') {
      throw new Error('The local search file does not declare a supported package role.');
    }
    assertPackageTables(database, 'inspected', packageTables[input.game][role]);
    if (readMetadataValue(database, 'inspected', metadataTable, 'ready') !== '1') {
      throw new Error('The local search file is not ready to use.');
    }
    const locale = role === 'locale' ? readMetadataValue(database, 'inspected', metadataTable, 'locale') : null;
    const build = input.game === 'hearthstone'
      ? Number(readMetadataValue(database, 'inspected', metadataTable, 'build_number'))
      : null;
    if (build != null && (!Number.isSafeInteger(build) || build < 1)) {
      throw new Error('The local Hearthstone package has an invalid build number.');
    }
    return {
      game:          input.game,
      packageRole:   role,
      locale,
      dataVersion:   readDataVersion(database, 'inspected', metadataTable),
      schemaVersion: readSchemaVersion(database, 'inspected', metadataTable),
      buildNumber:   build,
    };
  } finally {
    database.close();
  }
}

/** Attaches matching base and locale packages without copying either file. */
export function openLocalSearchSession(input: {
  game:                 LocalSearchGame;
  locale:               string;
  basePath:             string;
  localePath:           string;
  expectedReleaseHash?: string;
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
    const baseSchemaVersion = readSchemaVersion(database, 'search_base', metadataTable);
    const localeSchemaVersion = readSchemaVersion(database, 'search_locale', metadataTable);
    if (baseSchemaVersion !== LOCAL_SEARCH_SCHEMA_VERSIONS[input.game] || localeSchemaVersion !== baseSchemaVersion) {
      throw new Error('The local search packages use an unsupported or mismatched schema version.');
    }
    if (input.expectedReleaseHash != null && !/^[a-f0-9]{64}$/.test(input.expectedReleaseHash)) {
      throw new Error('The active local search release identity is invalid.');
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
      game:          input.game,
      dataVersion:   baseVersion,
      schemaVersion: baseSchemaVersion,
      releaseHash:   input.expectedReleaseHash ?? null,
      close:         () => database.close(),
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
    ? '\'data_version\', \'schema_version\', \'ready\', \'package_role\''
    : '\'data_version\', \'schema_version\', \'build_number\', \'ready\', \'sort_version\', \'package_role\'';
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
function assertPackageTables(database: DatabaseSync, schema: 'search_base' | 'search_locale' | 'inspected', tables: string[]): void {
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
  schema: 'search_base' | 'search_locale' | 'inspected',
  table: string,
): string {
  const value = readMetadataValue(database, schema, table, 'data_version');
  if (value === '') {
    throw new Error(`The ${schema} file has no search data version.`);
  }
  return value;
}

/** Reads and validates the SQLite layout version shared by one package group. */
function readSchemaVersion(
  database: DatabaseSync,
  schema: 'search_base' | 'search_locale' | 'inspected',
  table: string,
): number {
  const value = Number(readMetadataValue(database, schema, table, 'schema_version'));
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`The ${schema} file has an invalid search schema version.`);
  }
  return value;
}

/** Reads one required value from a package's key-value metadata table. */
function readMetadataValue(
  database: DatabaseSync,
  schema: 'search_base' | 'search_locale' | 'inspected',
  table: string,
  key: string,
): string {
  const row = database.prepare(`SELECT value FROM ${schema}.${table} WHERE key = ?`).get(key);
  if (typeof row?.value !== 'string') {
    throw new Error(`The ${schema} file is missing search metadata: ${key}.`);
  }
  return row.value;
}
