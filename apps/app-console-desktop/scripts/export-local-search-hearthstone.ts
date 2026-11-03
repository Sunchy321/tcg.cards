import { mkdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Database } from 'bun:sqlite';
import { eq, getColumns, isNull, sql } from 'drizzle-orm';
import type { SQLWrapper } from 'drizzle-orm';

import { createDb } from '@tcg-cards/db';
import { SearchCard, SearchCardLocalization } from '@tcg-cards/db/schema/shared/hearthstone/search';
import { SearchPublicationMetadata } from '@tcg-cards/db/schema/remote';
import { fingerprintSearchProjection } from '@tcg-cards/db/search-fingerprint';
import { LatestCardEntityView } from '@tcg-cards/db/schema/shared/hearthstone/entity';
import { Patch } from '@tcg-cards/db/schema/shared/hearthstone/patch';
import { essentialCardSearchItem } from '@tcg-cards/model/hearthstone/schema/search';
import { locale } from '@tcg-cards/model/hearthstone/schema/basic';
import { pickSimpleTags } from '@tcg-cards/model/hearthstone/search/manifest';
import {
  createSnapshotStatements,
  hearthstoneSearchFtsSql,
  projectedSearchQuery,
  snapshotRows,
} from '../electron/runtime/lib/search-publication/snapshot';
import { hearthstoneSnapshotDdl } from './lib/search-database-ddl';

