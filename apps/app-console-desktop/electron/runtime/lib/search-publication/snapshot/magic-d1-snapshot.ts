import { createWriteStream } from 'node:fs';
import { readFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import type { WriteStream } from 'node:fs';

import type { SearchPublicationManifest } from '@tcg-cards/model/search/publication';

import type { SearchSnapshotBatch } from './snapshot-batch';
import type { SearchSnapshotReader } from './snapshot-reader';

/** Names the package files that make up one validated Magic release. */
export type MagicPackagePaths = {
  base:    string;
  locales: Record<string, string>;
};

/** Tunable remote-call sizing; batches flush on either bound. */
export type MagicD1SnapshotSizing = {
  maxStatements: number;
  maxBytes:      number;
};

/** Inputs for one Magic D1 snapshot generation from opened package readers. */
export type MagicD1SnapshotInput = {
  manifest: SearchPublicationManifest & { game: 'magic' };
  packages: { base: SearchSnapshotReader, locales: Record<string, SearchSnapshotReader> };
  /** `rebuild` regenerates the FTS index in one closing statement; `incremental` writes it row by row. */
  ftsMode:  'rebuild' | 'incremental';
  sizing:   MagicD1SnapshotSizing;
};

/** Insert order is parents-first so remote foreign keys stay satisfied per segment. */
const MAGIC_COPY_TABLES = [
  'magic_search_cards',
  'magic_search_card_parts',
  'magic_search_card_values',
  'magic_search_costs',
  'magic_search_cost_specials',
  'magic_search_part_values',
] as const;

/** Delete order is children-first so the clearing batch respects the same foreign keys. */
const MAGIC_DELETE_TABLES = [
  'magic_search_text_rows',
  'magic_search_candidates',
  'magic_search_card_part_localizations',
  'magic_search_cost_specials',
  'magic_search_costs',
  'magic_search_part_values',
  'magic_search_card_values',
  'magic_search_card_parts',
  'magic_search_cards',
] as const;

const MAGIC_SIZING: MagicD1SnapshotSizing = { maxStatements: 300, maxBytes: 512 * 1024 };

/**
 * Streams one replace-in-place Magic D1 snapshot as remotely applicable batches.
 * Readiness metadata is only written by the final batch so an interrupted load
 * keeps the store unready and the sites fall back to PostgreSQL.
 */
export async function* generateMagicD1SnapshotBatches(
  input: MagicD1SnapshotInput,
): AsyncGenerator<SearchSnapshotBatch> {
  assertPackageMetadata(input.packages.base, input.manifest, 'base', null);
  for (const descriptor of input.manifest.packages) {
    if (descriptor.role !== 'locale') continue;
    const reader = input.packages.locales[descriptor.locale];
    if (reader == null) throw new Error(`Missing open package reader for locale ${descriptor.locale}.`);
    assertPackageMetadata(reader, input.manifest, 'locale', descriptor.locale);
  }

  yield { role: 'ddl', table: null, final: true, statements: [await magicSearchFtsSql()] };
  yield { role: 'meta-clear', table: null, final: true, statements: ['DELETE FROM magic_search_meta;'] };
  yield {
    role:       'clear',
    table:      null,
    final:      true,
    statements: MAGIC_DELETE_TABLES.map(table => `DELETE FROM ${table};`),
  };
  if (input.ftsMode === 'incremental') {
    yield {
      role:       'fts',
      table:      null,
      final:      true,
      statements: ['INSERT INTO magic_search_text_fts(magic_search_text_fts) VALUES (\'delete-all\');'],
    };
  }

  const base = input.packages.base;
  for (const table of MAGIC_COPY_TABLES) {
    yield* insertTableBatches({
      reader:           base,
      table,
      sizing:           input.sizing,
      deleteStatements: [`DELETE FROM ${table};`],
    });
  }
  let nextTextId = 1;
  yield* insertTableBatches({
    reader:           base,
    table:            'magic_search_text_rows',
    where:            'kind = \'part\'',
    sizing:           input.sizing,
    ftsMode:          input.ftsMode === 'incremental' ? 'external-content' : undefined,
    deleteStatements: ['DELETE FROM magic_search_text_rows WHERE kind = \'part\';'],
    onAfterCount:     rows => {
      nextTextId += rows;
    },
  });

  for (const descriptor of input.manifest.packages) {
    if (descriptor.role !== 'locale') continue;
    const reader = input.packages.locales[descriptor.locale]!;
    yield* insertTableBatches({
      reader,
      table:            'magic_search_candidates',
      sizing:           input.sizing,
      deleteStatements: ['DELETE FROM magic_search_candidates;'],
    });
    yield* insertTableBatches({
      reader,
      table:            'magic_search_card_part_localizations',
      sizing:           input.sizing,
      deleteStatements: ['DELETE FROM magic_search_card_part_localizations;'],
    });
    yield* insertTableBatches({
      reader,
      table:            'magic_search_text_rows',
      where:            'kind = \'localization\'',
      sizing:           input.sizing,
      transform:        row => ({ ...row, text_id: nextTextId++ }),
      ftsMode:          input.ftsMode === 'incremental' ? 'external-content' : undefined,
      deleteStatements: [
        `DELETE FROM magic_search_text_rows WHERE kind = 'localization' AND locale = ${sqlLiteral(descriptor.locale)};`,
      ],
    });
  }

  if (input.ftsMode === 'rebuild') {
    yield {
      role:       'fts',
      table:      null,
      final:      true,
      statements: ['INSERT INTO magic_search_text_fts(magic_search_text_fts) VALUES (\'rebuild\');'],
    };
  }
  yield {
    role:       'meta',
    table:      null,
    final:      true,
    statements: [
      `INSERT INTO magic_search_meta (key, value) VALUES ('data_version', ${sqlLiteral(input.manifest.dataVersion)});`,
      `INSERT INTO magic_search_meta (key, value) VALUES ('release_hash', ${sqlLiteral(input.manifest.releaseHash)});`,
      `INSERT INTO magic_search_meta (key, value) VALUES ('schema_version', ${sqlLiteral(String(input.manifest.schemaVersion))});`,
      'INSERT INTO magic_search_meta (key, value) VALUES (\'ready\', \'1\');',
    ],
  };
}

/** Writes one complete Magic D1 snapshot SQL file from package files on disk. */
export async function writeMagicD1Snapshot(input: {
  outputPath:   string;
  manifest:     SearchPublicationManifest & { game: 'magic' };
  packagePaths: MagicPackagePaths;
  openReader(path: string, game: 'magic' | 'hearthstone'): Promise<SearchSnapshotReader>;
  ftsMode?:     'rebuild' | 'incremental';
}): Promise<void> {
  const output = createWriteStream(input.outputPath, { flags: 'wx' });
  try {
    await once(output, 'open');
    const baseReader = await input.openReader(input.packagePaths.base, 'magic');
    const localeReaders: Record<string, SearchSnapshotReader> = {};
    try {
      for (const [locale, path] of Object.entries(input.packagePaths.locales)) {
        localeReaders[locale] = await input.openReader(path, 'magic');
      }
      for await (const batch of generateMagicD1SnapshotBatches({
        manifest: input.manifest,
        packages: { base: baseReader, locales: localeReaders },
        ftsMode:  input.ftsMode ?? 'rebuild',
        sizing:   MAGIC_SIZING,
      })) {
        for (const statement of batch.statements) await writeText(output, `${statement}\n`);
      }
      output.end();
      await once(output, 'finish');
    } finally {
      baseReader.close();
      for (const reader of Object.values(localeReaders)) reader.close();
    }
  } catch (error) {
    output.destroy();
    await unlink(input.outputPath).catch(() => {});
    throw error;
  }
}

/** Validates a package's embedded role, locale, schema, and logical data version. */
function assertPackageMetadata(
  reader: SearchSnapshotReader,
  manifest: SearchPublicationManifest,
  role: 'base' | 'locale',
  locale: string | null,
): void {
  const metadata = reader.readMeta();
  if (metadata.get('ready') !== '1'
    || metadata.get('data_version') !== manifest.dataVersion
    || Number(metadata.get('schema_version')) !== manifest.schemaVersion
    || metadata.get('package_role') !== role
    || (role === 'locale' && metadata.get('locale') !== locale)) {
    throw new Error('A local Magic package does not match the selected release.');
  }
}

/** Streams one table as insert batches, keeping every statement's table segment parents-first safe. */
async function* insertTableBatches(input: {
  reader:            SearchSnapshotReader;
  table:             string;
  where?:            string;
  sizing:            MagicD1SnapshotSizing;
  transform?:        (row: Record<string, unknown>) => Record<string, unknown>;
  /** Emits one follow-up statement per row, such as incremental external-content FTS inserts. */
  ftsMode?:          'external-content';
  /** Exact-range deletes for this segment, attached to the first batch for idempotent replay. */
  deleteStatements?: string[];
  /** Receives the segment row count before the closing batch is yielded. */
  onAfterCount?:     (rows: number) => void;
}): AsyncGenerator<SearchSnapshotBatch> {
  const columns = input.reader.tableColumns(input.table);
  const selected = columns.map(quoteIdentifier).join(', ');
  let statements: string[] = [];
  let bytes = 0;
  let count = 0;
  let first = true;
  for (const sourceRow of input.reader.iterateRows(input.table, input.where)) {
    const row = input.transform?.(sourceRow) ?? sourceRow;
    const values = columns.map(column => sqlLiteral(row[column]));
    const statement = `INSERT INTO ${quoteIdentifier(input.table)} (${selected}) VALUES (${values.join(', ')});`;
    statements.push(statement);
    bytes += statement.length;
    if (input.ftsMode === 'external-content') {
      const ftsStatement = externalContentFtsStatement(input.table, row);
      statements.push(ftsStatement);
      bytes += ftsStatement.length;
    }
    count++;
    if (statements.length >= input.sizing.maxStatements || bytes >= input.sizing.maxBytes) {
      yield {
        role:  'insert',
        table: input.table,
        final: false,
        statements,
        ...(first ? { deleteStatements: input.deleteStatements } : {}),
      };
      first = false;
      statements = [];
      bytes = 0;
    }
  }
  input.onAfterCount?.(count);
  yield {
    role:         'insert',
    table:        input.table,
    final:        true,
    expectedRows: count,
    statements,
    ...(first ? { deleteStatements: input.deleteStatements } : {}),
  };
}

/** Builds the incremental FTS companion statement for one text row. */
function externalContentFtsStatement(table: string, row: Record<string, unknown>): string {
  const ftsTable = table.replace(/_text_rows$/, '_text_fts');
  const rowid = row.text_id;
  const body = row.body;
  if (typeof rowid !== 'number' || typeof body !== 'string') {
    throw new Error(`The "${table}" row is missing its text identity or body.`);
  }
  return `INSERT INTO ${quoteIdentifier(ftsTable)}(rowid, body) VALUES (${rowid}, ${sqlLiteral(body)});`;
}

/** Reads the FTS5 definition used by both D1 and local search packages. */
export async function magicSearchFtsSql(): Promise<string> {
  return await readFile(
    fileURLToPath(import.meta.resolve('@tcg-cards/db/schema/sqlite/magic/search-fts.sql')),
    'utf8',
  );
}

/** Writes SQL without buffering the full D1 snapshot in memory. */
async function writeText(output: WriteStream, value: string): Promise<void> {
  if (!output.write(value)) await once(output, 'drain');
}

/** Escapes a SQLite table or column name selected from the fixed search schema. */
function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/** Preserves arbitrary UTF-8 text and scalar values in a generated SQL statement. */
function sqlLiteral(value: unknown): string {
  if (value == null) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') {
    if (value.includes('\0')) return `CAST(X'${Buffer.from(value, 'utf8').toString('hex')}' AS TEXT)`;
    return `'${value.replaceAll('\'', '\'\'')}'`;
  }
  throw new Error('A local Magic package contains an unsupported SQL value.');
}
