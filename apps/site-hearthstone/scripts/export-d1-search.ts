import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { getColumns, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { SQLWrapper } from 'drizzle-orm';

import { SearchCard } from '@tcg-cards/db/schema/shared/hearthstone/search';
import { LatestCardEntityView } from '@tcg-cards/db/schema/shared/hearthstone/entity';
import { Patch } from '@tcg-cards/db/schema/shared/hearthstone/patch';
import { essentialCardSearchItem } from '@tcg-cards/model/hearthstone/schema/search';
import { pickSimpleTags } from '@tcg-cards/model/hearthstone/search/manifest';
import {
  searchPublicationManifest,
  searchReleaseIdentityJson,
  validateSearchPublicationLocales,
} from '@tcg-cards/model/search/publication';
import { createSnapshotSql } from './d1-snapshot';
import { projectedSearchQuery, snapshotRows } from './d1-source';

/** Captures and verifies one latest projection before creating an immutable D1 import artifact. */
async function main(): Promise<void> {
  const connection = process.env.DATABASE_URL;
  const output = process.argv[2];
  const releaseManifestPath = process.argv[3];
  if (connection == null || output == null || releaseManifestPath == null) {
    throw new Error(
      'Set DATABASE_URL and pass a new output .sql path followed by search-publication-manifest.json. This command only exports; it does not publish.',
    );
  }
  const outputPath = resolve(output);
  if ((await Bun.file(outputPath).exists()) || (await Bun.file(`${outputPath}.json`).exists())) {
    throw new Error('The snapshot output already exists; choose a new path.');
  }
  const client = postgres(connection, { max: 1 });
  try {
    const snapshot = await drizzle(client).transaction(
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
        // Compare selected source facts in the same read snapshot. A sidecar label alone
        // cannot prove that existing PG projection rows still represent the latest patch.
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
        const pgFingerprint = fingerprintProjection(rows);
        const releaseManifest = validateSearchPublicationLocales(searchPublicationManifest.parse(JSON.parse(
          await readFile(resolve(releaseManifestPath), 'utf8'),
        )));
        const releaseHash = createHash('sha256')
          .update(searchReleaseIdentityJson(releaseManifest))
          .digest('hex');
        if (releaseManifest.game !== 'hearthstone'
          || releaseManifest.pgFingerprint !== pgFingerprint
          || releaseManifest.dataVersion !== String(latest.buildNumber)
          || releaseManifest.buildNumber !== latest.buildNumber
          || releaseHash !== releaseManifest.releaseHash) {
          throw new Error('The search package manifest does not match the current Hearthstone projection.');
        }
        const manifest = {
          dataVersion: String(latest.buildNumber),
          buildNumber: latest.buildNumber,
          releaseHash: releaseManifest.releaseHash,
        };
        return {
          rows,
          manifest,
          pgFingerprint,
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
    const fts = await Bun.file(
      new URL(import.meta.resolve('@tcg-cards/db/schema/sqlite/hearthstone/search-fts.sql')),
    ).text();
    const sqlFile = `-- Apply this complete snapshot to an initialized Hearthstone search database.\n${fts}\n${createSnapshotSql(snapshot.rows, snapshot.manifest, { kind: 'combined', replace: true })}`;
    await Bun.write(outputPath, sqlFile);
    await Bun.write(
      `${outputPath}.json`,
      JSON.stringify(
        {
          ...snapshot.manifest,
          pgFingerprint: snapshot.pgFingerprint,
          rows:          snapshot.rows.length,
          bytes:         Buffer.byteLength(sqlFile),
        },
        null,
        2,
      ) + '\n',
    );
    console.log(
      JSON.stringify({ output: outputPath, ...snapshot.manifest, rows: snapshot.rows.length }),
    );
  } finally {
    await client.end();
  }
}

/** Hashes stable projected rows so repeated exports of the same build keep one identity. */
function fingerprintProjection(rows: object[]): string {
  const hash = createHash('sha256');
  for (const row of rows) {
    const stable = Object.fromEntries(Object.entries(row).filter(([key]) =>
      key !== 'createdAt' && key !== 'updatedAt' && key !== 'deletedAt'));
    hash.update(JSON.stringify(stable)).update('\n');
  }
  return hash.digest('hex');
}

if (import.meta.main) {
  await main();
}
