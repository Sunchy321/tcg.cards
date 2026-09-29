import { afterAll, afterEach, expect, test } from 'bun:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

import { createDb } from '@tcg-cards/db';
import { eq } from 'drizzle-orm';

import { AssetImage } from '@tcg-cards/db/schema/local/magic';
import { Print } from '@tcg-cards/db/schema/shared/magic/print';
import { printImageKey } from '@tcg-cards/shared/magic/print-image';
import type { ImageInfo } from '#model/magic/schema/print';

import { applyPathOverrides, setPathOverride } from '../../../runtime-config';
import { backfillAssetLedger } from './backfill';
import { clearImages } from './clear';
import { ingestRemoteRow, ingestUploadItem } from './ingest';
import { markPlaceholderImages } from './mark';
import { carryOverPrintImages, fillPrintImagesFromLedger, loadExistingPrintImages, loadPrintLedgerEntries } from '../project/fill-print-images';

/** Opt-in integration database, mirroring the yugioh image import test. */
const adminUrl = process.env.MAGIC_IMAGE_TEST_DATABASE_URL?.trim() ?? null;
const integrationTest = adminUrl == null ? test.skip : test;

const tempDirs: string[] = [];
const clients: Array<ReturnType<typeof createDb>> = [];
let setupDb: ReturnType<typeof createDb> | null = null;
let databaseName: string | null = null;

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function pngChunk(type: string, data: Uint8Array): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crcTable.reduce(() => 0, 0));
  let c = 0xffffffff;
  for (const byte of body) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
  crc.writeUInt32BE((c ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, crc]);
}

/** Real 8-bit RGB PNG fixture that Bun.Image can decode. */
function buildPng(width: number, height: number, marker: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < stride; x++) raw[y * (stride + 1) + 1 + x] = (x + y + marker) & 0xff;
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', new Uint8Array(0)),
  ]);
}

/** Re-encodes the PNG through Bun as a real webp payload for the fetch layer. */
async function buildWebp(width: number, height: number, marker: number): Promise<Buffer> {
  const img = new Bun.Image(buildPng(width, height, marker));
  const encoded = await img.webp({ quality: 50 });
  return Buffer.from(await encoded.buffer());
}

/** Every local migration, in chain order, applied to one isolated database. */
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

async function seedPrint(db: ReturnType<typeof createDb>): Promise<string> {
  const cardId = randomUUID();
  await db.insert(Print).values({
    cardId,
    version:          '',
    set:              'mid',
    number:           '297',
    lang:             'en',
    source:           '',
    name:             'Test Card',
    typeline:         'Test Creature',
    layout:           'normal',
    frame:            '2015',
    frameEffects:     [],
    borderColor:      'black',
    rarity:           'common',
    releaseDate:      '2021-11-19',
    isDigital:        false,
    isPromo:          false,
    isReprint:        false,
    finishes:         ['nonfoil'],
    imageStatus:      'placeholder',
    imageInfo:        null,
    inBooster:        false,
    games:            ['paper'],
    printTags:        [],
    multiverseId:     [],
    scryfallOracleId: randomUUID(),
  });
  return cardId;
}

const row = (cardId: string, imageInfo: ImageInfo, faceUrl: string) => ({
  cardId,
  version:   '',
  set:       'mid',
  number:    '297',
  lang:      'en',
  source:    '',
  faces:     [{ faceIndex: 0, url: faceUrl, remoteSource: 'scryfall' as const }],
  imageInfo,
  faceCount: 1 as const,
});

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
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

