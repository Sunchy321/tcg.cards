import { ORPCError, eventIterator } from '@orpc/server';
import { runWithDb } from '@tcg-cards/db';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { SourceVersion } from '@tcg-cards/db/schema/local/hearthstone';

import { os } from './index';
import { importParsedHsdata } from '../lib/hearthstone/hsdata-import';
import {
  startImportJob,
  startProjectJob,
  updateImportJob,
  updateProjectJob,
  watchImportJobBySourceId,
  watchProjectJobBySourceTag,
  type HsdataImportProgressEvent,
  type HsdataProjectProgressEvent,
} from '../lib/hearthstone/hsdata-progress';
import { projectHsdata, recomputeLatestProjection } from '../lib/hearthstone/hsdata-project';
import {
  getHsdataRepoState,
  readHsdataImportSource,
  listHsdataSources,
  readHsdataSource,
  syncHsdataRemoteVersions,
} from '../lib/hearthstone/hsdata-repo';
import {
  getLocalHsdataOverview,
  listLocalHsdataSourceVersions,
} from '../lib/hearthstone/hsdata-status';
import { getLocalDb } from '../lib/hearthstone/hsdata-local-db';
import { getIncompletePublishBatch, listPublishBatches, publishCurrentHsdataToRemote, publishReport } from '../lib/hearthstone/hsdata-publish';
import {
  startPublishJob,
  updatePublishJob,
  watchPublishJob,
  type PublishJobProgressEvent,
} from '../lib/hearthstone/hsdata-publish-progress';

const sourceIdInput = z.strictObject({
  id: z.string().trim().min(1),
});

const importSourceInput = z.strictObject({
  id: z.string().trim().min(1),
  dryRun: z.boolean().optional(),
  force: z.boolean().optional(),
});

const projectSourceVersionInput = z.strictObject({
  sourceTag: z.number().int().nonnegative(),
  dryRun: z.boolean().optional(),
  force: z.boolean().optional(),
  skipLatestUpdate: z.boolean().optional(),
  sampleDiff: z.boolean().optional(),
});

const importJobInput = z.strictObject({
  sourceId: z.string().trim().min(1),
});

const projectJobInput = z.strictObject({
  sourceTag: z.number().int().nonnegative(),
});

const sourceFile = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.union([z.literal('tag'), z.literal('worktree')]),
  size: z.number(),
  time: z.string().optional(),
  sourceTag: z.number().optional(),
  sourceCommit: z.string(),
  shortCommit: z.string(),
  sourceUri: z.string(),
});

const repoState = z.object({
  repoPath: z.string().optional(),
});

const syncResult = z.object({
  repoPath: z.string(),
  remote: z.string(),
});

const sourceVersionStatus = z.object({
  sourceTag: z.number(),
  build: z.number().nullable(),
  sourceCommit: z.string(),
  sourceUri: z.string(),
  importStatus: z.string(),
  importedAt: z.string().nullable(),
  projectionStatus: z.string(),
  projectedAt: z.string().nullable(),
  projectionError: z.string().nullable(),
});

/** Reads one object-like cause from an unknown thrown value. */
const readErrorCause = (error: unknown) => {
  let current = error;

  while (current != null && typeof current === 'object') {
    if ('error' in current && (current as { error?: unknown }).error != null) {
      current = (current as { error: unknown }).error;
      continue;
    }

    if (!('cause' in current)) {
      return null;
    }

    const cause = (current as { cause?: unknown }).cause;
    if (cause == null || typeof cause !== 'object') {
      return null;
    }

    if ('code' in cause || 'detail' in cause || 'hint' in cause || 'constraint' in cause) {
      return cause as Record<string, unknown>;
    }

    current = cause;
  }

  return null;
};

/** Builds one compact database error message from a wrapped query failure. */
const formatDbErrorMessage = (error: unknown) => {
  const cause = readErrorCause(error);
  if (cause == null) {
    return null;
  }

  const code = typeof cause.code === 'string' ? cause.code : null;
  const detail = typeof cause.detail === 'string' ? cause.detail : null;
  const hint = typeof cause.hint === 'string' ? cause.hint : null;
  const constraint = typeof cause.constraint === 'string' ? cause.constraint : null;
  const table = typeof cause.table === 'string' ? cause.table : null;
  const column = typeof cause.column === 'string' ? cause.column : null;
  const causeMessage = typeof cause.message === 'string' ? cause.message : null;

  if (
    code == null
    && detail == null
    && hint == null
    && constraint == null
    && table == null
    && column == null
    && causeMessage == null
  ) {
    return null;
  }

  const header = [
    'Database query failed',
    code ? `(${code})` : null,
    table ? `on ${table}` : null,
    column ? `column ${column}` : null,
    constraint ? `constraint ${constraint}` : null,
  ]
    .filter(part => part != null)
    .join(' ');
  const body = detail ?? causeMessage;

  return hint != null
    ? `${header}: ${body ?? 'No detail available'}. Hint: ${hint}`
    : `${header}: ${body ?? 'No detail available'}`;
};

