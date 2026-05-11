import { ORPCError, os } from '@orpc/server';
import { z } from 'zod';

import { getHsdataImportJobErrorCode } from '../../../lib/hearthstone/hsdata-import-job-error';
import {
  createHsdataImportJob,
  finalizeHsdataImportJob,
  getHsdataImportJobState,
} from '../../../lib/hearthstone/hsdata-import-job';
import { getHsdataOverview } from '../../../lib/hearthstone/hsdata-overview';
import { projectHsdata } from '../../../lib/hearthstone/hsdata-project';
import { listHsdataSourceVersions } from '../../../lib/hearthstone/hsdata-source-version';

const hsdataHash = z.string().trim().min(1);

const hsdataImportReport = z.object({
  dryRun:                z.boolean(),
  skipped:               z.boolean(),
  sourceTag:             z.number().int().positive(),
  build:                 z.number().int().nonnegative(),
  sourceHash:            z.string(),
  entityCount:           z.number().int().nonnegative(),
  insertedSnapshots:     z.number().int().nonnegative(),
  reusedSnapshots:       z.number().int().nonnegative(),
  insertedTagRows:       z.number().int().nonnegative(),
  discoveredTagCount:    z.number().int().nonnegative(),
  updatedDiscoveredTags: z.number().int().nonnegative(),
  fallbackTagRowCount:   z.number().int().nonnegative(),
  latestSnapshotCount:   z.number().int().nonnegative(),
  discoveredTags:        z.array(z.number().int().nonnegative()),
});

const hsdataImportChunkManifestItem = z.object({
  chunkIndex:  z.number().int().nonnegative(),
  payloadHash: hsdataHash,
  entityCount: z.number().int().positive(),
});

const hsdataImportJobInput = z.object({
  jobId: z.string().uuid(),
});

const hsdataCreateImportJobInput = z.object({
  sourceTag:           z.number().int().positive(),
  sourceCommit:        z.string().trim().min(1).optional().nullable(),
  sourceUri:           z.string().trim().min(1).optional().nullable(),
  build:               z.number().int().nonnegative(),
  sourceHash:          hsdataHash,
  chunkingVersion:     z.string().trim().min(1),
  payloadFormatVersion: z.string().trim().min(1),
  payloadEncoding:      z.string().trim().min(1),
  importEngineVersion:  z.string().trim().min(1),
  maxBytesPerChunk:    z.number().int().positive(),
  maxEntitiesPerChunk: z.number().int().positive(),
  dryRun:              z.boolean().optional(),
  force:               z.boolean().optional(),
  totalChunkCount:     z.number().int().positive(),
  totalEntityCount:    z.number().int().positive(),
  chunks:              z.array(hsdataImportChunkManifestItem).min(1),
});

const hsdataCreateImportJobResult = z.object({
  jobId:        z.string().uuid(),
  manifestHash: hsdataHash,
});

const hsdataImportJobStatus = z.enum([
  'uploading',
  'ready_to_finalize',
  'finalizing',
  'completed',
  'failed',
]);

const hsdataImportCleanupStatus = z.enum([
  'not_started',
  'pending',
  'succeeded',
  'failed',
]);

const hsdataImportJobState = z.object({
  jobId:                z.string().uuid(),
  sourceTag:            z.number().int().positive(),
  build:                z.number().int().nonnegative(),
  sourceHash:           hsdataHash,
  dryRun:               z.boolean(),
  force:                z.boolean(),
  status:               hsdataImportJobStatus,
  stagingCleanupStatus: hsdataImportCleanupStatus,
  totalChunkCount:      z.number().int().positive(),
  totalEntityCount:     z.number().int().positive(),
  completedChunkCount:  z.number().int().nonnegative(),
  failedChunkCount:     z.number().int().nonnegative(),
  processingChunkCount: z.number().int().nonnegative(),
  report:               hsdataImportReport.nullable(),
  error:                z.string().nullable(),
  stagingCleanupError:  z.string().nullable(),
  cleanedAt:            z.string().nullable(),
  finalizedAt:          z.string().nullable(),
});

