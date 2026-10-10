#!/usr/bin/env bun

/**
 * Re-projects every card carrying the given GAME_TAG enum ids across all builds,
 * so a projection-side fix reaches rows projected with older code.
 *
 * Projection reads only extracted/unpack data already present in the local
 * database — no re-import is involved. Reconcile only touches the selected
 * cards, and re-running is idempotent. Use --dry-run first to see the write plan.
 *
 * Only builds with extracted (unpack) data are re-projected; builds that
 * predate extraction are skipped, since their rows do not contain those builds.
 *
 * Usage:
 *   DESKTOP_LOCAL_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/local \
 *     bun run apps/service-desktop-runtime/scripts/reproject-cards.ts \
 *     --tags 1471,1676 [--builds 253932,253216] [--dry-run]
 *
 *   --tags    GAME_TAG enum ids whose cards should be re-projected (required)
 *   --builds  limit to specific build numbers (default: every build with extracted data)
 *   --dry-run compute and report the write plan without writing
 */

import { and, asc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';

import {
  ExtractedCard,
  ExtractedCardTag,
  PatchState,
  RawEntitySnapshot,
  RawEntitySnapshotTag,
} from '@tcg-cards/db/schema/local/hearthstone';

import { getLocalDb } from '../src/lib/hearthstone/hsdata-local-db';
import { projectExtracted } from '../src/lib/hearthstone/task/project/project';

process.env.DESKTOP_LOCAL_DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/local';

function parseArgs(argv: string[]) {
  const value = (name: string) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 && index + 1 < argv.length ? argv[index + 1] : undefined;
  };
  const numbers = (raw: string | undefined) =>
    (raw ?? '').split(',')
      .map(part => part.trim())
      .filter(part => part.length > 0)
      .map(part => Number(part))
      .filter(Number.isFinite);
  return {
    tags:   numbers(value('tags')),
    builds: numbers(value('builds')),
    dryRun: argv.includes('--dry-run'),
  };
}

const { tags, builds, dryRun } = parseArgs(process.argv);
if (tags.length === 0) {
  console.error('Usage: bun run scripts/reproject-cards.ts --tags <enumId,...> [--builds <n,...>] [--dry-run]');
  process.exit(1);
}

const db = getLocalDb();

// Affected cards are resolved by dbfId: extracted tags carry dbfId only.
const affectedDbfIds = new Set(
  (await db.selectDistinct({ dbfId: ExtractedCardTag.dbfId })
    .from(ExtractedCardTag)
    .where(and(inArray(ExtractedCardTag.tagId, tags), ne(ExtractedCardTag.tagValue, 0))))
    .map(row => row.dbfId),
);
console.log(`tags ${tags.join(',')}: ${affectedDbfIds.size} affected dbfIds`);
if (affectedDbfIds.size === 0) {
  await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
  process.exit(0);
}

// Same TAG 183 cache the projection task loads, shared across builds.
const hsdataSetTags = await db.select({
  dbfId:    RawEntitySnapshot.dbfId,
  intValue: RawEntitySnapshotTag.intValue,
}).from(RawEntitySnapshotTag)
  .innerJoin(RawEntitySnapshot, eq(RawEntitySnapshotTag.snapshotId, RawEntitySnapshot.id))
  .where(and(eq(RawEntitySnapshotTag.enumId, 183), isNotNull(RawEntitySnapshotTag.intValue)));
const hsdataSetByDbfId = new Map(hsdataSetTags.map(row => [row.dbfId, row.intValue!]));

const targets = (await db.select({
  buildNumber:  PatchState.buildNumber,
  unpackStatus: PatchState.unpackStatus,
})
  .from(PatchState)
  .orderBy(asc(PatchState.buildNumber)))
  .filter(row => row.unpackStatus === 'completed')
  .filter(row => builds.length === 0 || builds.includes(row.buildNumber));

const totals = {
  builds:          0,
  cards:           0,
  entityUpserts:   0,
  entityDeletes:   0,
  locUpserts:      0,
  locDeletes:      0,
  relationUpserts: 0,
  relationDeletes: 0,
};

for (const target of targets) {
  const build = target.buildNumber;

  const buildCards = await db.select().from(ExtractedCard)
    .where(sql<boolean>`${build} = any(${ExtractedCard.buildNumbers})`);
  const cardIds = [...new Set(buildCards.filter(card => affectedDbfIds.has(card.dbfId)).map(card => card.cardId))].sort();

  if (cardIds.length === 0) {
    console.log(`build ${build}: no affected cards, skipped`);
    continue;
  }

  const report = await projectExtracted(build, cardIds, dryRun, buildCards, hsdataSetByDbfId);

  totals.builds += 1;
  totals.cards += cardIds.length;
  totals.entityUpserts += report.entityPlan.upsert;
  totals.entityDeletes += report.entityPlan.delete;
  totals.locUpserts += report.localizationPlan.upsert;
  totals.locDeletes += report.localizationPlan.delete;
  totals.relationUpserts += report.relationPlan.upsert;
  totals.relationDeletes += report.relationPlan.delete;

  console.log(`build ${build}: cards=${cardIds.length} entity=+${report.entityPlan.upsert}/-${report.entityPlan.delete} loc=+${report.localizationPlan.upsert}/-${report.localizationPlan.delete} rel=+${report.relationPlan.upsert}/-${report.relationPlan.delete}`);
}

console.log(`\n${dryRun ? '[dry-run] would re-project' : 're-projected'} ${totals.cards} card-builds across ${totals.builds} builds`);
console.log(`  entities +${totals.entityUpserts}/-${totals.entityDeletes}, localizations +${totals.locUpserts}/-${totals.locDeletes}, relations +${totals.relationUpserts}/-${totals.relationDeletes}`);

// Close the local DB connection so the process can exit.
await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
