import { z } from 'zod';

import { and, asc, countDistinct, eq, gt, inArray, ne, sql } from 'drizzle-orm';

import { PatchState, RawEntitySnapshot } from '@tcg-cards/db/schema/local/hearthstone';
import { runWithDb } from '@tcg-cards/db';

import { createDefinition } from '#task/definition';
import { getLocalDb } from '../../hsdata-local-db';
import { projectHsdata, type ProjectHsdataReport } from '../../hsdata-project';

/** Stable task type for single and batch hsdata projections. */
export const hsdataProjectionTaskType = 'hearthstone_hsdata_projection';

const cardBlockSize = 100;

const input = z.object({
  sourceTags: z.array(z.number().int().nonnegative()).min(1),
  dryRun:     z.boolean().optional().default(false),
  force:      z.boolean().optional().default(false),
  sampleDiff: z.boolean().optional().default(false),
});

const output = z.object({
  reports: z.array(z.any()),
});

/** Compact per-source report accumulated across card blocks. */
interface ProjectionSourceReport extends ProjectHsdataReport {
  sampleDiffPaths: string[];
}

/** Serializable projection cursor persisted after every card block. */
interface ProjectionBlockState {
  sourceIndex: number;
  lastCardId:  string | null;
  done:        number;
  total:       number;
  reports:     ProjectionSourceReport[];
}

/** Builds an empty aggregate report for one source version. */
function emptyReport(sourceTag: number, dryRun = false): ProjectionSourceReport {
  return {
    dryRun,
    skipped:               true,
    sourceTag,
    build:                 sourceTag,
    snapshotCount:         0,
    totalSnapshotCount:    0,
    skippedSnapshotCount:  0,
    insertedEntities:      0,
    reusedEntities:        0,
    updatedEntities:       0,
    insertedLocalizations: 0,
    reusedLocalizations:   0,
    updatedLocalizations:  0,
    insertedRelations:     0,
    reusedRelations:       0,
    updatedRelations:      0,
    cardRowCount:          0,
    unprojectedTagCount:   0,
    entityPlan:            { upsert: 0, delete: 0 },
    localizationPlan:      { upsert: 0, delete: 0 },
    relationPlan:          { upsert: 0, delete: 0 },
    entityDiff:            { versionMatch: 0, versionChanged: 0, orphanVersionChanged: 0 },
    localizationDiff:      { versionMatch: 0, versionChanged: 0, orphanVersionChanged: 0, renderHashChanged: 0, renderHashNullExisting: 0 },
    relationDiff:          { versionMatch: 0, versionChanged: 0, orphanVersionChanged: 0 },
    sampleDiffPath:        null,
    sampleDiffPaths:       [],
  };
}

/** Adds one diff breakdown into another without discarding optional render counters. */
function mergeDiff(left: ProjectHsdataReport['entityDiff'], right: ProjectHsdataReport['localizationDiff']) {
  return {
    versionMatch:           left.versionMatch + right.versionMatch,
    versionChanged:         left.versionChanged + right.versionChanged,
    orphanVersionChanged:   left.orphanVersionChanged + right.orphanVersionChanged,
    renderHashChanged:      (left.renderHashChanged ?? 0) + (right.renderHashChanged ?? 0),
    renderHashNullExisting: (left.renderHashNullExisting ?? 0) + (right.renderHashNullExisting ?? 0),
  };
}

/** Adds one card-block projection report to its source aggregate. */
function mergeReport(current: ProjectionSourceReport, report: ProjectHsdataReport): ProjectionSourceReport {
  return {
    ...current,
    skipped:               current.skipped && report.skipped,
    snapshotCount:         current.snapshotCount + report.snapshotCount,
    totalSnapshotCount:    current.totalSnapshotCount + report.totalSnapshotCount,
    skippedSnapshotCount:  current.skippedSnapshotCount + report.skippedSnapshotCount,
    insertedEntities:      current.insertedEntities + report.insertedEntities,
    reusedEntities:        current.reusedEntities + report.reusedEntities,
    updatedEntities:       current.updatedEntities + report.updatedEntities,
    insertedLocalizations: current.insertedLocalizations + report.insertedLocalizations,
    reusedLocalizations:   current.reusedLocalizations + report.reusedLocalizations,
    updatedLocalizations:  current.updatedLocalizations + report.updatedLocalizations,
    insertedRelations:     current.insertedRelations + report.insertedRelations,
    reusedRelations:       current.reusedRelations + report.reusedRelations,
    updatedRelations:      current.updatedRelations + report.updatedRelations,
    cardRowCount:          current.cardRowCount + report.cardRowCount,
    unprojectedTagCount:   current.unprojectedTagCount + report.unprojectedTagCount,
    entityPlan:            {
      upsert: current.entityPlan.upsert + report.entityPlan.upsert,
      delete: current.entityPlan.delete + report.entityPlan.delete,
    },
    localizationPlan: {
      upsert: current.localizationPlan.upsert + report.localizationPlan.upsert,
      delete: current.localizationPlan.delete + report.localizationPlan.delete,
    },
    relationPlan: {
      upsert: current.relationPlan.upsert + report.relationPlan.upsert,
      delete: current.relationPlan.delete + report.relationPlan.delete,
    },
    entityDiff:       mergeDiff(current.entityDiff, report.entityDiff),
    localizationDiff: mergeDiff(current.localizationDiff, report.localizationDiff),
    relationDiff:     mergeDiff(current.relationDiff, report.relationDiff),
    sampleDiffPath:   report.sampleDiffPath ?? current.sampleDiffPath,
    sampleDiffPaths:  report.sampleDiffPath == null
      ? current.sampleDiffPaths
      : [...current.sampleDiffPaths, report.sampleDiffPath],
  };
}

