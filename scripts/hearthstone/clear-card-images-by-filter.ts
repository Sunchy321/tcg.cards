#!/usr/bin/env bun

/**
 * Deletes card image files from the local bucket and their `card_image_assets`
 * rows for cards matching a type + minimum tavern tier filter, so the next image
 * export re-renders them from scratch.
 *
 * Usage:
 *   bun --env-file=scripts/.env run scripts/hearthstone/clear-card-images-by-filter.ts
 *   bun --env-file=scripts/.env run scripts/hearthstone/clear-card-images-by-filter.ts --type=spell --tech-level-min=1 --write
 *
 * After clearing, re-render via the normal pipeline: export requirements, render,
 * then import the archive.
 */

import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { and, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';

import { Entity, EntityLocalization } from '@tcg-cards/db/schema/shared/hearthstone/entity';
import { CardImageAsset } from '@tcg-cards/db/schema/shared/hearthstone/card-image';

import { getDb } from '../lib/db';
import { parseArg } from '../lib/args';

const write = process.argv.includes('--write');
const type = parseArg('--type=') ?? 'spell';
const techLevelMin = Number(parseArg('--tech-level-min=') ?? '1');
const bucketDir = process.env.BUCKET_DIR ?? parseArg('--bucket-dir=');

if (!bucketDir) {
  throw new Error('Missing image bucket directory: set BUCKET_DIR or pass --bucket-dir=');
}

if (!Number.isInteger(techLevelMin) || techLevelMin < 1) {
  throw new Error('--tech-level-min must be an integer >= 1');
}

const db = getDb();

// 1. Resolve the render hashes of matching cards across all languages.
const rows = await db.select({
  cardId:     Entity.cardId,
  lang:       EntityLocalization.lang,
  renderHash: EntityLocalization.renderHash,
})
  .from(Entity)
  .innerJoin(EntityLocalization, and(
    eq(Entity.cardId, EntityLocalization.cardId),
    eq(Entity.revisionHash, EntityLocalization.revisionHash),
    sql`${Entity.version} && ${EntityLocalization.version}`,
  ))
  .where(and(
    eq(Entity.type, type),
    gte(Entity.techLevel, techLevelMin),
    isNotNull(EntityLocalization.renderHash),
  ));

const hashes = [...new Set(rows.map(row => row.renderHash).filter((hash): hash is string => hash != null))];

// 2. Scan bucket files and match by render hash.
interface BucketFile {
  path:     string;
  hash:     string;
  category: string;
  zone:     string;
  template: string;
  premium:  string;
}

async function collectFiles(
  dir: string,
  segments: string[],
  out: BucketFile[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(full, [...segments, entry.name], out);
    } else if (entry.isFile() && entry.name.endsWith('.webp')) {
      out.push({
        path:     full,
        hash:     entry.name.slice(0, -'.webp'.length),
        category: segments[0] ?? 'unknown',
        zone:     segments[1] ?? '',
        template: segments[2] ?? '',
        premium:  segments[3] ?? '',
      });
    }
  }
}

const targetHashes = new Set(hashes);
const files: BucketFile[] = [];
await collectFiles(join(bucketDir, 'hearthstone', 'card'), [], files);

const matched = files.filter(file => targetHashes.has(file.hash));

const assetRows = hashes.length > 0
  ? await db.select({ renderHash: CardImageAsset.renderHash })
    .from(CardImageAsset)
    .where(inArray(CardImageAsset.renderHash, hashes))
  : [];

// 3. Report (shown in both dry-run and write modes).
console.log(`Matching rows (${type}, techLevel >= ${techLevelMin}): ${rows.length}; unique render hashes: ${hashes.length}`);
console.log(`Bucket image files: ${files.length}`);
const countByCategory = new Map<string, number>();
for (const file of matched) {
  countByCategory.set(file.category, (countByCategory.get(file.category) ?? 0) + 1);
}
console.log(`Files to clear: ${matched.length}`);
for (const category of [...countByCategory.keys()].sort()) {
  console.log(`  ${category}: ${countByCategory.get(category)}`);
}
console.log(`card_image_assets rows to clear: ${assetRows.length}`);
console.log('');
console.log(`Mode: ${write ? 'WRITE' : 'DRY-RUN'}`);

if (!write) {
  console.log('');
  console.log('DRY-RUN complete. Add --write to execute.');
  process.exit(0);
}

// 4. Write: delete files and their card_image_assets rows.
console.log('');
console.log('Executing...');

let deletedFiles = 0;
let failedFiles = 0;
for (const file of matched) {
  try {
    await unlink(file.path);
    deletedFiles += 1;
  } catch {
    failedFiles += 1;
  }
}

let deletedAssets = 0;
for (let i = 0; i < hashes.length; i += 500) {
  const chunk = hashes.slice(i, i + 500);
  const result = await db.delete(CardImageAsset)
    .where(inArray(CardImageAsset.renderHash, chunk))
    .returning({ renderHash: CardImageAsset.renderHash });
  deletedAssets += result.length;
}

console.log(`Deleted ${deletedFiles} files, failed ${failedFiles}; removed ${deletedAssets} card_image_assets rows.`);
console.log('Done.');

await db.$client.end({ timeout: 1 });
