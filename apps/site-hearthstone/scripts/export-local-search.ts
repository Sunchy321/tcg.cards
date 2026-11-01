import { randomUUID } from 'node:crypto';
import { mkdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Database } from 'bun:sqlite';
import postgres from 'postgres';
import { getColumns, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { SQLWrapper } from 'drizzle-orm';

import { SearchCard } from '@tcg-cards/db/schema/shared/hearthstone/search';
import { LatestCardEntityView } from '@tcg-cards/db/schema/shared/hearthstone/entity';
import { Patch } from '@tcg-cards/db/schema/shared/hearthstone/patch';
import { essentialCardSearchItem } from '@tcg-cards/model/hearthstone/schema/search';
import { locale } from '@tcg-cards/model/hearthstone/schema/basic';
import { pickSimpleTags } from '@tcg-cards/model/hearthstone/search/manifest';
import { snapshotDdl, createSnapshotStatements } from './d1-snapshot';
import { projectedSearchQuery, snapshotRows } from './d1-source';

/** Builds a version-matched base package and the requested locale deltas. */
async function main(): Promise<void> {
  const connection = process.env.DATABASE_URL;
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
  ];
  for (const file of outputFiles) {
    if (await Bun.file(file).exists() || await Bun.file(`${file}.json`).exists()) {
      throw new Error(`Refusing to overwrite an existing local search package: ${file}`);
    }
  }

  const client = postgres(connection, { max: 1 });
  try {
    const snapshot = await drizzle({ client }).transaction(
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
          manifest: { dataVersion: randomUUID(), buildNumber: latest.buildNumber },
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );

    for (const value of locales) {
      if (!snapshot.rows.some(row => row.lang === value)) {
        throw new Error(`The latest Hearthstone projection has no rows for locale ${value}.`);
      }
    }

    const ddl = snapshotDdl();
    const fts = await Bun.file(
      new URL(import.meta.resolve('@tcg-cards/db/schema/sqlite/hearthstone/search-fts.sql')),
    ).text();
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
  } finally {
    await client.end();
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
