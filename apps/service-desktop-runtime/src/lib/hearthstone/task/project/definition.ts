import { z } from 'zod';

import { and, asc, countDistinct, eq, gt, inArray, isNotNull, ne, sql } from 'drizzle-orm';

import { ExtractedCard, PatchState, RawEntitySnapshot, RawEntitySnapshotTag } from '@tcg-cards/db/schema/local/hearthstone';

import { createDefinition } from '#task/definition';
import { getLocalDb } from '../../hsdata-local-db';
import { projectExtracted, projectHsdataFallback } from './project';
import type { ProjectReport } from './types';

export const projectTaskType = 'hearthstone_project';

const CARD_CHUNK_SIZE = 500;

const input = z.object({
  sourceTags: z.array(z.number().int().nonnegative()).min(1),
  dryRun:     z.boolean().optional().default(false),
  force:      z.boolean().optional().default(false),
  sampleDiff: z.boolean().optional().default(false),
});

const output = z.object({
  reports: z.array(z.any()),
});

interface ProjectionSourceReport extends ProjectReport {
  sampleDiffPaths: string[];
}

interface ProjectionBlockState {
  sourceIndex: number;
  lastCardId:  string | null;
  done:        number;
  total:       number;
  reports:     ProjectionSourceReport[];
}

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

function mergeDiff(left: ProjectReport['entityDiff'], right: ProjectReport['localizationDiff']) {
  return {
    versionMatch:           left.versionMatch + right.versionMatch,
    versionChanged:         left.versionChanged + right.versionChanged,
    orphanVersionChanged:   left.orphanVersionChanged + right.orphanVersionChanged,
    renderHashChanged:      (left.renderHashChanged ?? 0) + (right.renderHashChanged ?? 0),
    renderHashNullExisting: (left.renderHashNullExisting ?? 0) + (right.renderHashNullExisting ?? 0),
  };
}

function mergeReport(current: ProjectionSourceReport, report: ProjectReport): ProjectionSourceReport {
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

async function countProjectionCards(sourceTags: number[], force: boolean): Promise<number> {
  const database = getLocalDb();

  const states = await database.select({
    buildNumber:  PatchState.buildNumber,
    unpackStatus: PatchState.unpackStatus,
  }).from(PatchState)
    .where(inArray(PatchState.buildNumber, sourceTags));
  const stateByTag = new Map(states.map(s => [s.buildNumber, s.unpackStatus]));

  console.log(`[projection] counting cards for ${sourceTags.length} source tags...`);

  const counts = await Promise.all(sourceTags.map(async sourceTag => {
    const unpackStatus = stateByTag.get(sourceTag);
    if (unpackStatus === 'completed') {
      const [row] = await database.select({ count: countDistinct(ExtractedCard.cardId) })
        .from(ExtractedCard)
        .where(and(
          sql<boolean>`${sourceTag} = any(${ExtractedCard.buildNumbers})`,
          force ? undefined : ne(ExtractedCard.projectionState, 'projected'),
        ));
      return Number(row?.count ?? 0);
    }
    const [row] = await database.select({
      count: countDistinct(RawEntitySnapshot.cardId),
    }).from(RawEntitySnapshot).where(and(
      sql<boolean>`${sourceTag} = any(${RawEntitySnapshot.sourceTags})`,
      force ? undefined : ne(RawEntitySnapshot.projectionState, 'projected'),
    ));
    return Number(row?.count ?? 0);
  }));

  const total = counts.reduce((a, b) => a + b, 0);
  console.log(`[projection] total cards to project: ${total}`);
  return total;
}

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
    .limit(CARD_CHUNK_SIZE);
  return rows.map(row => row.cardId);
}

async function loadExtractedCardIds(build: number, lastCardId: string | null, force: boolean): Promise<string[]> {
  const database = getLocalDb();
  const rows = await database.selectDistinct({ cardId: ExtractedCard.cardId })
    .from(ExtractedCard)
    .where(and(
      sql<boolean>`${build} = any(${ExtractedCard.buildNumbers})`,
      force ? undefined : ne(ExtractedCard.projectionState, 'projected'),
      lastCardId == null ? undefined : gt(ExtractedCard.cardId, lastCardId),
    ))
    .orderBy(asc(ExtractedCard.cardId))
    .limit(CARD_CHUNK_SIZE);
  return rows.map(row => row.cardId);
}

