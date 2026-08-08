#!/usr/bin/env bun

/**
 * Deletes orphaned card image files from the local image bucket.
 *
 * A file is orphaned when its render hash is not referenced by any live
 * `entity_localizations` row and not referenced by any announcement item side
 * (base / prev / curr — including glow and delta hashes, which live outside the
 * entity tables).
 *
 * Usage:
 *   bun --env-file=scripts/.env run scripts/hearthstone/cleanup-orphaned-card-images.ts
 *   bun --env-file=scripts/.env run scripts/hearthstone/cleanup-orphaned-card-images.ts --write
 */

import { createHash } from 'node:crypto';
import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import canonicalize from 'canonicalize';

import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import { Entity, EntityLocalization } from '@tcg-cards/db/schema/shared/hearthstone/entity';
import { Announcement, AnnouncementItem } from '@tcg-cards/db/schema/shared/hearthstone/announcement';
import { CardImageAsset } from '@tcg-cards/db/schema/shared/hearthstone/card-image';
import type { RenderModel } from '@tcg-cards/model/src/hearthstone/schema/entity';
import { glowPart, type GlowEntry } from '@tcg-cards/model/src/hearthstone/schema/announcement';
import { locale, type Locale } from '@tcg-cards/model/src/hearthstone/schema/basic';

import { getDb } from '../lib/db';
import { parseArg } from '../lib/args';

const write = process.argv.includes('--write');
const bucketDir = process.env.BUCKET_DIR ?? parseArg('--bucket-dir=');
if (!bucketDir) {
  throw new Error('Missing image bucket directory: set BUCKET_DIR or pass --bucket-dir=');
}

// ── inline hash helpers (mirror @tcg-cards/shared/hearthstone) ──

function computeRenderHash(model: RenderModel): string {
  return createHash('sha256').update(canonicalize(model)!).digest('hex');
}

const GLOW_PART_ORDER = new Map(glowPart.options.map((part, index) => [part, index]));

function sortGlow(glow: GlowEntry[]): GlowEntry[] {
  return [...glow].sort(
    (a, b) => (GLOW_PART_ORDER.get(a.part) ?? Number.MAX_SAFE_INTEGER) - (GLOW_PART_ORDER.get(b.part) ?? Number.MAX_SAFE_INTEGER),
  );
}

function mergeDelta(model: RenderModel, delta?: Partial<RenderModel>): RenderModel {
  return delta ? { ...model, ...delta } : model;
}

function applyGlow(model: RenderModel, glow?: GlowEntry[] | null): RenderModel {
  return glow && glow.length > 0 ? { ...model, glow: sortGlow(glow) } : model;
}

// ── run ──────────────────────────────────────────────────────────────────

const db = getDb();
const ALL_LANGS = [...locale.options] as Locale[];

// 1. Live card render hashes.
const liveRows = await db.select({ renderHash: EntityLocalization.renderHash })
  .from(EntityLocalization)
  .where(isNotNull(EntityLocalization.renderHash));
const protectedHashes = new Set(liveRows.map(r => r.renderHash));

// 2. Announcement-referenced render hashes (glow / delta hashes live outside the entity tables).
const announcements = await db.select({
  id: Announcement.id, version: Announcement.version, lastVersion: Announcement.lastVersion,
}).from(Announcement);
const announcementById = new Map(announcements.map(a => [a.id, a]));

const items = await db.select({
  id:             AnnouncementItem.id,
  announcementId: AnnouncementItem.announcementId,
  type:           AnnouncementItem.type,
  cardId:         AnnouncementItem.cardId,
  version:        AnnouncementItem.version,
  lastVersion:    AnnouncementItem.lastVersion,
  delta:          AnnouncementItem.delta,
  glow:           AnnouncementItem.glow,
}).from(AnnouncementItem)
  .where(and(
    isNotNull(AnnouncementItem.cardId),
    inArray(AnnouncementItem.type, ['card_change', 'card_update']),
  ));

const distinctCardIds = [...new Set(items.map(i => i.cardId).filter((id): id is string => id != null))];

interface RenderModelRow {
  entityVersion:       number[];
  localizationVersion: number[];
  renderModel:         RenderModel;
}

const rowsByCardLang = new Map<string, RenderModelRow[]>();
if (distinctCardIds.length > 0) {
  const rows = await db.select({
    cardId:              Entity.cardId,
    lang:                EntityLocalization.lang,
    entityVersion:       Entity.version,
    localizationVersion: EntityLocalization.version,
    renderModel:         EntityLocalization.renderModel,
  })
    .from(Entity)
    .innerJoin(EntityLocalization, and(
      eq(Entity.cardId, EntityLocalization.cardId),
      eq(Entity.revisionHash, EntityLocalization.revisionHash),
      sql`${Entity.version} && ${EntityLocalization.version}`,
    ))
    .where(and(
      inArray(Entity.cardId, distinctCardIds),
      inArray(EntityLocalization.lang, ALL_LANGS),
    ));

  for (const row of rows) {
    if (!row.renderModel) continue;
    const key = `${row.cardId}\0${row.lang}`;
    const list = rowsByCardLang.get(key) ?? [];
    list.push({
      entityVersion:       row.entityVersion,
      localizationVersion: row.localizationVersion,
      renderModel:         row.renderModel as RenderModel,
    });
    rowsByCardLang.set(key, list);
  }
}

