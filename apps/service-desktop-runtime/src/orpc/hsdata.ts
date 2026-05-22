import { ORPCError } from '@orpc/server';
import { runWithDb } from '@tcg-cards/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { SourceVersion } from '@tcg-cards/db/schema/local/hearthstone';

import { os } from './index';
import { importParsedHsdata } from '../lib/hearthstone/hsdata-import';
import {
  getImportJobBySourceId,
  getProjectJobBySourceTag,
  startImportJob,
  startProjectJob,
  updateImportJob,
  updateProjectJob,
} from '../lib/hearthstone/hsdata-progress';
import { projectHsdata } from '../lib/hearthstone/hsdata-project';
import {
  getHsdataRepoState,
  listHsdataSources,
  readHsdataSource,
  syncHsdataRemoteVersions,
} from '../lib/hearthstone/hsdata-repo';
import {
  getLocalHsdataOverview,
  listLocalHsdataSourceVersions,
} from '../lib/hearthstone/hsdata-status';
import { getLocalDb } from '../lib/hearthstone/hsdata-local-db';
import { publishCurrentHsdataToRemote } from '../lib/hearthstone/hsdata-publish';
import {
  computeHsdataSourceHash,
  normalizeHsdataXmlSource,
  parseHsdataXml,
} from '../lib/hearthstone/hsdata-xml';

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

const publishReport = z.object({
  batchId: z.string(),
  publishTargetId: z.string(),
  environment: z.string(),
  targetFingerprint: z.string(),
  manifestHash: z.string(),
  previousManifestHash: z.string().nullable(),
  sourceTagMin: z.number(),
  sourceTagMax: z.number(),
  buildMin: z.number(),
  buildMax: z.number(),
  cardCount: z.number(),
  changedCardCount: z.number(),
  insertedCardCount: z.number(),
  updatedCardCount: z.number(),
  deletedCardCount: z.number(),
  unchangedCardCount: z.number(),
  publishedAt: z.string(),
});

/** Normalizes one thrown value into a runtime RPC error. */
const toRuntimeError = (error: unknown) => {
  if (error instanceof ORPCError) {
    return error;
  }

  return new ORPCError('INTERNAL_SERVER_ERROR', {
    message: error instanceof Error ? error.message : String(error),
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
      return readHsdataSource(input.id);
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

    try {
      const source = readHsdataSource(input.id);
      updateImportJob(job.jobId, {
        sourceTag: source.sourceTag,
        phase: 'parsing_entities',
        message: 'Parsing CardDefs.xml into canonical entity snapshots',
      });

      const xml = normalizeHsdataXmlSource(source.xml);
      const parsed = parseHsdataXml(xml);
      const sourceHash = computeHsdataSourceHash(xml);

      updateImportJob(job.jobId, {
        sourceTag: source.sourceTag,
        phase: 'writing_batches',
        message: 'Writing raw snapshots into the local database',
        totalEntityCount: parsed.entities.length,
        completedEntityCount: 0,
        totalBatchCount: 1,
        completedBatchCount: 0,
        currentBatchIndex: 0,
      });

      const report = await runWithDb(getLocalDb(), () => importParsedHsdata({
        parsed,
        sourceTag: source.sourceTag,
        sourceHash,
        sourceCommit: source.sourceCommit,
        sourceUri: source.sourceUri,
        importEngineVersion: 'desktop-runtime-bun-import:v1',
        dryRun: input.dryRun,
        force: input.force,
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
      });

      return report;
    } catch (error) {
      updateImportJob(job.jobId, {
        phase: 'failed',
        message: error instanceof Error ? error.message : String(error),
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
      });

      return report;
    } catch (error) {
      if (!input.dryRun) {
        await getLocalDb().update(SourceVersion)
          .set({
            projectionStatus: 'failed',
            projectionError:  error instanceof Error ? error.message : String(error),
            projectedAt:      null,
          })
          .where(eq(SourceVersion.sourceTag, input.sourceTag));
      }

      updateProjectJob(input.sourceTag, {
        phase: 'failed',
        message: error instanceof Error ? error.message : String(error),
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

/** Reads the latest in-memory import progress snapshot for one source id. */
const getLocalImportJob = os
  .route({
    method:      'GET',
    description: 'Read the latest in-memory hsdata import job for one source id',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .input(importJobInput)
  .output(z.any().nullable())
  .handler(async ({ input }) => {
    return getImportJobBySourceId(input.sourceId);
  });

/** Reads the latest in-memory projection progress snapshot for one source tag. */
const getLocalProjectJob = os
  .route({
    method:      'GET',
    description: 'Read the latest in-memory hsdata projection job for one source tag',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .input(projectJobInput)
  .output(z.any().nullable())
  .handler(async ({ input }) => getProjectJobBySourceTag(input.sourceTag));

/** Publishes the current local latest projection to the configured remote target through Bun. */
const publishCurrentToRemote = os
  .route({
    method:      'POST',
    description: 'Publish the current local hsdata projection to the configured remote target',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .output(publishReport)
  .handler(async () => {
    try {
      return await publishCurrentHsdataToRemote();
    } catch (error) {
      throw toRuntimeError(error);
    }
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
  getLocalImportJob,
  getLocalProjectJob,
  publishCurrentToRemote,
};