/** Builds a version-matched base package and the requested locale deltas. */
async function main(): Promise<void> {
  const connection = process.env.DATABASE_URL ?? process.env.DESKTOP_LOCAL_DATABASE_URL;
  const output = process.argv[2];
  const requestedLocales = process.argv.slice(3);
  if (connection == null || output == null || requestedLocales.length === 0) {
    throw new Error(
      'Set DATABASE_URL and pass a new output directory followed by one or more locale codes.',
    );
  }
  const locales = [...new Set(requestedLocales)];
  if (locales.length !== requestedLocales.length || locales.some(value => !locale.options.includes(value as (typeof locale.options)[number]))) {
    throw new Error('Locale arguments must be supported, unique Hearthstone locale codes.');
  }

  const outputDirectory = resolve(output);
  await mkdir(outputDirectory, { recursive: true });
  const outputFiles = [
    `${outputDirectory}/hearthstone-base.sqlite`,
    ...locales.map(value => `${outputDirectory}/hearthstone-${value}.sqlite`),
    `${outputDirectory}/search-publication-input.json`,
  ];
  for (const file of outputFiles) {
    if (await Bun.file(file).exists() || await Bun.file(`${file}.json`).exists()) {
      throw new Error(`Refusing to overwrite an existing local search package: ${file}`);
    }
  }

  const database = createDb(connection);
  try {
    const snapshot = await database.transaction(
      async tx => {
        const [caseMapping] = await tx.execute<{ folded: string }>(
          sql`SELECT lower('ABCDEFGHIJKLMNOPQRSTUVWXYZ') AS folded`,
        );
        if (caseMapping?.folded !== 'abcdefghijklmnopqrstuvwxyz') {
          throw new Error('The source collation has nonportable ASCII case folding.');
        }
        const [latest] = await tx
          .select({ buildNumber: sql<number>`max(${Patch.buildNumber})` })
          .from(Patch);
        if (latest?.buildNumber == null) {
          throw new Error('No latest Hearthstone build is available.');
        }
        const {
          createdAt: _created,
          updatedAt: _updated,
          deletedAt: _deleted,
          ...columns
        } = getColumns(SearchCard);
        const projected = await projectedSearchQuery(tx);
        const activeCards = await tx.select().from(SearchCard).where(isNull(SearchCard.deletedAt))
          .orderBy(SearchCard.cardId);
        const activeLocalizations = await tx.select().from(SearchCardLocalization)
          .where(isNull(SearchCardLocalization.deletedAt))
          .orderBy(SearchCardLocalization.cardId, SearchCardLocalization.lang);
        const pgFingerprint = fingerprintSearchProjection([
          ['cards', activeCards],
          ['localizations', activeLocalizations],
        ]);
        const [publication] = await tx.select().from(SearchPublicationMetadata)
          .where(eq(SearchPublicationMetadata.game, 'hearthstone'));
        const planner = publication?.plannerMetadata as { buildNumber?: unknown } | undefined;
        if (publication == null || !publication.ready || publication.dataVersion !== String(latest.buildNumber)
          || publication.pgFingerprint !== pgFingerprint || planner?.buildNumber !== latest.buildNumber) {
          throw new Error('The Hearthstone search projection has no matching completed publication metadata. Rebuild it in the desktop runtime first.');
        }
        const sourceColumns = Object.fromEntries(
          Object.keys(columns)
            .filter(key => key !== 'simpleTags')
            .map(key => [
              key,
              sql`${LatestCardEntityView[key as keyof typeof LatestCardEntityView] as SQLWrapper}`,
            ]),
        );
        const source = await tx
          .select({
            ...sourceColumns,
            lang:         LatestCardEntityView.lang,
            renderHash:   LatestCardEntityView.renderHash,
            mechanics:    LatestCardEntityView.mechanics,
            localization: {
              name: sql<string>`${LatestCardEntityView.localization.name}`,
              text: sql<string>`${LatestCardEntityView.localization.text}`,
            },
          })
          .from(LatestCardEntityView)
          .orderBy(LatestCardEntityView.cardId, LatestCardEntityView.lang);
        const rows = snapshotRows(projected);
        const expected = source.map(row =>
          essentialCardSearchItem
            .strip()
            .parse({ ...row, simpleTags: pickSimpleTags(row.mechanics) }),
        );
        const items = rows.map(
          ({ idOrder: _id, setOrder: _set, nameOrder: _name, ...item }) => item,
        );
        if (JSON.stringify(items) !== JSON.stringify(expected)) {
          throw new Error(
            'The PG search projection differs from the latest source facts; rebuild it with the desktop runtime first.',
          );
        }
        return {
          rows,
          manifest: { dataVersion: publication.dataVersion, buildNumber: latest.buildNumber },
          pgFingerprint,
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );

    for (const value of locales) {
      if (!snapshot.rows.some(row => row.lang === value)) {
        throw new Error(`The latest Hearthstone projection has no rows for locale ${value}.`);
      }
    }

    const ddl = hearthstoneSnapshotDdl();
    const fts = await hearthstoneSearchFtsSql();
    console.log(JSON.stringify({ phase: 'source-verified', rows: snapshot.rows.length, locales }));
    const basePath = outputFiles[0]!;
    console.log(JSON.stringify({ phase: 'writing', packageRole: 'base', output: basePath }));
    await writeDatabase(
      basePath,
      ddl,
      fts,
      createSnapshotStatements(snapshot.rows, snapshot.manifest, { kind: 'base' }),
    );
    await writeManifest(basePath, {
      ...snapshot.manifest,
      packageRole: 'base',
      rows:        new Set(snapshot.rows.map(row => row.cardId)).size,
    });
    console.log(JSON.stringify({ phase: 'written', packageRole: 'base', output: basePath, bytes: (await stat(basePath)).size }));

    for (const [index, value] of locales.entries()) {
      const rows = snapshot.rows.filter(row => row.lang === value);
      const outputPath = outputFiles[index + 1]!;
      console.log(JSON.stringify({ phase: 'writing', packageRole: 'locale', locale: value, output: outputPath }));
      await writeDatabase(
        outputPath,
        ddl,
        fts,
        createSnapshotStatements(snapshot.rows, snapshot.manifest, { kind: 'locale', locale: value }),
      );
      await writeManifest(outputPath, {
        ...snapshot.manifest,
        packageRole: 'locale',
        locale:      value,
        rows:        rows.length,
      });
      console.log(JSON.stringify({ phase: 'written', packageRole: 'locale', locale: value, output: outputPath, bytes: (await stat(outputPath)).size }));
    }
    await Bun.write(`${outputDirectory}/search-publication-input.json`, `${JSON.stringify({
      game:          'hearthstone',
      pgFingerprint: snapshot.pgFingerprint,
      buildNumber:   snapshot.manifest.buildNumber,
    }, null, 2)}\n`);
  } finally {
    await database.$client.end({ timeout: 0 });
  }
}

/** Creates one immutable package from Drizzle schema SQL and bounded snapshot inserts. */
async function writeDatabase(path: string, ddl: string, fts: string, inserts: string[]): Promise<void> {
  const database = new Database(path);
  try {
    database.exec('PRAGMA foreign_keys = OFF');
    database.exec(ddl);
    database.exec(fts);
    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec(inserts.join('\n'));
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  } finally {
    database.close();
  }
}

/** Writes a small sidecar with package identity and on-disk size. */
async function writeManifest(path: string, metadata: Record<string, unknown>): Promise<void> {
  await Bun.write(
    `${path}.json`,
    `${JSON.stringify({ ...metadata, bytes: (await stat(path)).size }, null, 2)}\n`,
  );
}

if (import.meta.main) {
  await main();
}
