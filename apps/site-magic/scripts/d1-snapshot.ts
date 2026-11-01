import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { unlink } from 'node:fs/promises';
import type { WriteStream } from 'node:fs';
import { Database } from 'bun:sqlite';

import type { SearchPublicationManifest } from '@tcg-cards/model/search/publication';

/** Names the package files that make up one validated Magic release. */
export type MagicPackagePaths = {
  base:    string;
  locales: Record<string, string>;
};

/** Writes one replace-in-place D1 snapshot from the exact files in a release manifest. */
export async function writeMagicD1Snapshot(input: {
  outputPath:   string;
  manifest:     SearchPublicationManifest & { game: 'magic' };
  packagePaths: MagicPackagePaths;
}): Promise<void> {
  const output = createWriteStream(input.outputPath, { flags: 'wx' });
  try {
    await once(output, 'open');
    await writeText(output, `${await magicSearchFtsSql()}\n`);
    await writeText(output, [
      'DELETE FROM magic_search_meta;',
      'DELETE FROM magic_search_text_rows;',
      'DELETE FROM magic_search_candidates;',
      'DELETE FROM magic_search_card_part_localizations;',
      'DELETE FROM magic_search_part_values;',
      'DELETE FROM magic_search_card_values;',
      'DELETE FROM magic_search_card_parts;',
      'DELETE FROM magic_search_cards;',
      '',
    ].join('\n'));

    const base = new Database(input.packagePaths.base, { readonly: true });
    let nextTextId = 1;
    try {
      assertPackageMetadata(base, input.manifest, 'base', null);
      await copyTable(output, base, 'magic_search_cards');
      await copyTable(output, base, 'magic_search_card_parts');
      await copyTable(output, base, 'magic_search_card_values');
      await copyTable(output, base, 'magic_search_part_values');
      nextTextId += await copyTable(output, base, 'magic_search_text_rows', {
        where: 'kind = \'part\'',
      });
    } finally {
      base.close();
    }

    for (const localePackage of input.manifest.packages) {
      if (localePackage.role !== 'locale') continue;
      const packagePath = input.packagePaths.locales[localePackage.locale];
      if (packagePath == null) throw new Error(`Missing local package for ${localePackage.locale}.`);
      const localeDb = new Database(packagePath, { readonly: true });
      try {
        assertPackageMetadata(localeDb, input.manifest, 'locale', localePackage.locale);
        await copyTable(output, localeDb, 'magic_search_candidates');
        await copyTable(output, localeDb, 'magic_search_card_part_localizations');
        await copyTable(output, localeDb, 'magic_search_text_rows', {
          where:     'kind = \'localization\'',
          transform: row => ({ ...row, text_id: nextTextId++ }),
        });
      } finally {
        localeDb.close();
      }
    }

    await writeText(output, [
      'INSERT INTO magic_search_text_fts(magic_search_text_fts) VALUES (\'rebuild\');',
      `INSERT INTO magic_search_meta (key, value) VALUES ('data_version', ${sqlLiteral(input.manifest.dataVersion)});`,
      `INSERT INTO magic_search_meta (key, value) VALUES ('release_hash', ${sqlLiteral(input.manifest.releaseHash)});`,
      `INSERT INTO magic_search_meta (key, value) VALUES ('schema_version', ${sqlLiteral(String(input.manifest.schemaVersion))});`,
      'INSERT INTO magic_search_meta (key, value) VALUES (\'ready\', \'1\');',
      '',
    ].join('\n'));
    output.end();
    await once(output, 'finish');
  } catch (error) {
    output.destroy();
    await unlink(input.outputPath).catch(() => {});
    throw error;
  }
}

/** Copies one known SQLite table into the D1 import file in row order. */
async function copyTable(
  output: WriteStream,
  source: Database,
  table: string,
  options: { where?: string, transform?: (row: Record<string, unknown>) => Record<string, unknown> } = {},
): Promise<number> {
  const columns = source.query(`PRAGMA table_info(${quoteIdentifier(table)})`).all()
    .map(row => String((row as { name: string }).name));
  if (columns.length === 0) throw new Error(`The local package is missing ${table}.`);
  const selectedColumns = columns.map(quoteIdentifier).join(', ');
  const where = options.where == null ? '' : ` WHERE ${options.where}`;
  const statement = source.query(`SELECT ${selectedColumns} FROM ${quoteIdentifier(table)}${where} ORDER BY rowid`);
  let count = 0;
  let pending = '';
  for (const sourceRow of statement.iterate()) {
    const row = options.transform?.(sourceRow as Record<string, unknown>) ?? sourceRow as Record<string, unknown>;
    const values = columns.map(column => sqlLiteral(row[column]));
    pending += `INSERT INTO ${quoteIdentifier(table)} (${selectedColumns}) VALUES (${values.join(', ')});\n`;
    count++;
    if (count % 500 === 0) {
      await writeText(output, pending);
      pending = '';
    }
  }
  if (pending !== '') await writeText(output, pending);
  return count;
}

/** Checks a package's embedded identity before its rows enter the D1 snapshot. */
function assertPackageMetadata(
  database: Database,
  manifest: SearchPublicationManifest,
  role: 'base' | 'locale',
  locale: string | null,
): void {
  const metadata = database.query('SELECT key, value FROM magic_search_meta').all() as Array<{ key: string, value: string }>;
  const values = new Map(metadata.map(row => [row.key, row.value]));
  if (values.get('ready') !== '1'
    || values.get('data_version') !== manifest.dataVersion
    || Number(values.get('schema_version')) !== manifest.schemaVersion
    || values.get('package_role') !== role
    || (role === 'locale' && values.get('locale') !== locale)) {
    throw new Error('A local Magic package does not match the selected release.');
  }
}

/** Reads the FTS5 definition used by both D1 and local search packages. */
async function magicSearchFtsSql(): Promise<string> {
  return await Bun.file(new URL(import.meta.resolve('@tcg-cards/db/schema/sqlite/magic/search-fts.sql'))).text();
}

/** Writes SQL without buffering the full D1 snapshot in memory. */
async function writeText(output: WriteStream, value: string): Promise<void> {
  if (!output.write(value)) await once(output, 'drain');
}

/** Escapes a SQLite table name selected from the fixed search schema. */
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
