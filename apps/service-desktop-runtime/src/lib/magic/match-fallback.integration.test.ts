/**
 * Integration coverage for the foreign-only fallback anchor.
 *
 * An oracle whose every scryfall row is non-English (the live case is `psdg`,
 * the Japanese-only Sega Dreamcast promos) has no English anchor row. Match
 * must still give it a cardId and assembly must still assemble it, or the
 * whole projection stays blind to the set. The fallback anchors both sides on
 * the same representative row, so the match slug and the assembled cardId
 * agree; an anchor whose name reduces to an empty slug is held for review
 * instead of projecting a garbage cardId.
 *
 * Runs against the opt-in integration database, mirroring
 * `project/assemble.integration.test.ts`.
 */

import { afterAll, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createDb } from '@tcg-cards/db';
import { ScryfallCard } from '@tcg-cards/db/schema/local/magic';

import { assembleUnits } from './project/assemble';
import { matchBatch } from './match';

/** Opt-in integration database, shared with the other magic integration tests. */
const adminUrl = process.env.MAGIC_IMAGE_TEST_DATABASE_URL?.trim() ?? null;
const integrationTest = adminUrl == null ? test.skip : test;

const clients: Array<ReturnType<typeof createDb>> = [];
let setupDb: ReturnType<typeof createDb> | null = null;
let databaseName: string | null = null;

afterAll(async () => {
  for (const client of clients.splice(0)) {
    await client.$client.end({ timeout: 1 }).catch(() => {});
  }
  if (setupDb != null && databaseName != null) {
    const admin = createDb(adminUrl!);
    clients.push(admin);
    await admin.$client.unsafe(`drop database if exists "${databaseName}"`);
  }
});

/**
 * Every local migration, in chain order, applied to one isolated database.
 * Mirrors the harness in `project/assemble.integration.test.ts`.
 */
async function applyLocalMigrations(db: ReturnType<typeof createDb>) {
  const migrationsDir = join(import.meta.dir, '..', '..', '..', '..', '..', 'packages', 'db', 'migrations', 'local');
  const dirs = readdirSync(migrationsDir).sort();
  for (const dir of dirs) {
    const migration = readFileSync(join(migrationsDir, dir, 'migration.sql'), 'utf8');
    const statements = migration.split('--> statement-breakpoint').map(value => value.trim()).filter(Boolean);
    for (const statement of statements) {
      await db.$client.unsafe(statement);
    }
  }
}

/** The live `psdg` 2 Scryfall row: a `ja` card whose name and text are English. */
const ashuza = {
  cardId:          'cd69fa01-6bdd-4b9a-bf3a-48a453e35ccc',
  oracleId:        '9ccbc379-05bc-4359-b1f6-3a022ae37a1e',
  lang:            'ja',
  layout:          'normal',
  name:            'Ashuza\'s Breath',
  typeLine:        'Sorcery',
  oracleText:      'For each creature, choose a number from 0 to 2 at random. Ashuza\'s Breath deals damage to each creature equal to the chosen number. Sprinkle the smoke from this spell to call forth the spirits of the air.',
  set:             'psdg',
  setId:           '39aa1c4e-1006-43e5-85a1-f5ea1c4e0001',
  setName:         'Sega Dreamcast Cards',
  setType:         'promo',
  collectorNumber: '2',
  rarity:          'rare',
  releasedAt:      '2001-06-21',
};

/** A foreign-only row whose name reduces to an empty slug. */
const nonLatin = {
  cardId:          'aaaaaaaa-0000-0000-0000-000000000001',
  oracleId:        'aaaaaaaa-0000-0000-0000-000000000002',
  lang:            'ja',
  layout:          'normal',
  name:            'あ',
  typeLine:        'Instant',
  oracleText:      'Draw a card.',
  set:             'psdg',
  setId:           '39aa1c4e-1006-43e5-85a1-f5ea1c4e0001',
  setName:         'Sega Dreamcast Cards',
  setType:         'promo',
  collectorNumber: '99',
  rarity:          'rare',
  releasedAt:      '2001-06-21',
};

async function seed(db: ReturnType<typeof createDb>, row: typeof ashuza) {
  await db.insert(ScryfallCard).values({
    cardId:          row.cardId,
    oracleId:        row.oracleId,
    lang:            row.lang,
    multiverseIds:   [],
    layout:          row.layout,
    name:            row.name,
    typeLine:        row.typeLine,
    oracleText:      row.oracleText,
    cmc:             3,
    colorIdentity:   [],
    keywords:        [],
    legalities:      {},
    reserved:        false,
    oversized:       false,
    gameChanger:     false,
    set:             row.set,
    setId:           row.setId,
    setName:         row.setName,
    setType:         row.setType,
    collectorNumber: row.collectorNumber,
    rarity:          row.rarity,
    releasedAt:      row.releasedAt,
    frame:           '1997',
    borderColor:     'black',
    imageStatus:     'highres_scan',
    highresImage:    true,
    finishes:        ['nonfoil'],
    games:           ['paper'],
    booster:         false,
    promo:           true,
    fullArt:         false,
    textless:        false,
    storySpotlight:  false,
    reprint:         false,
    digital:         false,
    variation:       false,
  });
}

integrationTest('anchors a foreign-only oracle on its one non-English row', async () => {
  if (adminUrl == null) {
    throw new Error('MAGIC_IMAGE_TEST_DATABASE_URL is required.');
  }

  databaseName = `tcg_magic_anchor_${randomBytes(8).toString('hex')}`;
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${databaseName}`;
  const admin = createDb(adminUrl);
  clients.push(admin);
  await admin.$client.unsafe(`create database "${databaseName}"`);
  setupDb = createDb(databaseUrl.toString());
  clients.push(setupDb);
  await applyLocalMigrations(setupDb);

  const db = setupDb;
  await seed(db, ashuza);
  await seed(db, nonLatin);

  const matched = await matchBatch(db);
  expect(matched.cardIdByUnit.get(ashuza.oracleId)).toBe('ashuzas-breath');
  // The non-Latin anchor reduces to an empty slug: held for review under its
  // unit key, never auto-assigned a garbage cardId.
  expect(matched.conflicts.get(nonLatin.oracleId)).toEqual([nonLatin.oracleId]);
  expect(matched.cardIdByUnit.has(nonLatin.oracleId)).toBe(false);

  const units = await assembleUnits(db, ashuza.oracleId);
  expect(units).toHaveLength(1);
  expect(units[0]!.unit).toBe(ashuza.oracleId);
  // cardId comes from the same fallback anchor match used, so the two agree.
  expect(units[0]!.cardId).toBe('ashuzas-breath');
  expect(units[0]!.faces.map(f => f.name)).toEqual(['Ashuza\'s Breath']);
  expect(units[0]!.prints!.map(p => [p.set, p.number, p.lang])).toEqual([['psdg', '2', 'ja']]);
}, 60_000);
