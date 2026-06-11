#!/usr/bin/env bun

/**
 * Updates renderHash for cards affected by render mechanic changes.
 *
 * Two modes:
 *
 *   Add mode: find cards that have the GAME_TAG but are missing the mechanic
 *   in renderMechanics, add it, recompute renderHash.
 *
 *   Rename mode: find cards that have an old mechanic key in renderMechanics,
 *   rename it to the new key, recompute renderHash.
 *
 * Mechanic keys are numeric GAME_TAG enum IDs (e.g. 1720 for TRADEABLE).
 *
 * Three-step pipeline in both modes:
 *   1. Update render_hash and render_model in hearthstone.entity_localizations.
 *   2. Delete orphaned rows in hearthstone_data.card_image_assets.
 *   3. Delete local .webp files from the asset bucket.
 *
 * Reads DATABASE_URL and BUCKET_DIR from the environment.
 *
 * Usage:
 *   bun --env-file=scripts/.env run scripts/hearthstone/update-render-hash.ts --id=<enumId> [--dry-run]
 *   bun --env-file=scripts/.env run scripts/hearthstone/update-render-hash.ts --id=<enumId> --rename-from=<oldId> [--dry-run]
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

async function findAddTasks(db: ReturnType<typeof getDb>, mechanicId: string) {
  console.log(`Add mode: finding cards with game tag ${mechanicId} but missing in renderMechanics...`);

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
    .where(sql`${Entity.mechanics} ? '${sql.raw(mechanicId)}'`);

  console.log(`Found ${rawRows.length} localization rows.`);

  const updates: UpdateTask[] = [];

  for (const row of rawRows) {
    if (row.renderModel == null) {
      console.log(`  Skipping ${row.cardId}/${row.lang}: render_model is null`);
      continue;
    }

    const model = row.renderModel as Record<string, unknown>;
    const mechanics = (model.renderMechanics ?? {}) as Record<string, unknown>;

    if (mechanicId in mechanics) {
      // Key exists, but renderHash may be stale (e.g. after a manual rename).
      const recomputed = hashCanonicalJson(model);
      if (recomputed === row.renderHash) {
        console.log(`  Skipping ${row.cardId}/${row.lang}: already has "${mechanicId}" and hash matches`);
        continue;
      }
      console.log(`  Fixing ${row.cardId}/${row.lang}: has "${mechanicId}" but hash mismatch (${row.renderHash?.slice(0, 12)} -> ${recomputed.slice(0, 12)})`);
      updates.push({
        cardId:           row.cardId,
        lang:             row.lang,
        revisionHash:     row.revisionHash,
        localizationHash: row.localizationHash,
        oldHash:          row.renderHash,
        newHash:          recomputed,
        newModel:         model,
        mechanicValue:    mechanics[mechanicId],
      });
      continue;
    }

    const rawMechanics = row.mechanicValue as Record<string, unknown>;
    let mechanicValue: unknown = rawMechanics[mechanicId];
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
      renderMechanics: { ...mechanics, [mechanicId]: mechanicValue },
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

  return updates;
}

async function findRenameTasks(db: ReturnType<typeof getDb>, mechanicId: string, renameFrom: string) {
  console.log(`Rename mode: renaming "${renameFrom}" -> "${mechanicId}" in renderMechanics...`);

  const rawRows = await db
    .select({
      cardId:           EntityLocalization.cardId,
      lang:             EntityLocalization.lang,
      revisionHash:     EntityLocalization.revisionHash,
      localizationHash: EntityLocalization.localizationHash,
      renderHash:       EntityLocalization.renderHash,
      renderModel:      EntityLocalization.renderModel,
    })
    .from(EntityLocalization)
    .where(sql`${EntityLocalization.renderModel}->'renderMechanics' ? ${renameFrom}`);

  console.log(`Found ${rawRows.length} localization rows.`);

  const updates: UpdateTask[] = [];

  for (const row of rawRows) {
    if (row.renderModel == null) {
      console.log(`  Skipping ${row.cardId}/${row.lang}: render_model is null`);
      continue;
    }

    const model = row.renderModel as Record<string, unknown>;
    const mechanics = (model.renderMechanics ?? {}) as Record<string, unknown>;

    if (!(renameFrom in mechanics)) {
      console.log(`  Skipping ${row.cardId}/${row.lang}: missing "${renameFrom}"`);
      continue;
    }

    const value = mechanics[renameFrom];
    delete mechanics[renameFrom];
    mechanics[mechanicId] = value;

    const newModel = { ...model, renderMechanics: mechanics };
    const newHash = hashCanonicalJson(newModel);

    updates.push({
      cardId:           row.cardId,
      lang:             row.lang,
      revisionHash:     row.revisionHash,
      localizationHash: row.localizationHash,
      oldHash:          row.renderHash,
      newHash,
      newModel,
      mechanicValue:    value,
    });
  }

  return updates;
}

async function main() {
  const id = parseArg('--id=');
  const renameFrom = parseArg('--rename-from=');
  const dryRun = isDryRun();
  const bucketDir = process.env.BUCKET_DIR || null;

  if (!id) {
    console.error('Usage:');
    console.error('  bun --env-file=scripts/.env run scripts/hearthstone/update-render-hash.ts --id=<enumId> [--dry-run]');
    console.error('  bun --env-file=scripts/.env run scripts/hearthstone/update-render-hash.ts --id=<enumId> --rename-from=<oldId> [--dry-run]');
    process.exit(1);
  }

  const db = getDb();

  if (dryRun) {
    console.log('[DRY RUN] No changes will be written.\n');
  }

  let updates: UpdateTask[];

  if (renameFrom) {
    console.log(`Mechanic: rename "${renameFrom}" -> "${id}"`);
    updates = await findRenameTasks(db, id, renameFrom);
  } else {
    console.log(`Mechanic: enum ID=${id}`);
    updates = await findAddTasks(db, id);
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
    console.log('\n[3/3] Skipping local file deletion (BUCKET_DIR not set).');
  } else {
    console.log('\n[3/3] Would delete local files (BUCKET_DIR not set, cannot enumerate paths).');
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