// Database creation plus the full local migration chain goes over the wire,
// so the default 5s test budget cannot hold.
integrationTest('remote and upload ingest mirror files into the ledger and clear empties it', async () => {
  if (adminUrl == null) {
    throw new Error('MAGIC_IMAGE_TEST_DATABASE_URL is required.');
  }

  databaseName = `tcg_magic_img_${randomBytes(8).toString('hex')}`;
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${databaseName}`;
  const admin = createDb(adminUrl);
  clients.push(admin);
  await admin.$client.unsafe(`create database "${databaseName}"`);
  setupDb = createDb(databaseUrl.toString());
  clients.push(setupDb);
  await applyLocalMigrations(setupDb);

  const imageRoot = mkdtempSync(join(tmpdir(), 'tcg-magic-image-integration-'));
  tempDirs.push(imageRoot);
  setPathOverride('magic.image.card', imageRoot);

  const cardId = await seedPrint(setupDb);
  const db = setupDb;
  const key = printImageKey('mid', 'en', '297');
  const faceUrl = `data:image/webp;base64,${(await buildWebp(320, 480, 1)).toString('base64')}`;

  // Remote ingest writes the file, its ledger row, and the fact metadata.
  const first = await ingestRemoteRow(db, row(cardId, [], faceUrl), { imageSource: 'scryfall', cleanupJpg: true, force: false });
  expect(first.failed).toBe(0);
  expect(first.written).toBe(1);
  const ledger = await db.select().from(AssetImage).where(eq(AssetImage.key, key));
  expect(ledger).toHaveLength(1);
  expect(ledger[0]!.format).toBe('webp');
  expect(ledger[0]!.source).toBe('scryfall');
  expect(ledger[0]!.status).toBe('lowres');
  expect(ledger[0]!.width).toBe(320);
  expect(ledger[0]!.height).toBe(480);
  expect(ledger[0]!.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(ledger[0]!.verifiedAt).not.toBeNull();
  const printed = await db.select().from(Print).where(eq(Print.cardId, cardId));
  expect(printed[0]!.imageInfo?.[0]?.sha256).toBe(ledger[0]!.sha256);

  // A forced re-import of identical bytes re-lands the same values: no second row.
  const second = await ingestRemoteRow(db, row(cardId, printed[0]!.imageInfo ?? [], faceUrl), { imageSource: 'scryfall', cleanupJpg: true, force: true });
  expect(second.unchanged).toBe(1);
  expect(await db.select().from(AssetImage).where(eq(AssetImage.key, key))).toHaveLength(1);

  // Upload ingest takes over the face and stamps the upload source.
  const upload = await ingestUploadItem(
    db,
    {
      number: '297',
      name:   'Test Card',
      rows:   [{
        cardId, version:   '', set:       'mid', number:    '297', lang:      'en', source:    '',
        layout:    'normal', printName: 'Test Card', imageInfo: printed[0]!.imageInfo ?? [],
      }],
    },
    Buffer.from(await buildWebp(320, 480, 2)),
    { imageSource: 'manual', cleanupJpg: true },
  );
  expect(upload.written).toBe(1);
  const uploaded = await db.select().from(AssetImage).where(eq(AssetImage.key, key));
  expect(uploaded).toHaveLength(1);
  expect(uploaded[0]!.source).toBe('manual');

  // Backfill converges: a row already identical to its metadata is skipped,
  // and a deleted row is rebuilt from the fact row's metadata while its file
  // verifies at the recorded size.
  const firstBackfill = await backfillAssetLedger(db);
  expect(firstBackfill.unchanged).toBe(1);
  await db.delete(AssetImage).where(eq(AssetImage.key, key));
  const secondBackfill = await backfillAssetLedger(db);
  expect(secondBackfill.seeded).toBe(1);
  const rebuilt = await db.select().from(AssetImage).where(eq(AssetImage.key, key));
  expect(rebuilt).toHaveLength(1);
  expect(rebuilt[0]!.source).toBe('manual');

  // The operator resets the print: clear sweeps the file and both copies and
  // lands the print in the missing state. The reset pins no tombstone, so the
  // ledger stays empty and an ordinary pass may fetch the image again.
  await db.update(Print).set({ imageStatus: 'placeholder' }).where(eq(Print.cardId, cardId));
  const cleared = await clearImages(db, { set: 'mid', langs: ['en'] });
  expect(cleared.cleared).toBe(1);
  expect(existsSync(join(imageRoot, key))).toBe(false);
  expect(await db.select().from(AssetImage).where(eq(AssetImage.key, key))).toHaveLength(0);
  const clearedPrint = await db.select().from(Print).where(eq(Print.cardId, cardId));
  expect(clearedPrint[0]!.imageStatus).toBe('missing');
  expect(clearedPrint[0]!.imageInfo).toBeNull();

  // A backfill rerun has neither fact metadata nor a placeholder fact to
  // mirror, so the ledger stays empty.
  const postClearBackfill = await backfillAssetLedger(db);
  expect(postClearBackfill.tombstones).toBe(0);
  expect(await db.select().from(AssetImage).where(eq(AssetImage.key, key))).toHaveLength(0);

  // The reset also reaches prints that carry no image fact but are pinned in
  // the ledger: a tombstone-pinned print is lifted into the same missing
  // state, so a stale no-image pin does not survive an explicit clear.
  const pinnedCard = randomUUID();
  await db.insert(Print).values({
    cardId:           pinnedCard,
    version:          '',
    set:              'mid',
    number:           '299',
    lang:             'en',
    source:           '',
    name:             'Pinned Card',
    typeline:         'Test Creature',
    layout:           'normal',
    frame:            '2015',
    frameEffects:     [],
    borderColor:      'black',
    rarity:           'common',
    releaseDate:      '2021-11-19',
    isDigital:        false,
    isPromo:          false,
    isReprint:        false,
    finishes:         ['nonfoil'],
    imageStatus:      'placeholder',
    imageInfo:        null,
    inBooster:        false,
    games:            ['paper'],
    printTags:        [],
    multiverseId:     [],
    scryfallOracleId: randomUUID(),
  });
  const pinnedKey = printImageKey('mid', 'en', '299');
  await db.insert(AssetImage).values({
    key:          pinnedKey, format:       '', source:       '', sha256:       '', width:        0, height:       0,
    byteSize:     0, status:       'placeholder', qualityScore: null, verifiedAt:   new Date(),
  });
  const clearedAgain = await clearImages(db, { set: 'mid', langs: ['en'] });
  expect(clearedAgain.cleared).toBe(1);
  expect(await db.select().from(AssetImage).where(eq(AssetImage.key, pinnedKey))).toHaveLength(0);
  const lifted = await db.select().from(Print).where(eq(Print.cardId, pinnedCard));
  expect(lifted[0]!.imageStatus).toBe('missing');

  // With both layers empty the ordinary pass re-fetches: the download lands
  // again without any force.
  const refetched = await ingestRemoteRow(db, row(cardId, [], faceUrl), { imageSource: 'scryfall', cleanupJpg: true, force: false });
  expect(refetched.written).toBe(1);
  const refetchedLedger = await db.select().from(AssetImage).where(eq(AssetImage.key, key));
  expect(refetchedLedger[0]!.byteSize).toBeGreaterThan(0);

  // The operator's remedy is a manual upload: it takes the face over from the
  // re-fetched download and restores the fact metadata.
  const remedy = await ingestUploadItem(
    db,
    { number: '297', name: 'Test Card', rows: [{ cardId, version: '', set: 'mid', number: '297', lang: 'en', source: '', layout: 'normal', printName: 'Test Card', imageInfo: null }] },
    Buffer.from(await buildWebp(320, 480, 3)),
    { imageSource: 'manual', cleanupJpg: true },
  );
  expect(remedy.written).toBe(1);
  const restored = await db.select().from(AssetImage).where(eq(AssetImage.key, key));
  expect(restored[0]!.byteSize).toBeGreaterThan(0);
  const remedied = await db.select().from(Print).where(eq(Print.cardId, cardId));
  expect(remedied[0]!.imageInfo?.[0]?.sha256).toBe(restored[0]!.sha256);

  // The mark confirms imageless prints that scryfall holds no row for at all
  // (a manual data import's prints) alongside the placeholder-state ones; a
  // print scryfall has a real image for is ignored.
  const markResult = await markPlaceholderImages(db, { set: 'mid', langs: ['en'] });
  expect(markResult.marked).toBe(1);
  expect(markResult.skippedImage).toBe(1);
  expect(markResult.ignored).toBe(0);
  expect(markResult.sourceMissing).toBe(0);
  expect(await db.select().from(AssetImage).where(eq(AssetImage.key, printImageKey('mid', 'en', '299')))).toHaveLength(1);
  const markedPrint = await db.select().from(Print).where(eq(Print.cardId, pinnedCard));
  expect(markedPrint[0]!.imageStatus).toBe('placeholder');

  // Cutover regression: with the fact row wiped, the projection's image fill
  // rebuilds both fields from the ledger alone.
  await db.delete(Print).where(eq(Print.cardId, cardId));
  const draft: (typeof Print)['$inferInsert'] = {
    cardId, version:          '', set:              'mid', number:           '297', lang:             'en', source:           '',
    name:             'Test Card', typeline:         'Test Creature', layout:           'normal', frame:            '2015',
    frameEffects:     [], borderColor:      'black', rarity:           'common', releaseDate:      '2021-11-19',
    isDigital:        false, isPromo:          false, isReprint:        false, finishes:         ['nonfoil'],
    imageStatus:      'lowres', imageInfo:        null, inBooster:        false, games:            ['paper'],
    printTags:        [], multiverseId:     [], scryfallOracleId: randomUUID(),
  };
  const ledgerRows = await loadPrintLedgerEntries(db, [draft]);
  fillPrintImagesFromLedger(ledgerRows, [draft]);
  expect(draft.imageStatus).toBe('lowres');
  expect(draft.imageInfo).toHaveLength(1);
  expect(draft.imageInfo![0]!.source).toBe('manual');
  expect(draft.imageInfo![0]!.sha256).toBe(restored[0]!.sha256);

  // Wedge regression: an image imported before the ledger existed has no
  // ledger row, and a projection that fell through to the source-side status
  // once stamped scryfall's `placeholder` over its outer column while the
  // fact metadata survived. The carry-over heals the pair, and the absent
  // ledger row leaves the healed facts standing.
  const wedgedCard = randomUUID();
  const wedgedInfo: ImageInfo = [{
    status:       'highres_scan',
    type:         'webp',
    source:       'mtgflame',
    sha256:       'c'.repeat(64),
    width:        780,
    height:       1082,
    byteSize:     4096,
    qualityScore: 0.88,
    verifiedAt:   '2026-09-20T00:00:00.000Z',
  }];
  await db.insert(Print).values({
    cardId:           wedgedCard,
    version:          '',
    set:              'mid',
    number:           '298',
    lang:             'en',
    source:           '',
    name:             'Wedged Card',
    typeline:         'Test Creature',
    layout:           'normal',
    frame:            '2015',
    frameEffects:     [],
    borderColor:      'black',
    rarity:           'common',
    releaseDate:      '2021-11-19',
    isDigital:        false,
    isPromo:          false,
    isReprint:        false,
    finishes:         ['nonfoil'],
    imageStatus:      'placeholder',
    imageInfo:        wedgedInfo,
    inBooster:        false,
    games:            ['paper'],
    printTags:        [],
    multiverseId:     [],
    scryfallOracleId: randomUUID(),
  });
  const wedgedDraft: (typeof Print)['$inferInsert'] = {
    cardId:           wedgedCard, version:          '', set:              'mid', number:           '298', lang:             'en', source:           '',
    name:             'Wedged Card', typeline:         'Test Creature', layout:           'normal', frame:            '2015',
    frameEffects:     [], borderColor:      'black', rarity:           'common', releaseDate:      '2021-11-19',
    isDigital:        false, isPromo:          false, isReprint:        false, finishes:         ['nonfoil'],
    imageStatus:      'placeholder', imageInfo:        null, inBooster:        false, games:            ['paper'],
    printTags:        [], multiverseId:     [], scryfallOracleId: randomUUID(),
  };
  const wedgedCarries = await loadExistingPrintImages(db, [wedgedDraft]);
  carryOverPrintImages(wedgedCarries, [wedgedDraft]);
  const wedgedLedger = await loadPrintLedgerEntries(db, [wedgedDraft]);
  fillPrintImagesFromLedger(wedgedLedger, [wedgedDraft]);
  expect(wedgedDraft.imageStatus).toBe('highres_scan');
  expect(wedgedDraft.imageInfo).toEqual(wedgedInfo);
}, 180_000);
