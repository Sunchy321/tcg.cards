/**
 * Integration coverage for the projected split of a two-token card.
 *
 * A `double_faced_token` whose faces are two independent tokens ("Snake //
 * Zombie") projects as one single-face print per face, collector number
 * suffixed `a`/`b`. Each of those prints must carry a face pin, because the
 * image import resolves a row's download url by that pin: an unpinned row
 * falls back to the first url of the card's per-face list, so both siblings
 * would fetch the front image (`source.ts:166`, `source.ts:112`).
 *
 * Runs against the opt-in integration database, mirroring
 * `image-import/ledger.integration.test.ts`.
 */

import { afterAll, afterEach, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createDb } from '@tcg-cards/db';
import { ScryfallCard } from '@tcg-cards/db/schema/local/magic';

import { applyPathOverrides } from '../../../runtime-config';
import { emptyRemoteSkipped, scryfallQueueRow } from '../image-import/source';
import { assembleUnits } from './assemble';

/** Opt-in integration database, mirroring the yugioh and magic image import tests. */
const adminUrl = process.env.MAGIC_IMAGE_TEST_DATABASE_URL?.trim() ?? null;
const integrationTest = adminUrl == null ? test.skip : test;

const clients: Array<ReturnType<typeof createDb>> = [];
let setupDb: ReturnType<typeof createDb> | null = null;
let databaseName: string | null = null;

afterEach(() => {
  applyPathOverrides({});
});

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
 * Mirrors the harness in `image-import/ledger.integration.test.ts`.
 */
async function applyLocalMigrations(db: ReturnType<typeof createDb>) {
  const migrationsDir = join(import.meta.dir, '..', '..', '..', '..', '..', '..', 'packages', 'db', 'migrations', 'local');
  const dirs = readdirSync(migrationsDir).sort();
  for (const dir of dirs) {
    const migration = readFileSync(join(migrationsDir, dir, 'migration.sql'), 'utf8');
    const statements = migration.split('--> statement-breakpoint').map(value => value.trim()).filter(Boolean);
    for (const statement of statements) {
      await db.$client.unsafe(statement);
    }
  }
}

const frontPng = 'https://cards.scryfall.io/png/front/1/3/13e4832d-8530-4b85-b738-51d0c18f28ec.png?1783924139';
const backPng = 'https://cards.scryfall.io/png/back/1/3/13e4832d-8530-4b85-b738-51d0c18f28ec.png?1783924139';

/** The live `cc2` 9 Scryfall rows, so the fixture is source data, not a hand-made shape. */
const oracleId = '814a99c8-0b64-4492-8c9f-088915a970a6';
const snakeZombie = {
  cardId:          '13e4832d-8530-4b85-b738-51d0c18f28ec',
  oracleId,
  lang:            'en',
  layout:          'double_faced_token',
  name:            'Snake // Zombie',
  set:             'cc2',
  setId:           '78a7f4da-4838-4011-9f58-de8020d1fd2d',
  setName:         'Commander Collection: Black',
  setType:         'arsenal',
  collectorNumber: '9',
  rarity:          'common',
  releasedAt:      '2022-01-28',
  frame:           '2015',
  borderColor:     'black',
  imageStatus:     'highres_scan',
  colorIdentity:   ['B'],
  colors:          null,
  imageUris:       null,
  faces:           [
    {
      name:        'Snake',
      type_line:   'Token Creature — Snake',
      oracle_text: 'Deathtouch',
      mana_cost:   '',
      power:       '1',
      toughness:   '1',
      colors:      ['B'],
      image_uris:  { png: frontPng },
    },
    {
      name:        'Zombie',
      type_line:   'Token Creature — Zombie',
      oracle_text: '',
      mana_cost:   '',
      power:       '2',
      toughness:   '2',
      colors:      ['B'],
      image_uris:  { png: backPng },
    },
  ],
};

async function seedSnakeZombie(db: ReturnType<typeof createDb>) {
  await db.insert(ScryfallCard).values({
    cardId:          snakeZombie.cardId,
    oracleId:        snakeZombie.oracleId,
    lang:            snakeZombie.lang,
    multiverseIds:   [],
    layout:          snakeZombie.layout,
    name:            snakeZombie.name,
    colors:          snakeZombie.colors,
    colorIdentity:   snakeZombie.colorIdentity,
    keywords:        [],
    legalities:      {},
    reserved:        false,
    oversized:       false,
    gameChanger:     false,
    cardFaces:       snakeZombie.faces,
    set:             snakeZombie.set,
    setId:           snakeZombie.setId,
    setName:         snakeZombie.setName,
    setType:         snakeZombie.setType,
    collectorNumber: snakeZombie.collectorNumber,
    rarity:          snakeZombie.rarity,
    releasedAt:      snakeZombie.releasedAt,
    frame:           snakeZombie.frame,
    borderColor:     snakeZombie.borderColor,
    imageUris:       snakeZombie.imageUris,
    imageStatus:     snakeZombie.imageStatus,
    highresImage:    true,
    finishes:        ['nonfoil'],
    games:           ['paper'],
    booster:         false,
    promo:           false,
    fullArt:         false,
    textless:        false,
    storySpotlight:  false,
    reprint:         false,
    digital:         false,
    variation:       false,
  });
}

// Database creation plus the full local migration chain goes over the wire,
// so the default 5s test budget cannot hold.
integrationTest('pins each split token print to its own face, so both images are fetched', async () => {
  if (adminUrl == null) {
    throw new Error('MAGIC_IMAGE_TEST_DATABASE_URL is required.');
  }

  databaseName = `tcg_magic_dft_${randomBytes(8).toString('hex')}`;
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${databaseName}`;
  const admin = createDb(adminUrl);
  clients.push(admin);
  await admin.$client.unsafe(`create database "${databaseName}"`);
  setupDb = createDb(databaseUrl.toString());
  clients.push(setupDb);
  await applyLocalMigrations(setupDb);

  const db = setupDb;
  await seedSnakeZombie(db);

  const units = await assembleUnits(db, oracleId);
  expect(units.map(unit => unit.unit)).toEqual([`${oracleId}:0`, `${oracleId}:1`]);
  expect(units.map(unit => unit.prints![0]!.number)).toEqual(['9a', '9b']);
  // The face pin is what tells the image import which half of the card each
  // print is; without it both prints resolve to the front image.
  expect(units.map(unit => unit.prints![0]!.scryfallFace)).toEqual(['front', 'back']);

  // End to end: each print queues its own face's url.
  const queued = units.map(unit => {
    const draft = unit.prints![0]!;
    return scryfallQueueRow({
      cardId:              draft.cardId,
      version:             draft.version,
      set:                 draft.set,
      number:              draft.number,
      lang:                draft.lang,
      source:              draft.source ?? '',
      layout:              draft.layout,
      scryfallFace:        draft.scryfallFace,
      imageInfo:           null,
      scryfallImageStatus: snakeZombie.imageStatus,
      scryfallImageUris:   snakeZombie.imageUris,
      scryfallCardFaces:   snakeZombie.faces,
    }, emptyRemoteSkipped())!;
  });
  expect(queued.map(row => row.faces.map(face => face.url))).toEqual([[frontPng], [backPng]]);
}, 60_000);
