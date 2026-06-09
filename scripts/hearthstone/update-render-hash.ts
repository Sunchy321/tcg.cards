#!/usr/bin/env bun

/**
 * Updates renderHash for cards affected by a newly added render mechanic.
 *
 * When a new mechanic slug is added to RENDER_MECHANIC_SLUGS, the renderModel
 * changes for any card that has the corresponding GAME_TAG, which changes the
 * renderHash. This script performs the three updates needed to converge:
 *
 *   1. Update render_hash and render_model in hearthstone.entity_localizations
 *      for affected rows.
 *   2. Delete orphaned rows in hearthstone_data.card_image_assets that still
 *      reference the old renderHash (primary key includes renderHash, so stale
 *      rows must be removed before re-export).
 *   3. Delete the corresponding local .webp files from the asset bucket so
 *      re-import does not skip them as already-present.
 *
 * Usage:
 *   bun run scripts/hearthstone-update-render-hash.ts --slug=<slug> [--dry-run] [--bucket-dir=<path>]
 *
 * Options:
 *   --slug          Render mechanic slug as it appears in renderMechanics (e.g. timewarped).
 *                   The corresponding GAME_TAG enum ID is looked up from TAG_ID.
 *   --dry-run       Show what would be done without making changes.
 *   --bucket-dir    Local asset bucket root directory for file cleanup.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { unlink } from 'node:fs/promises';
import { sql, eq, and, inArray } from 'drizzle-orm';

import { getDb } from '../lib/db';
import { parseArg, isDryRun } from '../lib/args';
import { hashCanonicalJson } from '../lib/hash';
import { Entity, EntityLocalization } from '@tcg-cards/db/schema/shared/hearthstone/entity';
import { CardImageAsset } from '@tcg-cards/db/schema/shared/hearthstone/card-image';
import { TAG_SLUG, TAG_ID } from '@tcg-cards/model/src/hearthstone/constant/tag';

type UpdateTask = {
  cardId:           string;
  lang:             string;
  revisionHash:     string;
  localizationHash: string;
  oldHash:          string | null;
  newHash:          string;
  newModel:         Record<string, unknown>;
  mechanicValue:    unknown;
};

async function main() {
  const slug = parseArg('--slug=');
  const dryRun = isDryRun();
  const bucketDir = parseArg('--bucket-dir=');

  if (!slug) {
    console.error('Usage: bun run scripts/hearthstone-update-render-hash.ts --slug=<slug> [--dry-run] [--bucket-dir=<path>]');
    process.exit(1);
  }

  const tagKey = (Object.keys(TAG_SLUG) as (keyof typeof TAG_SLUG)[]).find(k => TAG_SLUG[k] === slug);
  if (!tagKey) {
    console.error(`Unknown slug "${slug}". Must be one of: ${Object.values(TAG_SLUG).join(', ')}`);
    process.exit(1);
  }

  const enumId = String(TAG_ID[tagKey]);
  const db = getDb();

  if (dryRun) {
    console.log('[DRY RUN] No changes will be written.\n');
  }

  console.log(`Mechanic: slug="${slug}" enum ID=${enumId}`);
  console.log('Finding affected localizations...');

  const rawRows = await db
    .select({
      cardId:           EntityLocalization.cardId,
      lang:             EntityLocalization.lang,
      revisionHash:     EntityLocalization.revisionHash,
      localizationHash: EntityLocalization.localizationHash,
      renderHash:       EntityLocalization.renderHash,
      renderModel:      EntityLocalization.renderModel,
      mechanicValue:    Entity.mechanics,
    })
    .from(EntityLocalization)
    .innerJoin(
      Entity,
      and(
        eq(EntityLocalization.cardId, Entity.cardId),
        eq(EntityLocalization.revisionHash, Entity.revisionHash),
      ),
    )
    .where(sql`${Entity.mechanics} ? '${sql.raw(enumId)}'`);

  console.log(`Found ${rawRows.length} localization rows.`);

  const updates: UpdateTask[] = [];

  for (const row of rawRows) {
    if (row.renderModel == null) {
      console.log(`  Skipping ${row.cardId}/${row.lang}: render_model is null`);
      continue;
    }

    const model = row.renderModel as Record<string, unknown>;
    const mechanics = (model.renderMechanics ?? {}) as Record<string, unknown>;

    if (slug in mechanics) {
      console.log(`  Skipping ${row.cardId}/${row.lang}: already has "${slug}"`);
      continue;
    }

    const rawMechanics = row.mechanicValue as Record<string, unknown>;
    let mechanicValue: unknown = rawMechanics[enumId];
    if (typeof mechanicValue === 'string') {
      if (mechanicValue === 'true') mechanicValue = true;
      else if (mechanicValue === 'false') mechanicValue = false;
      else {
        const num = Number(mechanicValue);
        if (Number.isSafeInteger(num)) mechanicValue = num;
      }
    }

    const newModel = {
      ...model,
      renderMechanics: { ...mechanics, [slug]: mechanicValue },
    };
    const newHash = hashCanonicalJson(newModel);

    updates.push({
      cardId:           row.cardId,
      lang:             row.lang,
      revisionHash:     row.revisionHash,
      localizationHash: row.localizationHash,
      oldHash:          row.renderHash,
      newHash,
      newModel,
      mechanicValue,
    });
  }

  if (updates.length === 0) {
    console.log('No rows need updating.');
    return;
  }

  const oldHashes = [...new Set(updates.map(u => u.oldHash).filter(Boolean))] as string[];

  console.log(`\n${updates.length} localization rows to update (${oldHashes.length} distinct renderHashes):`);
  for (const u of updates) {
    console.log(`  ${u.cardId}/${u.lang}  ${slug}=${u.mechanicValue}  ${u.oldHash?.slice(0, 12)} -> ${u.newHash.slice(0, 12)}`);
  }

  // Step 1: Update entity_localizations
  console.log(`\n[1/3] ${dryRun ? 'Would update' : 'Updating'} entity_localizations...`);
  let updated = 0;
  for (const u of updates) {
    if (!dryRun) {
      await db
        .update(EntityLocalization)
        .set({
          renderHash:  u.newHash,
          renderModel: u.newModel as any,
        })
        .where(
          and(
            eq(EntityLocalization.cardId, u.cardId),
            eq(EntityLocalization.lang, u.lang),
            eq(EntityLocalization.revisionHash, u.revisionHash),
            eq(EntityLocalization.localizationHash, u.localizationHash),
          ),
        );
    }
    updated += 1;
  }
  console.log(`  ${dryRun ? 'Would update' : 'Updated'} ${updated} rows.`);

  // Step 2: Delete orphaned card_image_assets
  console.log(`\n[2/3] ${dryRun ? 'Would delete' : 'Deleting'} orphaned card_image_assets...`);
  const oldAssets = await db
    .select({
      imageSpecVersion: CardImageAsset.imageSpecVersion,
      renderHash:       CardImageAsset.renderHash,
      zone:             CardImageAsset.zone,
      template:         CardImageAsset.template,
      premium:          CardImageAsset.premium,
      r2Key:            CardImageAsset.r2Key,
    })
    .from(CardImageAsset)
    .where(inArray(CardImageAsset.renderHash, oldHashes));

  console.log(`  Found ${oldAssets.length} asset rows to delete:`);
  for (const a of oldAssets) {
    console.log(`    ${a.zone}/${a.template}/${a.premium}  ${a.renderHash.slice(0, 12)}`);
  }

  if (oldAssets.length > 0) {
    if (!dryRun) {
      await db
        .delete(CardImageAsset)
        .where(inArray(CardImageAsset.renderHash, oldHashes));
    }
    console.log(`  ${dryRun ? 'Would delete' : 'Deleted'} ${oldAssets.length} rows.`);
  }

  // Step 3: Delete local files
  let deletedFiles = 0;
  let missingFiles = 0;
  if (bucketDir) {
    console.log(`\n[3/3] ${dryRun ? 'Would delete' : 'Deleting'} local files in ${bucketDir}...`);

    for (const a of oldAssets) {
      const filePath = join(bucketDir, a.r2Key);
      const exists = existsSync(filePath);
      if (!dryRun) {
        if (exists) {
          try {
            await unlink(filePath);
            deletedFiles += 1;
          } catch (err: any) {
            console.log(`    Failed to delete ${filePath}: ${err.message}`);
          }
        } else {
          missingFiles += 1;
        }
      } else if (exists) {
        deletedFiles += 1;
      } else {
        missingFiles += 1;
      }
    }

    console.log(`  ${dryRun ? 'Would delete' : 'Deleted'} ${deletedFiles} files, ${missingFiles} already missing.`);
  } else if (!dryRun) {
    console.log('\n[3/3] Skipping local file deletion (--bucket-dir not provided).');
  } else {
    console.log('\n[3/3] Would delete local files (--bucket-dir not provided, cannot enumerate paths).');
  }

  console.log('\nDone.');
  console.log(`  entity_localizations updated: ${updated}`);
  console.log(`  card_image_assets deleted:    ${oldAssets.length}`);
  if (bucketDir) {
    console.log(`  local files ${dryRun ? 'that would be deleted' : 'deleted'}: ${deletedFiles}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