/** Formats one thrown value into the short message shown to desktop clients. */
const formatRuntimeErrorMessage = (error: unknown) => {
  if (error instanceof ORPCError) {
    return error.message;
  }

  const dbMessage = formatDbErrorMessage(error);
  if (dbMessage != null) {
    return dbMessage;
  }

  if (error instanceof Error) {
    return error.message.startsWith('Failed query:')
      ? 'Database query failed'
      : error.message;
  }

  return String(error);
};

/** Normalizes one thrown value into a runtime RPC error. */
const toRuntimeError = (error: unknown) => {
  if (error instanceof ORPCError) {
    return error;
  }

  return new ORPCError('INTERNAL_SERVER_ERROR', {
    message: formatRuntimeErrorMessage(error),
  });
};

/** Reads the current hsdata repository path already configured in the local runtime. */
const getRepoState = os
  .route({
    method:      'GET',
    description: 'Read the current hsdata repository path',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .output(repoState)
  .handler(async () => getHsdataRepoState());

/** Refreshes hsdata tags from the configured local repository remote. */
const syncRemoteVersions = os
  .route({
    method:      'POST',
    description: 'Fetch remote hsdata tags into the configured local repository',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .output(syncResult)
  .handler(async () => {
    try {
      return syncHsdataRemoteVersions();
    } catch (error) {
      throw toRuntimeError(error);
    }
  });

/** Lists hsdata sources discoverable from the configured local repository. */
const listSources = os
  .route({
    method:      'GET',
    description: 'List hsdata sources from the configured local repository',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .output(z.array(sourceFile))
  .handler(async () => {
    try {
      return listHsdataSources();
    } catch (error) {
      throw toRuntimeError(error);
    }
  });

/** Reads one hsdata XML source from the configured local repository. */
const readSource = os
  .route({
    method:      'GET',
    description: 'Read one hsdata source with its XML payload',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .input(sourceIdInput)
  .output(sourceFile.extend({
    xml: z.string(),
    sourceTag: z.number(),
  }))
  .handler(async ({ input }) => {
    try {
      return await readHsdataSource(input.id);
    } catch (error) {
      throw toRuntimeError(error);
    }
  });

/** Imports one hsdata source into the local raw snapshot tables through the Bun runtime. */
const importSource = os
  .route({
    method:      'POST',
    description: 'Import one hsdata source into the local database',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .input(importSourceInput)
  .output(z.any())
  .handler(async ({ input }) => {
    const job = startImportJob({
      sourceId: input.id,
      sourceTag: null,
      message: 'Reading hsdata source from the local repository',
      totalBatchCount: 1,
      totalEntityCount: null,
    });
    updateImportJob(job.jobId, {
      totalWorkCount: 1,
      completedWorkCount: 0,
      workLabel: 'source',
    });

    try {
      const source = await readHsdataImportSource(input.id);
      updateImportJob(job.jobId, {
        sourceTag: source.sourceTag,
        phase: 'parsing_entities',
        message: 'Parsing CardDefs.xml into canonical entity snapshots',
        totalEntityCount: source.parsed.entities.length,
        completedEntityCount: 0,
        totalWorkCount: source.parsed.entities.length,
        completedWorkCount: 0,
        workLabel: 'entity',
      });

      const report = await runWithDb(getLocalDb(), () => importParsedHsdata({
        parsed: source.parsed,
        sourceTag: source.sourceTag,
        sourceHash: source.sourceHash,
        sourceCommit: source.sourceCommit,
        sourceUri: source.sourceUri,
        importEngineVersion: 'desktop-runtime-bun-import:v1',
        dryRun: input.dryRun,
        force: input.force,
        onProgress(progress) {
          updateImportJob(job.jobId, {
            sourceTag: source.sourceTag,
            ...progress,
          });
        },
      }));

      updateImportJob(job.jobId, {
        sourceTag: source.sourceTag,
        phase: 'completed',
        message: 'Completed hsdata import',
        totalEntityCount: report.entityCount,
        completedEntityCount: report.entityCount,
        totalBatchCount: 1,
        completedBatchCount: 1,
        currentBatchIndex: 1,
        totalWorkCount: report.entityCount,
        completedWorkCount: report.entityCount,
        workLabel: 'entity',
      });

      return report;
    } catch (error) {
      const message = formatRuntimeErrorMessage(error);
      updateImportJob(job.jobId, {
        phase: 'failed',
        message,
        workLabel: null,
      });
      throw toRuntimeError(error);
    }
  });

/** Projects one imported source version into the shared card tables through the Bun runtime. */
const projectSourceVersion = os
  .route({
    method:      'POST',
    description: 'Project one imported hsdata source version into shared rows',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .input(projectSourceVersionInput)
  .output(z.any())
  .handler(async ({ input }) => {
    startProjectJob({
      sourceTag: input.sourceTag,
      message: 'Loading raw snapshots from the local database',
    });

    try {
      const database = getLocalDb();

      if (!input.dryRun) {
        await database.update(SourceVersion)
          .set({
            projectionStatus: 'processing',
            projectionError:  null,
            projectedAt:      null,
          })
          .where(eq(SourceVersion.sourceTag, input.sourceTag));
      }

      const report = await runWithDb(database, () => projectHsdata({
        sourceTag: input.sourceTag,
        dryRun: input.dryRun,
        force: input.force,
        skipLatestUpdate: input.skipLatestUpdate,
        sampleDiff: input.sampleDiff,
        onProgress(progress) {
          updateProjectJob(input.sourceTag, progress);
        },
      }));

      if (!input.dryRun) {
        await database.update(SourceVersion)
          .set({
            projectionStatus: 'completed',
            projectionError:  null,
            projectedAt:      new Date(),
          })
          .where(eq(SourceVersion.sourceTag, input.sourceTag));
      }

      updateProjectJob(input.sourceTag, {
        phase: 'completed',
        message: 'Completed hsdata projection',
        totalSnapshotCount: report.snapshotCount,
        completedSnapshotCount: report.snapshotCount,
        totalWorkCount: report.snapshotCount,
        completedWorkCount: report.snapshotCount,
        workLabel: 'snapshot',
        writeBreakdown: null,
        reconciledCounts: {
          reusedEntities:        report.reusedEntities,
          reusedLocalizations:   report.reusedLocalizations,
          reusedRelations:       report.reusedRelations,
          insertedEntities:      report.insertedEntities,
          insertedLocalizations: report.insertedLocalizations,
          insertedRelations:     report.insertedRelations,
          updatedEntities:       report.updatedEntities,
          updatedLocalizations:  report.updatedLocalizations,
          updatedRelations:      report.updatedRelations,
        },
      });

      return report;
    } catch (error) {
      const message = formatRuntimeErrorMessage(error);
      if (!input.dryRun) {
        await getLocalDb().update(SourceVersion)
          .set({
            projectionStatus: 'failed',
            projectionError:  message,
            projectedAt:      null,
          })
          .where(eq(SourceVersion.sourceTag, input.sourceTag));
      }

      updateProjectJob(input.sourceTag, {
        phase: 'failed',
        message,
        workLabel: null,
        writeBreakdown: null,
      });
      throw toRuntimeError(error);
    }
  });

/** Lists local hsdata source version rows from the configured PostgreSQL database. */
const listLocalSourceVersions = os
  .route({
    method:      'GET',
    description: 'List local hsdata source versions',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .output(z.array(sourceVersionStatus))
  .handler(async () => await listLocalHsdataSourceVersions());

/** Reads the local hsdata overview cards from the configured PostgreSQL database. */
const getLocalOverview = os
  .route({
    method:      'GET',
    description: 'Read the local hsdata overview',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .output(z.any())
  .handler(async () => await getLocalHsdataOverview());

/** Streams in-memory import progress updates for one source id. */
const watchImportJob = os
  .route({
    method:      'GET',
    description: 'Stream in-memory hsdata import progress for one source id',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .input(importJobInput)
  .output(eventIterator(z.custom<HsdataImportProgressEvent>()))
  .handler(async function* ({ input }) {
    yield* watchImportJobBySourceId(input.sourceId);
  });

/** Streams in-memory projection progress updates for one source tag. */
const watchProjectJob = os
  .route({
    method:      'GET',
    description: 'Stream in-memory hsdata projection progress for one source tag',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .input(projectJobInput)
  .output(eventIterator(z.custom<HsdataProjectProgressEvent>()))
  .handler(async function* ({ input }) {
    yield* watchProjectJobBySourceTag(input.sourceTag);
  });

/** Publishes the current local latest projection to the configured remote target through Bun. */
const publishCurrentToRemote = os
  .route({
    method:      'POST',
    description: 'Publish the current local hsdata projection to the configured remote target',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .input(z.strictObject({
    dryRun: z.boolean().optional(),
  }))
  .output(publishReport)
  .handler(async ({ input }) => {
    const job = startPublishJob({ publishType: 'card_data', publishTargetId: '' });

    try {
      const report = await publishCurrentHsdataToRemote({
        publishType: 'card_data',
        dryRun: input.dryRun,
        onProgress: (event) => {
          updatePublishJob({
            phase: event.phase,
            message: event.message,
            totalRowCount: event.totalRowCount,
            completedRowCount: event.completedRowCount,
          });
        },
      });

      updatePublishJob({ phase: 'completed', message: '发布完成', report });

      return report;
    } catch (error) {
      updatePublishJob({ phase: 'failed', message: error instanceof Error ? error.message : String(error) });
      throw toRuntimeError(error);
    }
  });

/** Streams real-time publish job progress events. */
const watchPublishJobRoute = os
  .route({
    method:      'GET',
    description: 'Watch publish job progress events',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .output(eventIterator(z.custom<PublishJobProgressEvent>()))
  .handler(async function* () {
    yield* watchPublishJob();
  });

const recomputeLatestOutput = z.object({
  entityRowCount: z.number(),
  localizationRowCount: z.number(),
  relationRowCount: z.number(),
  entityUpdatedCount: z.number(),
  localizationUpdatedCount: z.number(),
  relationUpdatedCount: z.number(),
});

/** Recomputes isLatest flags across the current local projection tables. */
const recomputeLatest = os
  .route({
    method:      'POST',
    description: 'Recompute isLatest across all local hearthstone projection tables',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .output(recomputeLatestOutput)
  .handler(async () => {
    try {
      return await recomputeLatestProjection();
    } catch (error) {
      throw toRuntimeError(error);
    }
  });

/** Lists publish batches for the current target. */
const listPublishBatchesRoute = os
  .route({
    method:      'GET',
    description: 'List publish batches for the current target',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .output(z.array(publishReport))
  .handler(async () => {
    try {
      return await listPublishBatches();
    } catch (error) {
      throw toRuntimeError(error);
    }
  });

/** Checks for an incomplete publish batch that can be resumed. */
const getIncompletePublishBatchRoute = os
  .route({
    method:      'GET',
    description: 'Check for an incomplete publish batch',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .output(publishReport.nullable())
  .handler(async () => {
    try {
      return await getIncompletePublishBatch();
    } catch (error) {
      throw toRuntimeError(error);
    }
  });

const batchResetInput = z.strictObject({
  sourceTags: z.array(z.number().int().nonnegative()).min(1),
});

const batchResetResult = z.strictObject({
  resetCount: z.number().int().nonnegative(),
});

/** Resets import status for selected sourceTags to pending so they can be re-imported. */
const resetImportStatus = os
  .route({
    method:      'POST',
    description: 'Batch reset import status for selected sourceTags',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .input(batchResetInput)
  .output(batchResetResult)
  .handler(async ({ input }) => {
    return await runWithDb(getLocalDb(), async () => {
      const db = getLocalDb();

      const result = await db.update(SourceVersion)
        .set({
          status:           'pending',
          importedAt:       null,
          projectionStatus: 'not_started',
          projectedAt:      null,
        })
        .where(inArray(SourceVersion.sourceTag, input.sourceTags))
        .returning({ sourceTag: SourceVersion.sourceTag });

      return { resetCount: result.length };
    });
  });

/** Resets projection status for selected sourceTags to not_started. */
const resetProjectionStatus = os
  .route({
    method:      'POST',
    description: 'Batch reset projection status for selected sourceTags',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .input(batchResetInput)
  .output(batchResetResult)
  .handler(async ({ input }) => {
    return await runWithDb(getLocalDb(), async () => {
      const db = getLocalDb();

      const result = await db.update(SourceVersion)
        .set({
          projectionStatus: 'not_started',
          projectedAt:      null,
        })
        .where(inArray(SourceVersion.sourceTag, input.sourceTags))
        .returning({ sourceTag: SourceVersion.sourceTag });

      return { resetCount: result.length };
    });
  });

/** Groups the desktop runtime hsdata procedures under one router namespace. */
export const hsdataRouter = {
  getRepoState,
  syncRemoteVersions,
  listSources,
  readSource,
  importSource,
  projectSourceVersion,
  listLocalSourceVersions,
  getLocalOverview,
  watchImportJob,
  watchProjectJob,
  publishCurrentToRemote,
  watchPublishJob: watchPublishJobRoute,
  listPublishBatches: listPublishBatchesRoute,
  getIncompletePublishBatch: getIncompletePublishBatchRoute,
  recomputeLatest,
  resetImportStatus,
  resetProjectionStatus,
};