const hsdataProjectInput = z.object({
  sourceTag: z.number().int().positive(),
  dryRun:    z.boolean().optional(),
  force:     z.boolean().optional(),
});

const hsdataProjectReport = z.object({
  dryRun:                z.boolean(),
  skipped:               z.boolean(),
  sourceTag:             z.number().int().positive(),
  build:                 z.number().int().nonnegative(),
  snapshotCount:         z.number().int().nonnegative(),
  insertedEntities:      z.number().int().nonnegative(),
  reusedEntities:        z.number().int().nonnegative(),
  updatedEntities:       z.number().int().nonnegative(),
  insertedLocalizations: z.number().int().nonnegative(),
  reusedLocalizations:   z.number().int().nonnegative(),
  updatedLocalizations:  z.number().int().nonnegative(),
  insertedRelations:     z.number().int().nonnegative(),
  updatedRelations:      z.number().int().nonnegative(),
  unprojectedTagCount:   z.number().int().nonnegative(),
});

const hsdataImportStatus = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
]);

const hsdataProjectionStatus = z.enum([
  'not_started',
  'processing',
  'completed',
  'failed',
]);

const hsdataSourceVersionStatus = z.object({
  sourceTag:        z.number().int().positive(),
  build:            z.number().int().nonnegative().nullable(),
  sourceCommit:     z.string(),
  sourceUri:        z.string(),
  importStatus:     hsdataImportStatus,
  importedAt:       z.string().nullable(),
  projectionStatus: hsdataProjectionStatus,
  projectedAt:      z.string().nullable(),
  projectionError:  z.string().nullable(),
});

const hsdataOverview = z.object({
  summary: z.object({
    sourceVersionCount:          z.number().int().nonnegative(),
    completedSourceVersionCount: z.number().int().nonnegative(),
    failedSourceVersionCount:    z.number().int().nonnegative(),
    snapshotCount:               z.number().int().nonnegative(),
    latestSnapshotCount:         z.number().int().nonnegative(),
    tagRowCount:                 z.number().int().nonnegative(),
  }),
  tables: z.object({
    sourceVersions: z.object({
      name:                     z.literal('source_versions'),
      kind:                     z.literal('table'),
      rows:                     z.number().int().nonnegative(),
      latestImportedAt:         z.string().optional(),
      latestCompletedSourceTag: z.number().int().positive().optional(),
      statusCounts:             z.object({
        completed:  z.number().int().nonnegative(),
        failed:     z.number().int().nonnegative(),
        processing: z.number().int().nonnegative(),
        pending:    z.number().int().nonnegative(),
      }),
    }),
    rawEntitySnapshots: z.object({
      name:              z.literal('raw_entity_snapshots'),
      kind:              z.literal('table'),
      rows:              z.number().int().nonnegative(),
      latestRows:        z.number().int().nonnegative(),
      distinctCardCount: z.number().int().nonnegative(),
      updatedAt:         z.string().optional(),
    }),
    rawEntitySnapshotTags: z.object({
      name:                  z.literal('raw_entity_snapshot_tags'),
      kind:                  z.literal('table'),
      rows:                  z.number().int().nonnegative(),
      distinctSnapshotCount: z.number().int().nonnegative(),
      distinctEnumCount:     z.number().int().nonnegative(),
    }),
    tagValueView: z.object({
      name:                  z.literal('tag_value_view'),
      kind:                  z.literal('view'),
      rows:                  z.number().int().nonnegative(),
      distinctSnapshotCount: z.number().int().nonnegative(),
      distinctEnumCount:     z.number().int().nonnegative(),
    }),
  }),
});

const getOverview = os
  .route({
    method:      'GET',
    description: 'Get hsdata data table overview',
    tags:        ['Console', 'Hearthstone', 'DataSource'],
  })
  .input(z.void())
  .output(hsdataOverview)
  .handler(async () => await getHsdataOverview());

