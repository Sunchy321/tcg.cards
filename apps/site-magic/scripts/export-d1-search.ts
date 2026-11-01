import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import { Database } from 'bun:sqlite';

import {
  LOCAL_SEARCH_SCHEMA_VERSIONS,
  searchPublicationManifest,
  searchReleaseIdentityJson,
  validateSearchPublicationLocales,
} from '@tcg-cards/model/search/publication';
import type { SearchPublicationManifest } from '@tcg-cards/model/search/publication';
import { writeMagicD1Snapshot } from './d1-snapshot';

/** Exports one transactional D1 update file from a verified Magic package release. */
async function main(): Promise<void> {
  const output = process.argv[2];
  const manifestFile = process.argv[3];
  if (output == null || manifestFile == null) {
    throw new Error('Pass a new output .sql path followed by search-publication-manifest.json.');
  }
  const outputPath = resolve(output);
  const manifestPath = resolve(manifestFile);
  if (await Bun.file(outputPath).exists()) throw new Error('The SQL output already exists; choose a new path.');

  const manifest = validateSearchPublicationLocales(searchPublicationManifest.parse(JSON.parse(
    await Bun.file(manifestPath).text(),
  )));
  if (manifest.game !== 'magic' || manifest.schemaVersion !== LOCAL_SEARCH_SCHEMA_VERSIONS.magic) {
    throw new Error('The release manifest does not match this Magic schema.');
  }
  const releaseHash = createHash('sha256').update(searchReleaseIdentityJson(manifest)).digest('hex');
  if (releaseHash !== manifest.releaseHash) throw new Error('The release manifest failed its content identity check.');

  const directory = dirname(manifestPath);
  const localePaths: Record<string, string> = {};
  for (const descriptor of manifest.packages) {
    const packagePath = descriptor.role === 'base'
      ? join(directory, 'magic-base.sqlite')
      : join(directory, `magic-${descriptor.locale}.sqlite`);
    await verifyPackage(packagePath, descriptor.sha256, descriptor.bytes);
    const database = new Database(packagePath, { readonly: true });
    try {
      assertPackage(database, manifest, descriptor.role, descriptor.role === 'locale' ? descriptor.locale : null);
    } finally {
      database.close();
    }
    if (descriptor.role === 'locale') localePaths[descriptor.locale] = packagePath;
  }

  await writeMagicD1Snapshot({
    outputPath,
    manifest:     manifest as SearchPublicationManifest & { game: 'magic' },
    packagePaths: {
      base:    join(directory, 'magic-base.sqlite'),
      locales: localePaths,
    },
  });
}

/** Confirms that one file still matches the immutable package description. */
async function verifyPackage(path: string, expectedHash: string, expectedBytes: number): Promise<void> {
  const [metadata, hash] = await Promise.all([stat(path), sha256File(path)]);
  if (metadata.size !== expectedBytes || hash !== expectedHash) {
    throw new Error('A local Magic package does not match the release manifest.');
  }
}

/** Verifies the embedded role, locale, schema, and logical data version. */
function assertPackage(
  database: Database,
  manifest: SearchPublicationManifest,
  role: 'base' | 'locale',
  locale: string | null,
): void {
  const rows = database.query('SELECT key, value FROM magic_search_meta').all() as Array<{ key: string, value: string }>;
  const metadata = new Map(rows.map(row => [row.key, row.value]));
  if (metadata.get('ready') !== '1'
    || metadata.get('package_role') !== role
    || metadata.get('data_version') !== manifest.dataVersion
    || Number(metadata.get('schema_version')) !== manifest.schemaVersion
    || (role === 'locale' && metadata.get('locale') !== locale)) {
    throw new Error('A local Magic package does not match the release manifest.');
  }
}

/** Streams a SQLite file through SHA-256 without loading it into memory. */
async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

if (import.meta.main) await main();