/** Counts card groups that one projection task will visit. */
async function countProjectionCards(sourceTags: number[], force: boolean): Promise<number> {
  const database = getLocalDb();
  let total = 0;
  for (const sourceTag of sourceTags) {
    const [row] = await database.select({
      count: countDistinct(RawEntitySnapshot.cardId),
    }).from(RawEntitySnapshot).where(and(
      sql<boolean>`${sourceTag} = any(${RawEntitySnapshot.sourceTags})`,
      force ? undefined : ne(RawEntitySnapshot.projectionState, 'projected'),
    ));
    total += Number(row?.count ?? 0);
  }
  return total;
}

/** Loads the next ordered card block for one source version. */
async function loadProjectionCardIds(sourceTag: number, lastCardId: string | null, force: boolean): Promise<string[]> {
  const database = getLocalDb();
  const rows = await database.selectDistinct({ cardId: RawEntitySnapshot.cardId })
    .from(RawEntitySnapshot)
    .where(and(
      sql<boolean>`${sourceTag} = any(${RawEntitySnapshot.sourceTags})`,
      force ? undefined : ne(RawEntitySnapshot.projectionState, 'projected'),
      lastCardId == null ? undefined : gt(RawEntitySnapshot.cardId, lastCardId),
    ))
    .orderBy(asc(RawEntitySnapshot.cardId))
    .limit(cardBlockSize);
  return rows.map(row => row.cardId);
}

/** Projects frozen source versions with bounded card-level memory. */
export const hsdataProjectionTaskDefinition = createDefinition(hsdataProjectionTaskType, {
  version:     '2026-07-18:v1',
  effectModel: 'reconcilable',
})
  .scope(
    z.object({ sourceTags: z.array(z.number()) }),
    {
      type:    'hearthstone_hsdata_projection',
      resolve: scope => ({ key: 'global', snapshot: scope }),
    },
  )
  .input(input)
  .output(output)
  .context({ init: values => values })
  .stage('validate', { label: '校验版本', progressMode: 'simple' })
  .handler(async ({ ctx }) => {
    for (const sourceTag of ctx.sourceTags) {
      const [state] = await getLocalDb().select({ importStatus: PatchState.importStatus })
        .from(PatchState)
        .where(eq(PatchState.buildNumber, sourceTag));
      if (state?.importStatus !== 'completed') {
        throw new Error(`sourceTag ${sourceTag} is not imported`);
      }
    }
    return ctx;
  })
  .stage('projecting', { label: '分块投影', progressMode: 'bounded', resumeMode: 'durable' })
  .entry(async ({ ctx, checkpoint }) => {
    const restored = checkpoint?.blockInput as ProjectionBlockState | undefined;
    const total = restored?.total ?? await countProjectionCards(ctx.sourceTags, ctx.force);
    return {
      total,
      blockInput: restored ?? {
        sourceIndex: 0,
        lastCardId:  null,
        done:        0,
        total,
        reports:     ctx.sourceTags.map(sourceTag => emptyReport(sourceTag, ctx.dryRun)),
      },
    };
  })
  .block(async ({ ctx, blockInput, progress, checkpoint, done }) => {
    if (blockInput.sourceIndex >= ctx.sourceTags.length) return done(blockInput);

    const sourceTag = ctx.sourceTags[blockInput.sourceIndex]!;
    const cardIds = await loadProjectionCardIds(sourceTag, blockInput.lastCardId, ctx.force);
    if (cardIds.length === 0) {
      const next = { ...blockInput, sourceIndex: blockInput.sourceIndex + 1, lastCardId: null };
      await checkpoint(next);
      return next.sourceIndex >= ctx.sourceTags.length ? done(next) : next;
    }

    const report = await runWithDb(getLocalDb(), () => projectHsdata({
      sourceTag,
      cardIds,
      dryRun:     ctx.dryRun,
      force:      ctx.force,
      sampleDiff: ctx.sampleDiff,
    }));
    const reports = [...blockInput.reports];
    reports[blockInput.sourceIndex] = mergeReport(reports[blockInput.sourceIndex]!, report);
    const next: ProjectionBlockState = {
      ...blockInput,
      lastCardId: cardIds[cardIds.length - 1]!,
      done:       blockInput.done + cardIds.length,
      reports,
    };
    await checkpoint(next);
    progress({ done: Math.min(next.done, next.total), total: next.total });
    return next;
  })
  .exit(({ blockInput }) => blockInput)
  .stage('finalize', { label: '完成', progressMode: 'simple' })
  .handler(async ({ ctx, input }) => {
    if (!ctx.dryRun) {
      await getLocalDb().update(PatchState)
        .set({ projectionStatus: 'completed', projectionError: null, projectedAt: new Date() })
        .where(inArray(PatchState.buildNumber, ctx.sourceTags));
    }
    return { reports: input.reports };
  })
  .build();