export const projectTaskDefinition = createDefinition(projectTaskType, {
  version:     '2026-07-21:v2',
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
      const [state] = await getLocalDb().select({
        unpackStatus: PatchState.unpackStatus,
        importStatus: PatchState.importStatus,
      }).from(PatchState)
        .where(eq(PatchState.buildNumber, sourceTag));
      if (!state) {
        throw new Error(`sourceTag ${sourceTag} does not exist`);
      }
      if (state.importStatus !== 'completed' && state.unpackStatus !== 'completed') {
        throw new Error(`sourceTag ${sourceTag} is not imported (neither hsdata nor unpack)`);
      }
    }
    return ctx;
  })
  .stage('projecting', { label: '分块投影', progressMode: 'bounded', resumeMode: 'durable' })
  .entry(async ({ ctx, checkpoint }) => {
    const restored = checkpoint?.blockInput as ProjectionBlockState | undefined;
    const total = restored?.total ?? await countProjectionCards(ctx.sourceTags, ctx.force);

    // Pre-load build-level data that every block needs
    const database = getLocalDb();
    const build = ctx.sourceTags[0]!;
    const t0 = Date.now();

    const buildCards = await database.select()
      .from(ExtractedCard)
      .where(sql<boolean>`${build} = any(${ExtractedCard.buildNumbers})`);
    console.log(`[projection] buildCards cached: ${buildCards.length} in ${Date.now() - t0}ms`);

    // Load hsdata TAG 183 fallback once
    const hsdataSetTags = await database.select({
      dbfId:    RawEntitySnapshot.dbfId,
      intValue: RawEntitySnapshotTag.intValue,
    }).from(RawEntitySnapshotTag)
      .innerJoin(RawEntitySnapshot, eq(RawEntitySnapshotTag.snapshotId, RawEntitySnapshot.id))
      .where(and(
        eq(RawEntitySnapshotTag.enumId, 183),
        isNotNull(RawEntitySnapshotTag.intValue),
      ));
    const hsdataSetByDbfId = new Map(hsdataSetTags.map(r => [r.dbfId, r.intValue!]));
    console.log(`[projection] hsdata set cache: ${hsdataSetTags.length} in ${Date.now() - t0}ms`);

    (ctx as any).buildCardsCache = buildCards;
    (ctx as any).hsdataSetCache = hsdataSetByDbfId;

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

    // Check if this sourceTag has unpack data available
    const [patchState] = await getLocalDb().select({ unpackStatus: PatchState.unpackStatus })
      .from(PatchState)
      .where(eq(PatchState.buildNumber, sourceTag));

    const useExtracted = patchState?.unpackStatus === 'completed';

    if (useExtracted) {
      const cardIds = await loadExtractedCardIds(sourceTag, blockInput.lastCardId, ctx.force);
      if (cardIds.length === 0) {
        // Build fully processed — mark completed so shared-snapshot marking can
        // tell which builds are done regardless of processing order.
        if (!ctx.dryRun) {
          await getLocalDb().update(PatchState)
            .set({ projectionStatus: 'completed', projectionError: null, projectedAt: new Date() })
            .where(eq(PatchState.buildNumber, sourceTag));
        }
        const next = { ...blockInput, sourceIndex: blockInput.sourceIndex + 1, lastCardId: null };
        await checkpoint(next);
        return next.sourceIndex >= ctx.sourceTags.length ? done(next) : next;
      }

      const c = ctx as any;
      const report = await projectExtracted(sourceTag, cardIds, ctx.dryRun, c.buildCardsCache, c.hsdataSetCache);
      const reports = [...blockInput.reports];
      reports[blockInput.sourceIndex] = mergeReport(reports[blockInput.sourceIndex]!, report);
      const doneCount = blockInput.done + cardIds.length;
      const next: ProjectionBlockState = {
        ...blockInput,
        lastCardId: cardIds[cardIds.length - 1]!,
        done:       doneCount,
        reports,
      };
      await checkpoint(next);
      console.log(`[projection] block done: ${doneCount}/${blockInput.total} (${Math.round(doneCount / blockInput.total * 100)}%)`);
      progress({ done: Math.min(next.done, next.total), total: next.total });
      return next;
    }

    // hsdata fallback: iterate card blocks
    const cardIds = await loadProjectionCardIds(sourceTag, blockInput.lastCardId, ctx.force);
    if (cardIds.length === 0) {
      if (!ctx.dryRun) {
        await getLocalDb().update(PatchState)
          .set({ projectionStatus: 'completed', projectionError: null, projectedAt: new Date() })
          .where(eq(PatchState.buildNumber, sourceTag));
      }
      const next = { ...blockInput, sourceIndex: blockInput.sourceIndex + 1, lastCardId: null };
      await checkpoint(next);
      return next.sourceIndex >= ctx.sourceTags.length ? done(next) : next;
    }

    const report = await projectHsdataFallback(sourceTag, cardIds, ctx.dryRun);
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
