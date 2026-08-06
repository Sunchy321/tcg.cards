import { afterEach, expect, test } from 'bun:test';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createDb } from '@tcg-cards/db';

import {
  setLocalDatabaseUrlOverride,
  setYugiohImageOverride,
} from '../../runtime-config';
import { importYugiohImages } from './image-import';
import { getYugiohLocalDb } from './yugioh-local-db';
import { yugiohImageMetadataUrl } from './image-source';

const adminUrl = process.env.YUGIOH_IMAGE_TEST_DATABASE_URL?.trim() ?? null;
const integrationTest = adminUrl == null ? test.skip : test;
const tempDirs: string[] = [];

/** Minimal valid VP8X WebP fixture with deterministic dimensions and payload bytes. */
function buildWebp(width: number, height: number, marker: number) {
  const bytes = new Uint8Array(32);
  const view = new DataView(bytes.buffer);

  bytes.set(Buffer.from('RIFF'), 0);
  view.setUint32(4, 24, true);
  bytes.set(Buffer.from('WEBP'), 8);
  bytes.set(Buffer.from('VP8X'), 12);
  view.setUint32(16, 12, true);
  const encodedWidth = width - 1;
  const encodedHeight = height - 1;

  bytes[24] = encodedWidth & 0xff;
  bytes[25] = (encodedWidth >> 8) & 0xff;
  bytes[26] = (encodedWidth >> 16) & 0xff;
  bytes[27] = encodedHeight & 0xff;
  bytes[28] = (encodedHeight >> 8) & 0xff;
  bytes[29] = (encodedHeight >> 16) & 0xff;
  bytes[30] = marker;
  bytes[31] = marker ^ 0xff;
  return bytes;
}

/** Lowercase digest produces exact provider metadata and asset expectations. */
function digest(algorithm: 'md5' | 'sha256', bytes: Uint8Array) {
  return createHash(algorithm).update(bytes).digest('hex');
}

/** Provider metadata line generated for one synthetic image response. */
function metadataLine(sourceRecordId: string, bytes: Uint8Array, modified = 1_700_000_000) {
  return `${sourceRecordId}.webp:${bytes.length},${modified},${digest('md5', bytes)}`;
}

/** Generated Yu-Gi-Oh! migrations applied to one isolated integration database. */
async function applyMigrations(db: ReturnType<typeof createDb>) {
  const paths = [
    new URL('../../../../../packages/db/migrations/local/20260805121848_true_toxin/migration.sql', import.meta.url),
    new URL('../../../../../packages/db/migrations/local/20260805200306_furry_raider/migration.sql', import.meta.url),
  ];

  for (const path of paths) {
    const migration = await Bun.file(path).text();
    const statements = migration.split('--> statement-breakpoint').map(value => value.trim()).filter(Boolean);

    for (const statement of statements) {
      await db.$client.unsafe(statement);
    }
  }
}

afterEach(async () => {
  setLocalDatabaseUrlOverride(null);
  setYugiohImageOverride(null);
  await Promise.all(tempDirs.splice(0).map(path => rm(path, { force: true, recursive: true })));
});