function resolveModel(cardId: string, buildNumber: number, lang: Locale): RenderModel | null {
  const list = rowsByCardLang.get(`${cardId}\0${lang}`) ?? [];
  const row = list.find(r =>
    r.entityVersion.includes(buildNumber) && r.localizationVersion.includes(buildNumber),
  );
  return row?.renderModel ?? null;
}

const resolveVersion = (itemV?: number | null, fallback?: number | null, root?: number) =>
  itemV ?? fallback ?? root!;

let announcementHashCount = 0;
for (const item of items) {
  const announcement = announcementById.get(item.announcementId);
  if (!announcement) continue;
  const delta = item.delta as { prev?: Partial<RenderModel>, curr?: Partial<RenderModel> } | null;

  if (item.type === 'card_change') {
    const version = resolveVersion(item.version, undefined, announcement.version);
    for (const lang of ALL_LANGS) {
      const model = resolveModel(item.cardId!, version, lang);
      if (!model) continue;
      protectedHashes.add(computeRenderHash(mergeDelta(model, delta?.curr)));
      announcementHashCount += 1;
    }
  }

  if (item.type === 'card_update') {
    const version = resolveVersion(item.version, undefined, announcement.version);
    const lastVersion = resolveVersion(item.lastVersion, announcement.lastVersion, announcement.version);
    for (const lang of ALL_LANGS) {
      const prevModel = resolveModel(item.cardId!, lastVersion, lang);
      if (prevModel) {
        protectedHashes.add(computeRenderHash(mergeDelta(prevModel, delta?.prev)));
        announcementHashCount += 1;
      }
      const currModel = resolveModel(item.cardId!, version, lang);
      if (currModel) {
        protectedHashes.add(computeRenderHash(applyGlow(mergeDelta(currModel, delta?.curr), item.glow)));
        announcementHashCount += 1;
      }
    }
  }
}

// 3. Scan bucket files (all categories, including glow).
async function collectFiles(
  dir: string,
  category: string | null,
  out: Array<{ path: string, hash: string, category: string }>,
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
      await collectFiles(full, category ?? entry.name, out);
    } else if (entry.isFile() && entry.name.endsWith('.webp')) {
      out.push({ path: full, hash: entry.name.slice(0, -'.webp'.length), category: category ?? 'unknown' });
    }
  }
}

const files: Array<{ path: string, hash: string, category: string }> = [];
await collectFiles(join(bucketDir, 'hearthstone', 'card'), null, files);

const orphans = files.filter(file => !protectedHashes.has(file.hash));

const fileCountByCategory = new Map<string, number>();
for (const file of files) {
  fileCountByCategory.set(file.category, (fileCountByCategory.get(file.category) ?? 0) + 1);
}

const orphanCountByCategory = new Map<string, number>();
for (const orphan of orphans) {
  orphanCountByCategory.set(orphan.category, (orphanCountByCategory.get(orphan.category) ?? 0) + 1);
}

// 4. Report (shown in both dry-run and write modes).
console.log(`Live card render hashes:       ${liveRows.length}`);
console.log(`Announcement-referenced hashes: ${announcementHashCount}`);
console.log(`Protected render hashes:       ${protectedHashes.size}`);
console.log(`Bucket image files:            ${files.length}`);
for (const category of [...fileCountByCategory.keys()].sort()) {
  console.log(`  total ${category}: ${fileCountByCategory.get(category)}`);
}
console.log(`Orphaned files to delete:      ${orphans.length}`);
if (orphans.length > 0) {
  for (const category of [...orphanCountByCategory.keys()].sort()) {
    console.log(`  ${category}: ${orphanCountByCategory.get(category)}`);
  }
}
console.log('');
console.log(`Mode: ${write ? 'WRITE' : 'DRY-RUN'}`);

if (!write) {
  console.log('');
  console.log('DRY-RUN complete. Add --write to execute.');
  process.exit(0);
}

// 5. Write: delete files and their card_image_assets rows.
console.log('');
console.log('Executing...');

let deletedFiles = 0;
let failedFiles = 0;
for (const orphan of orphans) {
  try {
    await unlink(orphan.path);
    deletedFiles += 1;
  } catch {
    failedFiles += 1;
  }
}

const orphanHashes = [...new Set(orphans.map(orphan => orphan.hash))];
let deletedAssets = 0;
for (let i = 0; i < orphanHashes.length; i += 500) {
  const chunk = orphanHashes.slice(i, i + 500);
  const result = await db.delete(CardImageAsset)
    .where(inArray(CardImageAsset.renderHash, chunk))
    .returning({ renderHash: CardImageAsset.renderHash });
  deletedAssets += result.length;
}

console.log(`Deleted ${deletedFiles} files, failed ${failedFiles}; removed ${deletedAssets} card_image_assets rows.`);
console.log('Done.');

await db.$client.end({ timeout: 1 });