const listSourceVersions = os
  .route({
    method:      'GET',
    description: 'List hsdata sourceTag import and projection statuses',
    tags:        ['Console', 'Hearthstone', 'DataSource'],
  })
  .input(z.void())
  .output(z.array(hsdataSourceVersionStatus))
  .handler(async () => await listHsdataSourceVersions());

const createImportJob = os
  .route({
    method:      'POST',
    description: 'Create one staged hsdata import job from a client chunk manifest',
    tags:        ['Console', 'Hearthstone', 'DataSource'],
  })
  .input(hsdataCreateImportJobInput)
  .output(hsdataCreateImportJobResult)
  .handler(async ({ input }) => {
    try {
      return await createHsdataImportJob({
        sourceTag:           input.sourceTag,
        sourceCommit:        input.sourceCommit,
        sourceUri:           input.sourceUri,
        build:               input.build,
        sourceHash:          input.sourceHash,
        chunkingVersion:     input.chunkingVersion,
        payloadFormatVersion: input.payloadFormatVersion,
        payloadEncoding:      input.payloadEncoding,
        importEngineVersion:  input.importEngineVersion,
        maxBytesPerChunk:    input.maxBytesPerChunk,
        maxEntitiesPerChunk: input.maxEntitiesPerChunk,
        dryRun:              input.dryRun,
        force:               input.force,
        totalChunkCount:     input.totalChunkCount,
        totalEntityCount:    input.totalEntityCount,
        chunks:              input.chunks,
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new ORPCError(getHsdataImportJobErrorCode(error.message), {
          message: error.message,
        });
      }

      throw error;
    }
  });

const finalizeImportJob = os
  .route({
    method:      'POST',
    description: 'Finalize one staged hsdata import job into raw archive tables',
    tags:        ['Console', 'Hearthstone', 'DataSource'],
  })
  .input(hsdataImportJobInput)
  .output(hsdataImportReport)
  .handler(async ({ input }) => {
    try {
      return await finalizeHsdataImportJob(input.jobId);
    } catch (error) {
      if (error instanceof Error) {
        throw new ORPCError(getHsdataImportJobErrorCode(error.message), {
          message: error.message,
        });
      }

      throw error;
    }
  });

const getImportJob = os
  .route({
    method:      'GET',
    description: 'Get one staged hsdata import job state and progress',
    tags:        ['Console', 'Hearthstone', 'DataSource'],
  })
  .input(hsdataImportJobInput)
  .output(hsdataImportJobState)
  .handler(async ({ input }) => {
    try {
      return await getHsdataImportJobState(input.jobId);
    } catch (error) {
      if (error instanceof Error) {
        throw new ORPCError(getHsdataImportJobErrorCode(error.message), {
          message: error.message,
        });
      }

      throw error;
    }
  });

const projectSourceVersion = os
  .route({
    method:      'POST',
    description: 'Project one completed hsdata source version into Hearthstone domain tables',
    tags:        ['Console', 'Hearthstone', 'DataSource'],
  })
  .input(hsdataProjectInput)
  .output(hsdataProjectReport)
  .handler(async ({ input }) => {
    try {
      return await projectHsdata({
        sourceTag: input.sourceTag,
        dryRun:    input.dryRun,
        force:     input.force,
      });
    } catch (error) {
      if (error instanceof Error) {
        const message = error.message;
        const code = message.includes('does not exist')
          ? 'NOT_FOUND'
          : message.includes('not completed')
            ? 'CONFLICT'
            : 'BAD_REQUEST';

        throw new ORPCError(code, { message });
      }

      throw error;
    }
  });

export const hsdataLight = {
  getOverview,
  listSourceVersions,
};

export const hsdataFull = {
  getOverview,
  listSourceVersions,
  createImportJob,
  finalizeImportJob,
  getImportJob,
  projectSourceVersion,
};
