import { ORPCError, eventIterator } from '@orpc/server';
import { runWithDb } from '@tcg-cards/db';
import { eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { RawEntitySnapshot, SourceVersion } from '@tcg-cards/db/schema/local/hearthstone';

import { os } from './index';
import { importParsedHsdata } from '../lib/hearthstone/hsdata-import';
import {
  startImportJob,
  startProjectJob,
  updateImportJob,
  updateProjectJob,
  watchImportJobBySourceId,
  watchProjectJobBySourceTag,
  startRecomputeLatestJob,
  updateRecomputeLatestJob,
  watchRecomputeLatestJob,
  type HsdataImportProgressEvent,
  type HsdataProjectProgressEvent,
  type HsdataRecomputeLatestProgressEvent,
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
import { cancelIncompletePublishBatch, getIncompletePublishBatch, listPublishBatches, publishReport, publishSingleCard, reanchorCurrentHsdataPublishBaseline, singleCardPublishReport } from '../lib/hearthstone/hsdata-publish';
import {
  clearPublishJobController,
  createPublishJobController,
  PublishJobInterruptedError,
  startPublishJob,
  stopPublishJob,
  type PublishJobProgressEvent,
  updatePublishJob,
  watchPublishJob,
} from '../lib/hearthstone/hsdata-publish-progress';
import {
  cancelPublishTask,
  createPublishTask,
  getPublishTaskSnapshot,
  stopActivePublishTask,
  watchPublishTaskEvents,
  watchPublishTaskProgressEvents,
} from '../lib/hearthstone/task/publish';
import { taskPageEvent, taskPageSnapshot } from '@tcg-cards/model/src/task';

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

const publishStreamInput = z.strictObject({
  publishTarget: z.literal('hearthstone'),
  environment: z.string().trim().min(1),
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

  if (error instanceof Error) {
    if (
      error.message.includes('is already leased by another publish batch')
      || error.message.includes('lease could not be renewed')
    ) {
      return new ORPCError('CONFLICT', {
        message: error.message,
      });
    }
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

/** Reanchors the local publish baseline from the current local projection without touching remote state. */
const reanchorCurrentPublishBaseline = os
  .route({
    method:      'POST',
    description: 'Reanchor the local publish baseline from the current local projection',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .input(publishStreamInput)
  .output(publishReport)
  .handler(async ({ input }) => {
    const job = startPublishJob({
      publishType: 'card_data',
      publishTarget: `${input.publishTarget}/${input.environment}`,
    });
    createPublishJobController();

    try {
      const report = await reanchorCurrentHsdataPublishBaseline({
        publishType: 'card_data',
        publishTarget: input.publishTarget,
        environment: input.environment,
        onProgress: (event) => {
          updatePublishJob({
            phase: event.phase,
            message: event.message,
            totalRowCount: event.total ?? null,
            completedRowCount: event.completed ?? null,
          });
        },
      });

      updatePublishJob({ phase: 'completed', message: '本地 baseline 重锚完成', report });

      return report;
    } catch (error) {
      if (error instanceof PublishJobInterruptedError) {
        updatePublishJob({
          phase: error.phase,
          message: error.message,
        });
        throw new ORPCError('BAD_REQUEST', {
          message: error.message,
        });
      }

      updatePublishJob({ phase: 'failed', message: error instanceof Error ? error.message : String(error) });
      throw toRuntimeError(error);
    } finally {
      clearPublishJobController();
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
    try {
      yield* watchPublishTaskProgressEvents();
      return;
    } catch {
      yield* watchPublishJob();
    }
  });

const publishJobControlResult = z.strictObject({
  batchId: z.string(),
});

const cancelPublishBatchInput = publishStreamInput.extend({
  batchId: z.string().uuid(),
});

/** Requests a cooperative stop of the current publish or reanchor job. */
const stopPublishJobRoute = os
  .route({
    method:      'POST',
    description: 'Stop the current Hearthstone publish job',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .output(publishJobControlResult)
  .handler(async () => {
    try {
      return await stopActivePublishTask();
    } catch (error) {
      const state = stopPublishJob();

      if (state != null) {
        return { batchId: state.batchId };
      }

      throw toRuntimeError(error);
    }
  });

/** Cancels one residual publish batch row that is still marked running in the local database. */
const cancelIncompletePublishBatchRoute = os
  .route({
    method:      'POST',
    description: 'Cancel one incomplete Hearthstone publish batch left in the local database',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .input(cancelPublishBatchInput)
  .output(publishReport)
  .handler(async ({ input }) => {
    try {
      const result = await cancelIncompletePublishBatch(input);

      // Also cancel the corresponding TaskRun if it exists
      cancelPublishTask(input.batchId).catch(() => {
        // TaskRun may not exist or already be terminal — that's fine.
      });

      return result;
    } catch (error) {
      throw toRuntimeError(error);
    }
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
      startRecomputeLatestJob({
        message: 'Loading entity rows from local database',
        totalRowCount: null,
      });

      const result = await recomputeLatestProjection({
        onProgress(event) {
          updateRecomputeLatestJob({
            phase: event.phase,
            message: event.message,
            totalRowCount: event.totalRowCount,
            completedRowCount: event.completedRowCount,
            updatedCount: event.updatedCount,
          });
        },
      });

      updateRecomputeLatestJob({
        phase: 'completed',
        message: 'Recompute latest completed',
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateRecomputeLatestJob({ phase: 'failed', message });
      throw toRuntimeError(error);
    }
  });

/** Streams real-time recompute-latest progress events. */
const watchRecomputeLatest = os
  .route({
    method:      'GET',
    description: 'Watch recompute latest progress events',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .output(eventIterator(z.custom<HsdataRecomputeLatestProgressEvent>()))
  .handler(async function* () {
    yield* watchRecomputeLatestJob();
  });

/** Lists publish batches for the current target. */
const listPublishBatchesRoute = os
  .route({
    method:      'GET',
    description: 'List publish batches for the current target',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .input(publishStreamInput)
  .output(z.array(publishReport))
  .handler(async ({ input }) => {
    try {
      return await listPublishBatches(input);
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
  .input(publishStreamInput)
  .output(publishReport.nullable())
  .handler(async ({ input }) => {
    try {
      const legacy = await getIncompletePublishBatch(input);

      if (legacy) {
        return legacy;
      }

      // Fallback: check for active TaskRun through the generic store.
      // The page will be migrated to read from getPublishTaskSnapshot in step 8.7.
      return null;
    } catch (error) {
      throw toRuntimeError(error);
    }
  });

/** Publishes a single card from the local projection to the remote target (dev tool). */
const publishSingleCardRoute = os
  .route({
    method:      'POST',
    description: 'Publish a single card to the remote target',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .input(z.strictObject({
    cardId: z.string().trim().min(1),
    publishTarget: z.literal('hearthstone'),
    environment: z.string().trim().min(1),
  }))
  .output(singleCardPublishReport)
  .handler(async ({ input }) => {
    try {
      return await publishSingleCard(input.cardId, input);
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

      for (const sourceTag of input.sourceTags) {
        await db.update(RawEntitySnapshot)
          .set({ projected: false })
          .where(sql<boolean>`${sourceTag} = ANY(${RawEntitySnapshot.sourceTags})`);
      }

      return { resetCount: result.length };
    });
  });

/*
 * ── Hearthstone Task ──────────────────────────────────
 */

/** Creates a publish task and returns the initial snapshot. */
const taskPublishCreate = os
  .route({
    method:      'POST',
    description: 'Create a publish task and return the initial snapshot',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Task'],
  })
  .input(z.strictObject({
    publishTarget: z.literal('hearthstone'),
    environment: z.string().trim().min(1),
    dryRun: z.boolean().optional(),
  }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    await createPublishTask({
      taskType: 'hsdata_publish',
      scope: {
        publishTarget: input.publishTarget,
        environment: input.environment,
        publishType: 'card_data',
      },
      params: {
        publishType: 'card_data',
        dryRun: input.dryRun,
        operationKind: 'publish',
      },
    });

    const snapshot = await getPublishTaskSnapshot({
      publishTarget: input.publishTarget,
      environment: input.environment,
      publishType: 'card_data',
    });

    return snapshot;
  });

/** Returns the current publish task snapshot for one stream, or idle. */
const taskPublishSnapshot = os
  .route({
    method:      'GET',
    description: 'Read the current publish task snapshot',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Task'],
  })
  .input(publishStreamInput)
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    const result = await getPublishTaskSnapshot({
      publishTarget: input.publishTarget,
      environment: input.environment,
      publishType: 'card_data',
    });

    return result;
  });

/** Streams publish task snapshot changes in real time. */
const taskPublishWatch = os
  .route({
    method:      'GET',
    description: 'Stream publish task snapshot changes',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Task'],
  })
  .output(eventIterator(taskPageEvent))
  .handler(async function* () {
    yield* watchPublishTaskEvents();
  });

/** Cancels one active publish task. */
const taskPublishCancel = os
  .route({
    method:      'POST',
    description: 'Cancel one active publish task',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Task'],
  })
  .input(z.strictObject({
    taskRunId: z.string().uuid(),
  }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    await cancelPublishTask(input.taskRunId);
    return { pageTask: { kind: 'idle' }, stages: [] };
  });

/** Groups the desktop runtime hsdata procedures under one router namespace. */
export const hsdataRouter = {
  task: {
    publish: {
      create: taskPublishCreate,
      snapshot: taskPublishSnapshot,
      watch: taskPublishWatch,
      cancel: taskPublishCancel,
    },
  },

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
  reanchorCurrentPublishBaseline,
  watchPublishJob: watchPublishJobRoute,
  stopPublishJob: stopPublishJobRoute,
  cancelIncompletePublishBatch: cancelIncompletePublishBatchRoute,
  listPublishBatches: listPublishBatchesRoute,
  getIncompletePublishBatch: getIncompletePublishBatchRoute,
  publishSingleCard: publishSingleCardRoute,
  recomputeLatest,
  watchRecomputeLatest,
  resetImportStatus,
  resetProjectionStatus,
};
