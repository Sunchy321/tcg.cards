import { randomUUID } from 'node:crypto';
import { mkdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Database } from 'bun:sqlite';
import postgres from 'postgres';
import { and, inArray, isNull } from 'drizzle-orm';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';

import {
  SearchCard as SourceSearchCard,
  SearchCardPart as SourceSearchCardPart,
  SearchCardPartLocalization as SourceSearchCardPartLocalization,
} from '@tcg-cards/db/schema/shared/magic/search';
import { locale } from '@tcg-cards/model/magic/schema/basic';
import type { MagicSearchCandidatePrint } from '@tcg-cards/model/magic/search/manifest';

type LocaleCode = (typeof locale.options)[number];

/** Holds one repeatable-read source snapshot for a base or locale package. */
type SnapshotInput = {
  cards:         Array<typeof SourceSearchCard.$inferSelect>;
  parts:         Array<typeof SourceSearchCardPart.$inferSelect>;
  localizations: Array<typeof SourceSearchCardPartLocalization.$inferSelect>;
  dataVersion:   string;
  locale?:       LocaleCode;
  packageRole:   'base' | 'locale';
};

/** Writes one package with reused prepared statements inside the caller's transaction. */
function populateSnapshot(database: Database, input: SnapshotInput): void {
  const insertCard = database.prepare(
    'INSERT INTO magic_search_cards (card_id, version, ambit, mana_value) VALUES (?, ?, ?, ?)',
  );
  const insertCardValue = database.prepare(
    'INSERT INTO magic_search_card_values (card_id, version, field, value) VALUES (?, ?, ?, ?)',
  );
  const insertPart = database.prepare(`
    INSERT INTO magic_search_card_parts (
      card_id, version, part_index, name, typeline, power, toughness, loyalty,
      defense, hand_modifier, life_modifier
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertPartValue = database.prepare(
    'INSERT INTO magic_search_part_values (card_id, version, part_index, field, value) VALUES (?, ?, ?, ?, ?)',
  );
  const insertText = database.prepare(`
    INSERT INTO magic_search_text_rows (
      text_id, kind, card_id, version, part_index, locale, source, body
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertCandidate = database.prepare(`
    INSERT INTO magic_search_candidates (
      card_id, version, request_locale, set_code, number, print_lang, print_source,
      release_date, layout, image_type, image_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertLocalization = database.prepare(`
    INSERT INTO magic_search_card_part_localizations (
      card_id, version, locale, source, part_index, name, ruby_name, typeline
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertMeta = database.prepare(
    'INSERT INTO magic_search_meta (key, value) VALUES (?, ?)',
  );
  let textId = 0;

  if (input.packageRole === 'base') {
    for (const card of input.cards) {
      insertCard.run(card.cardId, card.version, card.ambit, card.manaValue);
      for (const [field, values] of Object.entries({
        colorIdentity: [...card.colorIdentity],
        tags:          card.tags,
        rarity:        card.rarities,
        legality:      Object.entries(card.legalities).map(([format, status]) => `${format}=${status}`),
      })) {
        for (const value of values) {
          insertCardValue.run(card.cardId, card.version, field, value);
        }
      }
    }

    for (const part of input.parts) {
      insertPart.run(
        part.cardId,
        part.version,
        part.partIndex,
        part.name,
        part.typeline,
        part.power,
        part.toughness,
        part.loyalty,
        part.defense,
        part.handModifier,
        part.lifeModifier,
      );
      for (const [field, values] of Object.entries({
        color:          part.color == null ? [] : [...part.color],
        colorIndicator: part.colorIndicator == null ? [] : [...part.colorIndicator],
        typeSuper:      part.typeSuper ?? [],
        typeMain:       part.typeMain,
        typeSub:        part.typeSub ?? [],
      })) {
        for (const value of values) {
          insertPartValue.run(part.cardId, part.version, part.partIndex, field, value);
        }
      }
      insertText.run(++textId, 'part', part.cardId, part.version, part.partIndex, null, null, part.text);
    }
  } else {
    const requestLocale = input.locale!;
    for (const card of input.cards) {
      const candidate = card.candidatePrintsByLocale[requestLocale] as MagicSearchCandidatePrint | undefined;
      if (candidate == null) {
        continue;
      }
      insertCandidate.run(
        card.cardId,
        card.version,
        requestLocale,
        candidate.set,
        candidate.number,
        candidate.lang,
        candidate.source,
        candidate.releaseDate,
        candidate.layout,
        candidate.imageType,
        candidate.imageStatus,
      );
    }
    for (const row of input.localizations) {
      insertLocalization.run(
        row.cardId,
        row.version,
        row.locale,
        row.source,
        row.partIndex,
        row.name,
        row.rubyName,
        row.typeline,
      );
      insertText.run(++textId, 'localization', row.cardId, row.version, row.partIndex, row.locale, row.source, row.text);
    }
  }

  const metadata = [
    ['data_version', input.dataVersion],
    ['ready', '1'],
    ['package_role', input.packageRole],
    ...(input.packageRole === 'locale' ? [['locale', input.locale!]] : []),
  ];
  database.exec('INSERT INTO magic_search_text_fts(magic_search_text_fts) VALUES (\'rebuild\')');
  for (const [key, value] of metadata) {
    insertMeta.run(key, value);
  }
}

/** Generates a same-version base and the requested locale deltas from the PG projection. */
async function main(): Promise<void> {
  const connection = process.env.DATABASE_URL;
  const output = process.argv[2];
  const requestedLocales = process.argv.slice(3);
  if (connection == null || output == null || requestedLocales.length === 0) {
    throw new Error('Set DATABASE_URL and pass a new output directory followed by locale codes.');
  }
  const locales = [...new Set(requestedLocales)] as LocaleCode[];
  if (locales.length !== requestedLocales.length || locales.some(value => !locale.options.includes(value))) {
    throw new Error('Locale arguments must be supported, unique Magic locale codes.');
  }
  const outputDirectory = resolve(output);
  await mkdir(outputDirectory, { recursive: true });
  const outputFiles = [
    `${outputDirectory}/magic-base.sqlite`,
    ...locales.map(value => `${outputDirectory}/magic-${value}.sqlite`),
  ];
  for (const file of outputFiles) {
    if (await Bun.file(file).exists() || await Bun.file(`${file}.json`).exists()) {
      throw new Error(`Refusing to overwrite an existing local search package: ${file}`);
    }
  }

  const client = postgres(connection, { max: 1 });
  try {
    const snapshot = await drizzlePostgres({ client }).transaction(
      async tx => {
        const cards = await tx.select().from(SourceSearchCard).where(isNull(SourceSearchCard.deletedAt))
          .orderBy(SourceSearchCard.cardId, SourceSearchCard.version);
        const parts = await tx.select().from(SourceSearchCardPart).where(isNull(SourceSearchCardPart.deletedAt))
          .orderBy(SourceSearchCardPart.cardId, SourceSearchCardPart.version, SourceSearchCardPart.partIndex);
        const localizations = await tx.select().from(SourceSearchCardPartLocalization)
          .where(and(
            isNull(SourceSearchCardPartLocalization.deletedAt),
            inArray(SourceSearchCardPartLocalization.locale, locales as LocaleCode[]),
          ))
          .orderBy(
            SourceSearchCardPartLocalization.cardId,
            SourceSearchCardPartLocalization.version,
            SourceSearchCardPartLocalization.partIndex,
            SourceSearchCardPartLocalization.locale,
            SourceSearchCardPartLocalization.source,
          );
        return { cards, parts, localizations, dataVersion: randomUUID() };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
    console.log(JSON.stringify({
      phase:         'source-loaded',
      cards:         snapshot.cards.length,
      parts:         snapshot.parts.length,
      localizations: snapshot.localizations.length,
      locales,
    }));

    const ddl = magicSnapshotDdl();
    const fts = await Bun.file(
      new URL(import.meta.resolve('@tcg-cards/db/schema/sqlite/magic/search-fts.sql')),
    ).text();
    const basePath = outputFiles[0]!;
    await writeDatabase(basePath, ddl, fts, {
      ...snapshot,
      packageRole: 'base',
    });
    await writeManifest(basePath, {
      dataVersion: snapshot.dataVersion,
      packageRole: 'base',
      rows:        snapshot.cards.length,
    });
    console.log(JSON.stringify({ packageRole: 'base', output: basePath, bytes: (await stat(basePath)).size }));

    for (const [index, value] of locales.entries()) {
      const localeRows = snapshot.localizations.filter(row => row.locale === value);
      const outputPath = outputFiles[index + 1]!;
      await writeDatabase(outputPath, ddl, fts, {
        ...snapshot,
        localizations: localeRows,
        locale:        value,
        packageRole:   'locale',
      });
      await writeManifest(outputPath, {
        dataVersion: snapshot.dataVersion,
        packageRole: 'locale',
        locale:      value,
        rows:        localeRows.length,
      });
      console.log(JSON.stringify({ packageRole: 'locale', locale: value, output: outputPath, bytes: (await stat(outputPath)).size }));
    }
  } finally {
    await client.end();
  }
}

/** Creates one SQLite file from the generated schema and the selected source rows. */
async function writeDatabase(path: string, ddl: string, fts: string, input: SnapshotInput): Promise<void> {
  const database = new Database(path);
  try {
    database.exec('PRAGMA foreign_keys = OFF');
    database.exec(ddl);
    database.exec(fts);
    database.exec('BEGIN IMMEDIATE');
    try {
      populateSnapshot(database, input);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  } finally {
    database.close();
  }
}

/** Writes package identity and file size next to the immutable SQLite database. */
async function writeManifest(path: string, metadata: Record<string, unknown>): Promise<void> {
  await Bun.write(`${path}.json`, `${JSON.stringify({ ...metadata, bytes: (await stat(path)).size }, null, 2)}\n`);
}

/** Exports the SQLite DDL from the Drizzle schema without creating a migration. */
function magicSnapshotDdl(): string {
  const result = Bun.spawnSync(['bun', 'run', '--filter', '@tcg-cards/db', 'db:export:magic-search']);
  if (result.exitCode !== 0) {
    throw new Error(`Magic Drizzle schema export failed: ${result.stderr.toString()}`);
  }
  const prefix = '@tcg-cards/db db:export:magic-search: ';
  return result.stdout.toString().split('\n')
    .filter(line => line.startsWith(prefix) && line !== `${prefix}Exited with code 0`)
    .map(line => line.slice(prefix.length))
    .join('\n');
}

if (import.meta.main) {
  await main();
}
