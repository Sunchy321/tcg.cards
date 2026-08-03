#!/usr/bin/env bun

/**
 * Diagnoses the projection of one card at one build in the local database.
 *
 * Re-projects the card from extracted/unpack data in dry-run mode and compares
 * the freshly computed target rows against the rows currently persisted with
 * that build in their version arrays, flagging any mismatch.
 *
 * Usage:
 *   DESKTOP_LOCAL_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/local \
 *     bun run apps/service-desktop-runtime/scripts/check-card-projection.ts \
 *     --card MEND_502 --build 243002 [--rows]
 *
 *   --rows  also dump the full projected entity/localization rows (default: off)
 */

import { and, eq, isNotNull, sql } from 'drizzle-orm';

import {
  Entity,
  EntityLocalization,
  ExtractedCard,
  ExtractedCardTag,
  PatchState,
  RawEntitySnapshot,
  RawEntitySnapshotTag,
} from '@tcg-cards/db/schema/local/hearthstone';

import { getLocalDb } from '../src/lib/hearthstone/hsdata-local-db';
import {
  projectExtracted,
  projectHsdataFallback,
  type ProjectCardResult,
} from '../src/lib/hearthstone/task/project/project';

process.env.DESKTOP_LOCAL_DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/local';

function parseArgs(argv: string[]) {
  const value = (name: string) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 && index + 1 < argv.length ? argv[index + 1] : undefined;
  };
  return {
    cardId: value('card') ?? 'MEND_502',
    build:  Number(value('build') ?? '243002'),
    rows:   argv.includes('--rows'),
  };
}

function section(title: string) {
  console.log(`\n===== ${title} =====`);
}

const { cardId, build, rows } = parseArgs(process.argv);
const db = getLocalDb();

section(`patch_state for build ${build}`);
const [state] = await db.select({
  importStatus:     PatchState.importStatus,
  unpackStatus:     PatchState.unpackStatus,
  projectionStatus: PatchState.projectionStatus,
  projectionError:  PatchState.projectionError,
})
  .from(PatchState)
  .where(eq(PatchState.buildNumber, build));
console.log(state ?? '(no patch_state row)');
const useExtracted = state?.unpackStatus === 'completed';
console.log(`Projection path: ${useExtracted ? 'extracted' : 'hsdata-fallback'}`);

section(`source data for ${cardId} at build ${build}`);
if (useExtracted) {
  const extracted = await db.select().from(ExtractedCard).where(and(
    sql<boolean>`${build} = any(${ExtractedCard.buildNumbers})`,
    eq(ExtractedCard.cardId, cardId),
  ));
  for (const card of extracted) {
    console.log(`extracted_card: dbf=${card.dbfId} snapshot=${card.snapshotHash.slice(0, 12)} buildNumbers=${JSON.stringify(card.buildNumbers)} projectionState=${card.projectionState}`);
    const tags = await db.select().from(ExtractedCardTag).where(eq(ExtractedCardTag.snapshotId, card.id));
    console.log(`  extracted_card_tags: ${tags.length} tags`);
    for (const t of tags.slice(0, 40)) {
      console.log(`    tagId=${t.tagId} value=${t.tagValue} ref=${t.isReferenceTag} power=${t.isPowerKeywordTag}`);
    }
    if (tags.length > 40) console.log(`    ... and ${tags.length - 40} more`);
  }
  if (extracted.length === 0) console.log('(no extracted_card row contains this build)');
}

section(`current persisted rows for ${cardId}`);
const existingEntities = await db.select().from(Entity).where(eq(Entity.cardId, cardId));
const existingLocalizations = await db.select().from(EntityLocalization).where(eq(EntityLocalization.cardId, cardId));
console.log(`entities (${existingEntities.length})`);
for (const row of existingEntities) {
  console.log(`  v=${JSON.stringify(row.version)} rev=${row.revisionHash.slice(0, 12)} type=${row.type} set=${row.set} cost=${row.cost} attack=${row.attack} health=${row.health}`);
}
console.log(`localizations (${existingLocalizations.length})`);
for (const row of existingLocalizations) {
  console.log(`  ${row.lang.padEnd(3)} v=${JSON.stringify(row.version)} rev=${row.revisionHash.slice(0, 8)} loc=${row.localizationHash.slice(0, 8)} render=${row.renderHash?.slice(0, 8)} name="${row.name}"`);
}

section('fresh dry-run projection');
const buildCards = useExtracted
  ? await db.select().from(ExtractedCard).where(sql<boolean>`${build} = any(${ExtractedCard.buildNumbers})`)
  : [];
console.log(`buildCards cache: ${buildCards.length}`);

