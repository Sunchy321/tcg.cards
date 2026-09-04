import { z } from 'zod';

import { and, eq, inArray, isNull } from 'drizzle-orm';

import { runWithDb } from '@tcg-cards/db';
import { Card, CardLocalization, CardPart, CardPartLocalization } from '@tcg-cards/db/schema/shared/magic/card';
import { Print, PrintPart } from '@tcg-cards/db/schema/shared/magic/print';
import { CardUnifiedLocalization, ProjectionReview } from '@tcg-cards/db/schema/local/magic';

import { createDefinition } from '#task/definition';
import { getLocalDb } from '../../../hearthstone/hsdata-local-db';
import { matchBatch } from '../../match';
import { assembleUnits, type ProjectDb } from '../../project/assemble';
import { projectCard, type ProjectCardResult } from '../../project/project-card';
import { upsertBatch } from '../../upsert';

/** Stable task type for projecting magic raw caches into the fact tables. */
export const magicProjectTaskType = 'magic_project';

const output = z.object({
  openConflicts: z.number(),
  cards:         z.number(),
  cardParts:     z.number(),
  cardLocs:      z.number(),
  cardPartLocs:  z.number(),
  prints:        z.number(),
  printParts:    z.number(),
  unified:       z.number(),
  reviews:       z.number(),
  softDeleted:   z.number(),
});

type Counts = z.infer<typeof output>;

const emptyCounts: Counts = {
  openConflicts: 0, cards:         0, cardParts:     0, cardLocs:      0, cardPartLocs:  0,
  prints:        0, printParts:    0, unified:       0, reviews:       0, softDeleted:   0,
};

interface ProjectCtx {
  oracleList:    string[];
  /** unit key → resolved cardId for non-conflicting units. */
  unitToCard:    Map<string, string>;
  openConflicts: number;
  counts:        Counts;
}

function addAll(target: Counts, delta: Partial<Counts>) {
  (Object.keys(delta) as (keyof Counts)[]).forEach(k => {
    target[k] += delta[k] ?? 0;
  });
}

/** Write one unit's rows into the fact tables. */
async function writeUnit(database: ProjectDb, result: ProjectCardResult): Promise<Partial<Counts>> {
  const counts: Partial<Counts> = {};
  const write = async <T extends object>(
    table: any, rows: T[], pk: string[], countKey: keyof Counts,
  ) => {
    if (rows.length === 0) return;
    const target = pk.map(name => (table as any)[name]);
    const r = await upsertBatch(database, table, rows as never, target, pk);
    counts[countKey] = r.inserted + r.updated + r.unchanged;
  };

  await write(Card, result.cards, ['cardId', 'version'], 'cards');
  await write(CardPart, result.cardParts, ['cardId', 'version', 'partIndex'], 'cardParts');
  await write(CardLocalization, result.cardLocalizations, ['cardId', 'version', 'locale', 'source'], 'cardLocs');
  await write(CardPartLocalization, result.cardPartLocalizations, ['cardId', 'version', 'locale', 'source', 'partIndex'], 'cardPartLocs');
  await write(Print, result.prints, ['cardId', 'version', 'set', 'number', 'lang', 'source'], 'prints');
  await write(PrintPart, result.printParts, ['cardId', 'version', 'set', 'number', 'lang', 'source', 'partIndex'], 'printParts');
  await write(CardUnifiedLocalization, result.unified, ['cardId', 'version', 'locale'], 'unified');

  // A-class review reminders are appended (no unique conflict target yet).
  if (result.reviews.length > 0) {
    await database.insert(ProjectionReview).values(result.reviews as never);
  }
  counts.reviews = result.reviews.length;
  return counts;
}

/** Table writers used by the reconcile stage: soft-delete stale base rows. */
const BASE_TABLES = [
  { table: Card, pk: ['cardId', 'version'] },
  { table: CardPart, pk: ['cardId', 'version', 'partIndex'] },
  { table: CardLocalization, pk: ['cardId', 'version', 'locale', 'source'] },
  { table: CardPartLocalization, pk: ['cardId', 'version', 'locale', 'source', 'partIndex'] },
  { table: Print, pk: ['cardId', 'version', 'set', 'number', 'lang', 'source'] },
  { table: PrintPart, pk: ['cardId', 'version', 'set', 'number', 'lang', 'source', 'partIndex'] },
  { table: CardUnifiedLocalization, pk: ['cardId', 'version', 'locale'] },
];

/**
 * Reconcile one table: soft-delete base rows (version='') whose cardId is no
 * longer projected.
 */
async function softDeleteStale(database: ProjectDb, table: any, cardIdCol: any, target: Set<string>) {
  const active = await database.select({ cardId: cardIdCol })
    .from(table)
    .where(and(isNull(table.deletedAt), eq(table.version, '')));
  const missing = [...new Set(active.map((r: { cardId: string }) => r.cardId))]
    .filter(id => !target.has(id));
  if (missing.length === 0) return 0;
  await database.update(table)
    .set({ deletedAt: new Date() })
    .where(and(eq(table.version, ''), inArray(cardIdCol, missing)));
  return missing.length;
}

const definition = createDefinition(magicProjectTaskType, {
  version:     '2026-09-03:v1',
  effectModel: 'reconcilable',
})
  .scope(z.object({}), {
    type:    'magic_project',
    resolve: () => ({ key: 'global', snapshot: {} }),
  })
  .input(z.object({}))
  .output(output)
  .context({ init: values => values })
  .stage('match', { label: '匹配', progressMode: 'simple' })
  .handler(async ({ ctx }) => {
    const magic = ctx as unknown as ProjectCtx;
    magic.counts = { ...emptyCounts };
    magic.openConflicts = 0;
    await runWithDb(getLocalDb(), async () => {
      const database = getLocalDb();
      const matched = await matchBatch(database);

      // Persist open slug conflicts into the unified review queue (kind
      // slug_conflict). Pending rows are recomputed each run; resolved rows
      // are left untouched.
      await database.delete(ProjectionReview)
        .where(and(eq(ProjectionReview.kind, 'slug_conflict'), eq(ProjectionReview.status, 'pending')));
      const openRows: (typeof ProjectionReview)['$inferInsert'][] = [];
      for (const [slug, keys] of matched.conflicts) {
        openRows.push({ kind: 'slug_conflict', subject: { slug }, payload: { members: keys, reason: 'conflict' }, status: 'pending' });
      }
      for (const [slug, keys] of matched.blocked) {
        openRows.push({ kind: 'slug_conflict', subject: { slug }, payload: { members: keys, reason: 'blocked' }, status: 'pending' });
      }
      if (openRows.length > 0) {
        await database.insert(ProjectionReview).values(openRows as never);
      }
      magic.openConflicts = matched.conflicts.size + matched.blocked.size;

      const unitToCard = matched.cardIdByUnit;
      const oracleSet = new Set<string>();
      for (const unit of unitToCard.keys()) {
        oracleSet.add(unit.includes(':') ? unit.slice(0, unit.indexOf(':')) : unit);
      }
      magic.oracleList = [...oracleSet].sort();
      magic.unitToCard = unitToCard;
    });
    magic.counts.openConflicts = magic.openConflicts;
    return magic.counts;
  })
  .build();

export const magicProjectTaskDefinition = definition;