integrationTest('isolates failures and recovers idempotently without deleting card facts', async () => {
  if (adminUrl == null) {
    throw new Error('YUGIOH_IMAGE_TEST_DATABASE_URL is required.');
  }

  const databaseName = `tcg_ygo_img_${randomBytes(8).toString('hex')}`;
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${databaseName}`;
  const admin = createDb(adminUrl);
  let setup: ReturnType<typeof createDb> | null = null;
  let runtime: ReturnType<typeof createDb> | null = null;
  let created = false;
  const bucketDir = await mkdtemp(join(tmpdir(), 'tcg-yugioh-image-integration-'));
  tempDirs.push(bucketDir);

  try {
    expect(databaseName).toMatch(/^tcg_ygo_img_[a-f0-9]{16}$/);
    await admin.$client.unsafe(`create database "${databaseName}"`);
    created = true;
    setup = createDb(databaseUrl.toString());
    await applyMigrations(setup);
    await setup.$client.unsafe(`
      insert into yugioh.cards (cid, password, cn_name) values
        (4007, '89631139', 'Blue-Eyes White Dragon'),
        (4041, '46986414', 'Dark Magician'),
        (999999, null, 'Passwordless Test Card')
    `);

    const blue = buildWebp(680, 986, 1);
    const dark = buildWebp(680, 986, 2);
    const changedDark = buildWebp(680, 986, 3);
    let metadataLines = [metadataLine('89631139', blue), metadataLine('46986414', dark)];
    let failDark = true;
    const requestCounts = new Map<string, number>();
    const fetcher = async (input: string | URL | Request) => {
      const url = String(input);

      if (url === yugiohImageMetadataUrl) {
        return new Response(`${metadataLines.join('\n')}\n`, {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        });
      }

      const sourceRecordId = url.match(/\/([0-9]+)\.webp$/)?.[1];

      if (sourceRecordId == null) {
        return new Response(null, { status: 404 });
      }

      requestCounts.set(sourceRecordId, (requestCounts.get(sourceRecordId) ?? 0) + 1);

      if (sourceRecordId === '46986414' && failDark) {
        return new Response('<html>temporary failure</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }

      const bytes = sourceRecordId === '89631139'
        ? blue
        : metadataLines[1] === metadataLine('46986414', changedDark, 1_700_000_001)
          ? changedDark
          : dark;
      return new Response(bytes, {
        status: 200,
        headers: { 'content-type': 'image/webp' },
      });
    };

    setLocalDatabaseUrlOverride(databaseUrl.toString());
    setYugiohImageOverride({ bucketDir });
    runtime = getYugiohLocalDb();

    const first = await importYugiohImages({ fetcher, concurrency: 2 });
    expect(first).toMatchObject({
      status: 'completed_with_errors',
      addedCount: 1,
      failedCount: 1,
      unavailableCardCount: 1,
    });

    failDark = false;
    const second = await importYugiohImages({ fetcher, concurrency: 2 });
    expect(second).toMatchObject({ status: 'completed', addedCount: 1, skippedCount: 1, failedCount: 0 });
    const requestsAfterSecond = new Map(requestCounts);
    const third = await importYugiohImages({ fetcher, concurrency: 2 });
    expect(third).toMatchObject({ status: 'completed', skippedCount: 2, failedCount: 0 });
    expect(requestCounts).toEqual(requestsAfterSecond);

    const darkBeforeFailure = await setup.$client.unsafe(`
      select primary_image_r2_key from yugioh.cards where password = '46986414'
    `).then(rows => rows[0]?.primary_image_r2_key as string);
    metadataLines = [metadataLine('89631139', blue), metadataLine('46986414', changedDark, 1_700_000_001)];
    failDark = true;
    const failedUpdate = await importYugiohImages({ fetcher, concurrency: 2 });
    expect(failedUpdate).toMatchObject({ status: 'completed_with_errors', skippedCount: 1, failedCount: 1 });
    const darkAfterFailure = await setup.$client.unsafe(`
      select primary_image_r2_key, primary_image_deleted_at from yugioh.cards where password = '46986414'
    `).then(rows => rows[0]);
    expect(darkAfterFailure?.primary_image_r2_key).toBe(darkBeforeFailure);
    expect(darkAfterFailure?.primary_image_deleted_at).toBeNull();

    failDark = false;
    const recoveredUpdate = await importYugiohImages({ fetcher, concurrency: 2 });
    expect(recoveredUpdate).toMatchObject({ status: 'completed', updatedCount: 1, skippedCount: 1 });

    const blueKey = await setup.$client.unsafe(`
      select primary_image_r2_key from yugioh.cards where password = '89631139'
    `).then(rows => rows[0]?.primary_image_r2_key as string);
    await rm(resolve(bucketDir, ...blueKey.split('/')));
    const recoveredFile = await importYugiohImages({ fetcher, concurrency: 2 });
    expect(recoveredFile).toMatchObject({ status: 'completed', updatedCount: 1, skippedCount: 1 });

    metadataLines = [metadataLine('46986414', changedDark, 1_700_000_001)];
    const removedSource = await importYugiohImages({ fetcher, concurrency: 2 });
    expect(removedSource).toMatchObject({ status: 'completed', softDeletedCount: 1, skippedCount: 1 });
    const finalRows = await setup.$client.unsafe(`
      select password, primary_image_deleted_at, deleted_at from yugioh.cards order by password nulls last
    `);
    expect(finalRows).toHaveLength(3);
    expect(finalRows.find(row => row.password === '89631139')?.primary_image_deleted_at).not.toBeNull();
    expect(finalRows.every(row => row.deleted_at == null)).toBe(true);
  } finally {
    if (runtime != null) {
      await runtime.$client.end({ timeout: 1 }).catch(() => undefined);
    }

    if (setup != null) {
      await setup.$client.end({ timeout: 1 }).catch(() => undefined);
    }

    if (created) {
      await admin.$client.unsafe(`drop database "${databaseName}" with (force)`);
    }

    await admin.$client.end({ timeout: 1 });
  }
});