// hsdata TAG 183 fallback (same cache the projection task loads)
const hsdataSetTags = useExtracted
  ? await db.select({
      dbfId:    RawEntitySnapshot.dbfId,
      intValue: RawEntitySnapshotTag.intValue,
    }).from(RawEntitySnapshotTag)
      .innerJoin(RawEntitySnapshot, eq(RawEntitySnapshotTag.snapshotId, RawEntitySnapshot.id))
      .where(and(eq(RawEntitySnapshotTag.enumId, 183), isNotNull(RawEntitySnapshotTag.intValue)))
  : [];
const hsdataSetByDbfId = new Map(hsdataSetTags.map(r => [r.dbfId, r.intValue!]));
console.log(`hsdata set cache: ${hsdataSetByDbfId.size}`);

let projected: ProjectCardResult | null = null;
let report;
if (useExtracted) {
  report = await projectExtracted(build, [cardId], true, buildCards, hsdataSetByDbfId, rows => { projected = rows; });
} else {
  report = await projectHsdataFallback(build, [cardId], true);
}

console.log(JSON.stringify({
  insertedEntities:      report.insertedEntities,
  reusedEntities:        report.reusedEntities,
  updatedEntities:       report.updatedEntities,
  insertedLocalizations: report.insertedLocalizations,
  reusedLocalizations:   report.reusedLocalizations,
  updatedLocalizations:  report.updatedLocalizations,
  entityPlan:            report.entityPlan,
  localizationPlan:      report.localizationPlan,
  entityDiff:            report.entityDiff,
  localizationDiff:      report.localizationDiff,
}, null, 2));

if (projected) {
  if (rows) {
    section('final projected rows (dry-run output)');
    const projEntity = projected.entity;
    console.log('\n[projected entity]');
    console.log(JSON.stringify({
      ...projEntity,
      version: [build],
    }, null, 2));
    console.log('\n[projected localizations]');
    for (const loc of projected.localizations) {
      console.log(JSON.stringify({
        ...loc,
        version: [build],
      }, null, 2));
    }
  }

  section('comparison: projected target vs persisted');
  const projEntity = projected.entity;
  const entityRowsWithBuild = existingEntities.filter(r => r.version.includes(build));

  console.log('\n[entity]');
  console.log(`  projected revisionHash: ${projEntity.revisionHash}`);
  if (entityRowsWithBuild.length === 0) {
    console.log('  !! no persisted entity row contains this build in its version array');
  } else {
    for (const row of entityRowsWithBuild) {
      console.log(`  persisted row v=${JSON.stringify(row.version)} rev=${row.revisionHash}`);
      console.log(`  revisionHash match: ${row.revisionHash === projEntity.revisionHash ? 'YES' : 'NO'}`);
      const fields = ['type', 'set', 'cost', 'attack', 'health', 'durability', 'armor', 'techLevel', 'rarity', 'elite', 'collectible', 'inBobsTavern', 'tripleCard'] as const;
      for (const f of fields) {
        const a = (projEntity as unknown as Record<string, unknown>)[f];
        const b = (row as unknown as Record<string, unknown>)[f];
        if (JSON.stringify(a) !== JSON.stringify(b)) {
          console.log(`  !! field ${f} differs: projected=${JSON.stringify(a)} persisted=${JSON.stringify(b)}`);
        }
      }
    }
  }

  console.log('\n[localizations]');
  for (const loc of projected.localizations) {
    const matching = existingLocalizations.filter(r => r.lang === loc.lang && r.version.includes(build));
    if (matching.length === 0) {
      console.log(`  ${loc.lang}: !! no persisted localization row contains build in version`);
      continue;
    }
    for (const row of matching) {
      const flags: string[] = [];
      if (row.localizationHash !== loc.localizationHash) flags.push(`localizationHash (${row.localizationHash.slice(0, 8)} vs ${loc.localizationHash.slice(0, 8)})`);
      if (row.renderHash !== loc.renderHash) flags.push(`renderHash (${row.renderHash?.slice(0, 8)} vs ${loc.renderHash?.slice(0, 8)})`);
      if (row.name !== loc.name) flags.push(`name ("${row.name}" vs "${loc.name}")`);
      if (row.richText !== loc.richText) flags.push('richText');
      console.log(`  ${loc.lang}: ${flags.length > 0 ? '!! ' + flags.join('; ') : 'OK'} v=${JSON.stringify(row.version)}`);
    }
  }
} else {
  console.log('\n(hsdata-fallback path: projected rows are not returned; inspect the report and raw snapshots above)');
}

// Close the local DB connection so the process can exit.
await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
