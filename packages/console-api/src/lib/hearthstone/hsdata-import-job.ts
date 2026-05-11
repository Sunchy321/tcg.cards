import { createHash } from 'node:crypto';

import { and, asc, count, eq, inArray } from 'drizzle-orm';

import { db } from '@tcg-cards/db/db';
import {
  HsdataImportJob,
  HsdataImportJobChunk,
  HsdataImportJobSnapshot,
} from '@tcg-cards/db/schema/hearthstone/data/hsdata-import';

import {
  type ImportHsdataReport,
  type JsonMap,
  type ParsedEntity,
  type ParsedHsdata,
  type RawTagInput,
} from './hsdata-import';
import {
  HSDATA_PAYLOAD_ENCODING,
  HSDATA_PAYLOAD_FORMAT_VERSION,
  parseHsdataImportChunkPayload,
} from './hsdata-import-payload';
import { createHsdataProfiler } from './hsdata-profile';

// Shared transaction shape for job service helpers.
type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Chunk entry inside the client upload manifest.
export interface HsdataChunkManifestItem {
  chunkIndex: number;
  payloadHash: string;
  entityCount: number;
}

// Server-owned job manifest and runtime options.
export interface CreateHsdataImportJobInput {
  sourceTag: number;
  sourceCommit?: string | null;
  sourceUri?: string | null;
  build: number;
  sourceHash: string;
  chunkingVersion: string;
  payloadFormatVersion: string;
  payloadEncoding: string;
  importEngineVersion: string;
  maxBytesPerChunk: number;
  maxEntitiesPerChunk: number;
  dryRun?: boolean;
  force?: boolean;
  totalChunkCount: number;
  totalEntityCount: number;
  chunks: HsdataChunkManifestItem[];
}

// Created job id and canonical manifest hash.
export interface CreateHsdataImportJobResult {
  jobId: string;
  manifestHash: string;
}

// Uploaded canonical NDJSON chunk payload.
export interface UploadHsdataImportChunkInput {
  jobId: string;
  chunkIndex: number;
  entityCount: number;
  payloadHash: string;
  payload: string;
}

// Accepted chunk summary and upload progress.
export interface UploadHsdataImportChunkResult {
  chunkStatus: 'completed';
  completedChunkCount: number;
  totalChunkCount: number;
  jobStatus: 'uploading' | 'ready_to_finalize';
}

// Import job state for polling and diagnostics.
export interface HsdataImportJobState {
  jobId: string;
  sourceTag: number;
  build: number;
  sourceHash: string;
  dryRun: boolean;
  force: boolean;
  status: 'uploading' | 'ready_to_finalize' | 'finalizing' | 'completed' | 'failed';
  stagingCleanupStatus: 'not_started' | 'pending' | 'succeeded' | 'failed';
  totalChunkCount: number;
  totalEntityCount: number;
  completedChunkCount: number;
  failedChunkCount: number;
  processingChunkCount: number;
  report: ImportHsdataReport | null;
  error: string | null;
  stagingCleanupError: string | null;
  cleanedAt: string | null;
  finalizedAt: string | null;
}

// Stable sha256 digest.
function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

// Deterministic JSON serialization for hashing.
function canonicalizeJson(value: unknown): string {
  if (value == null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalizeJson(item)).join(',')}]`;
  }

  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalizeJson(object[key])}`).join(',')}}`;
}

// Error normalization into one message string.
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Canonical manifest payload reduced from job input.
function normalizeManifest(input: CreateHsdataImportJobInput) {
  return {
    build:               input.build,
    chunkingVersion:     input.chunkingVersion,
    payloadFormatVersion: input.payloadFormatVersion,
    payloadEncoding:      input.payloadEncoding,
    importEngineVersion:  input.importEngineVersion,
    maxBytesPerChunk:    input.maxBytesPerChunk,
    maxEntitiesPerChunk: input.maxEntitiesPerChunk,
    totalChunkCount:     input.totalChunkCount,
    totalEntityCount:    input.totalEntityCount,
    chunks: [...input.chunks]
      .sort((left, right) => left.chunkIndex - right.chunkIndex)
      .map(chunk => ({
        chunkIndex:  chunk.chunkIndex,
        payloadHash: chunk.payloadHash,
        entityCount: chunk.entityCount,
      })),
  };
}

// Server-side hash of the canonical manifest.
export function computeHsdataManifestHash(input: CreateHsdataImportJobInput): string {
  return sha256(canonicalizeJson(normalizeManifest(input)));
}

// Inconsistent manifest totals rejected before job creation.
export function validateHsdataImportManifest(input: CreateHsdataImportJobInput) {
  if (input.chunkingVersion.trim().length === 0) {
    throw new Error('chunkingVersion is required');
  }

  if (input.payloadFormatVersion.trim().length === 0) {
    throw new Error('payloadFormatVersion is required');
  }

  if (input.payloadFormatVersion !== HSDATA_PAYLOAD_FORMAT_VERSION) {
    throw new Error(`unsupported payloadFormatVersion ${input.payloadFormatVersion}`);
  }

  if (input.payloadEncoding.trim().length === 0) {
    throw new Error('payloadEncoding is required');
  }

  if (input.payloadEncoding !== HSDATA_PAYLOAD_ENCODING) {
    throw new Error(`unsupported payloadEncoding ${input.payloadEncoding}`);
  }

  if (input.importEngineVersion.trim().length === 0) {
    throw new Error('importEngineVersion is required');
  }

  if (input.maxBytesPerChunk <= 0) {
    throw new Error('maxBytesPerChunk must be greater than 0');
  }

  if (input.maxEntitiesPerChunk <= 0) {
    throw new Error('maxEntitiesPerChunk must be greater than 0');
  }

  if (input.totalChunkCount <= 0) {
    throw new Error('totalChunkCount must be greater than 0');
  }

  if (input.totalEntityCount <= 0) {
    throw new Error('totalEntityCount must be greater than 0');
  }

  if (input.totalChunkCount !== input.chunks.length) {
    throw new Error('totalChunkCount must equal chunks.length');
  }

  let expectedChunkIndex = 0;
  let accumulatedEntityCount = 0;

  for (const chunk of [...input.chunks].sort((left, right) => left.chunkIndex - right.chunkIndex)) {
    if (chunk.chunkIndex !== expectedChunkIndex) {
      throw new Error('chunkIndex values must be unique and contiguous');
    }

    if (chunk.entityCount <= 0) {
      throw new Error(`chunk ${chunk.chunkIndex} must contain at least one entity`);
    }

    if (chunk.payloadHash.trim().length === 0) {
      throw new Error(`chunk ${chunk.chunkIndex} payloadHash is required`);
    }

    accumulatedEntityCount += chunk.entityCount;
    expectedChunkIndex += 1;
  }

  if (input.totalEntityCount !== accumulatedEntityCount) {
    throw new Error('totalEntityCount must equal the sum of chunks.entityCount');
  }
}

// Import job row loaded by id.
async function getHsdataImportJobRow(jobId: string) {
  return await db.select()
    .from(HsdataImportJob)
    .where(eq(HsdataImportJob.id, jobId))
    .then(rows => rows[0] ?? null);
}

// Job marked as failed with a terminal error message.
async function markHsdataImportJobFailed(jobId: string, error: string) {
  await db.update(HsdataImportJob)
    .set({
      status: 'failed',
      error,
    })
    .where(eq(HsdataImportJob.id, jobId));
}

// Completed chunk count for one job.
async function countCompletedChunks(tx: DbTx, jobId: string) {
  const rows = await tx.select({ value: count() })
    .from(HsdataImportJobChunk)
    .where(and(
      eq(HsdataImportJobChunk.jobId, jobId),
      eq(HsdataImportJobChunk.status, 'completed'),
    ));

  return rows[0]?.value ?? 0;
}

// Job status normalized from persisted state and aggregated chunk progress.
export function normalizeHsdataImportJobStatus(input: {
  status: HsdataImportJobState['status'];
  totalChunkCount: number;
  completedChunkCount: number;
  failedChunkCount: number;
  processingChunkCount: number;
}): HsdataImportJobState['status'] {
  if (input.status !== 'uploading') {
    return input.status;
  }

  if (input.failedChunkCount > 0 || input.processingChunkCount > 0) {
    return input.status;
  }

  return input.completedChunkCount === input.totalChunkCount
    ? 'ready_to_finalize'
    : input.status;
}

// Supported structured payload metadata enforced by the shared job service.
function assertSupportedChunkPayload(job: {
  payloadFormatVersion: string;
  payloadEncoding: string;
}) {
  if (job.payloadFormatVersion !== HSDATA_PAYLOAD_FORMAT_VERSION) {
    throw new Error(`unsupported payloadFormatVersion ${job.payloadFormatVersion}`);
  }

  if (job.payloadEncoding !== HSDATA_PAYLOAD_ENCODING) {
    throw new Error(`unsupported payloadEncoding ${job.payloadEncoding}`);
  }
}

// Staged snapshot row converted back into a parsed entity.
function mapStagedEntity(row: {
  cardId: string;
  dbfId: number;
  entityXmlVersion: number;
  snapshotHash: string;
  tags: RawTagInput[];
  extraPayload: JsonMap;
}): ParsedEntity {
  return {
    cardId:           row.cardId,
    dbfId:            row.dbfId,
    entityXmlVersion: row.entityXmlVersion,
    snapshotHash:     row.snapshotHash,
    tags:             row.tags,
    extraPayload:     row.extraPayload,
  };
}

// Staged card ids already owned by a different chunk in the same job.
async function getConflictingStagedCardIds(
  tx: DbTx,
  input: {
    jobId: string;
    chunkIndex: number;
    cardIds: string[];
  },
) {
  if (input.cardIds.length === 0) {
    return [];
  }

  const rows = await tx.select({
    cardId:     HsdataImportJobSnapshot.cardId,
    chunkIndex: HsdataImportJobSnapshot.chunkIndex,
  })
    .from(HsdataImportJobSnapshot)
    .where(and(
      eq(HsdataImportJobSnapshot.jobId, input.jobId),
      inArray(HsdataImportJobSnapshot.cardId, input.cardIds),
    ));

  return rows
    .filter(row => row.chunkIndex !== input.chunkIndex)
    .map(row => row.cardId)
    .sort();
}

// New job creation plus frozen chunk manifest.
export async function createHsdataImportJob(input: CreateHsdataImportJobInput): Promise<CreateHsdataImportJobResult> {
  validateHsdataImportManifest(input);
  const manifestHash = computeHsdataManifestHash(input);

  return await db.transaction(async tx => {
    const activeJob = await tx.select({
      id:     HsdataImportJob.id,
      status: HsdataImportJob.status,
    })
      .from(HsdataImportJob)
      .where(and(
        eq(HsdataImportJob.sourceTag, input.sourceTag),
        inArray(HsdataImportJob.status, ['uploading', 'ready_to_finalize', 'finalizing']),
      ))
      .then(rows => rows[0] ?? null);

    if (activeJob) {
      throw new Error(`sourceTag ${input.sourceTag} already has an active import job`);
    }

    const [job] = await tx.insert(HsdataImportJob)
      .values({
        sourceTag:           input.sourceTag,
        sourceCommit:        input.sourceCommit ?? '',
        sourceUri:           input.sourceUri ?? '',
        build:               input.build,
        sourceHash:          input.sourceHash,
        manifestHash,
        chunkingVersion:     input.chunkingVersion,
        payloadFormatVersion: input.payloadFormatVersion,
        payloadEncoding:      input.payloadEncoding,
        importEngineVersion:  input.importEngineVersion,
        maxBytesPerChunk:    input.maxBytesPerChunk,
        maxEntitiesPerChunk: input.maxEntitiesPerChunk,
        dryRun:              input.dryRun ?? false,
        force:               input.force ?? false,
        totalChunkCount:     input.totalChunkCount,
        totalEntityCount:    input.totalEntityCount,
      })
      .returning({
        id: HsdataImportJob.id,
      });

    if (!job) {
      throw new Error('failed to create hsdata import job');
    }

    await tx.insert(HsdataImportJobChunk)
      .values(input.chunks.map(chunk => ({
        jobId:       job.id,
        chunkIndex:  chunk.chunkIndex,
        entityCount: chunk.entityCount,
        payloadHash: chunk.payloadHash,
      })));

    return {
      jobId: job.id,
      manifestHash,
    };
  });
}

// Uploaded chunk claimed, canonicalized, and staged.
export async function uploadHsdataImportChunk(input: UploadHsdataImportChunkInput): Promise<UploadHsdataImportChunkResult> {
  return await db.transaction(async tx => {
    const job = await tx.select()
      .from(HsdataImportJob)
      .where(eq(HsdataImportJob.id, input.jobId))
      .then(rows => rows[0] ?? null);

    if (!job) {
      throw new Error(`hsdata import job ${input.jobId} does not exist`);
    }

    const chunk = await tx.select()
      .from(HsdataImportJobChunk)
      .where(and(
        eq(HsdataImportJobChunk.jobId, input.jobId),
        eq(HsdataImportJobChunk.chunkIndex, input.chunkIndex),
      ))
      .then(rows => rows[0] ?? null);

    if (!chunk) {
      throw new Error(`chunk ${input.chunkIndex} is not registered for job ${input.jobId}`);
    }

    if (chunk.payloadHash !== input.payloadHash) {
      if (chunk.status === 'completed') {
        await markHsdataImportJobFailed(input.jobId, `chunk ${input.chunkIndex} payloadHash drifted after completion`);
      }

      throw new Error(`chunk ${input.chunkIndex} payloadHash does not match the job manifest`);
    }

    if (chunk.entityCount !== input.entityCount) {
      if (chunk.status === 'completed') {
        await markHsdataImportJobFailed(input.jobId, `chunk ${input.chunkIndex} entityCount drifted after completion`);
      }

      throw new Error(`chunk ${input.chunkIndex} entityCount does not match the job manifest`);
    }

    if (chunk.status === 'completed') {
      const completedChunkCount = await countCompletedChunks(tx, input.jobId);

      return {
        chunkStatus: 'completed',
        completedChunkCount,
        totalChunkCount: job.totalChunkCount,
        jobStatus: completedChunkCount === job.totalChunkCount ? 'ready_to_finalize' : 'uploading',
      };
    }

    if (job.status !== 'uploading') {
      throw new Error(`job ${input.jobId} is not accepting chunk uploads in status ${job.status}`);
    }

    const [claimedChunk] = await tx.update(HsdataImportJobChunk)
      .set({
        status:    'processing',
        claimedAt: new Date(),
        error:     null,
      })
      .where(and(
        eq(HsdataImportJobChunk.jobId, input.jobId),
        eq(HsdataImportJobChunk.chunkIndex, input.chunkIndex),
        inArray(HsdataImportJobChunk.status, ['pending', 'failed']),
      ))
      .returning({
        chunkIndex: HsdataImportJobChunk.chunkIndex,
      });

    if (!claimedChunk) {
      throw new Error(`chunk ${input.chunkIndex} is already being processed`);
    }

    try {
      assertSupportedChunkPayload(job);

      const entities = parseHsdataImportChunkPayload({
        payload: input.payload,
        expectedEntityCount: chunk.entityCount,
        expectedPayloadHash: chunk.payloadHash,
      });

      const conflictingCardIds = await getConflictingStagedCardIds(tx, {
        jobId: input.jobId,
        chunkIndex: input.chunkIndex,
        cardIds: entities.map(entity => entity.cardId),
      });

      if (conflictingCardIds.length > 0) {
        throw new Error(`chunk ${input.chunkIndex} conflicts with staged cardId(s): ${conflictingCardIds.join(', ')}`);
      }

      // Failed retries may have left partial staging rows behind. Replace the whole chunk
      // payload so successful retries always rebuild one deterministic staged result.
      await tx.delete(HsdataImportJobSnapshot)
        .where(and(
          eq(HsdataImportJobSnapshot.jobId, input.jobId),
          eq(HsdataImportJobSnapshot.chunkIndex, input.chunkIndex),
        ));

      await tx.insert(HsdataImportJobSnapshot)
        .values(entities.map(entity => ({
          jobId:            input.jobId,
          chunkIndex:       input.chunkIndex,
          cardId:           entity.cardId,
          dbfId:            entity.dbfId,
          entityXmlVersion: entity.entityXmlVersion,
          snapshotHash:     entity.snapshotHash,
          tags:             entity.tags,
          extraPayload:     entity.extraPayload,
        })));

      await tx.update(HsdataImportJobChunk)
        .set({
          status:      'completed',
          completedAt: new Date(),
          error:       null,
        })
        .where(and(
          eq(HsdataImportJobChunk.jobId, input.jobId),
          eq(HsdataImportJobChunk.chunkIndex, input.chunkIndex),
        ));

      const completedChunkCount = await countCompletedChunks(tx, input.jobId);
      const jobStatus = completedChunkCount === job.totalChunkCount
        ? 'ready_to_finalize'
        : 'uploading';

      await tx.update(HsdataImportJob)
        .set({
          status: jobStatus,
          error:  null,
        })
        .where(eq(HsdataImportJob.id, input.jobId));

      return {
        chunkStatus: 'completed',
        completedChunkCount,
        totalChunkCount: job.totalChunkCount,
        jobStatus,
      };
    } catch (error) {
      await tx.update(HsdataImportJobChunk)
        .set({
          status: 'failed',
          error:  toErrorMessage(error),
        })
        .where(and(
          eq(HsdataImportJobChunk.jobId, input.jobId),
          eq(HsdataImportJobChunk.chunkIndex, input.chunkIndex),
        ));

      throw error;
    }
  });
}

// Staging rows deleted after finalize has already succeeded.
export async function cleanupHsdataImportJobStaging(jobId: string) {
  try {
    await db.transaction(async tx => {
      await tx.delete(HsdataImportJobSnapshot)
        .where(eq(HsdataImportJobSnapshot.jobId, jobId));

      await tx.delete(HsdataImportJobChunk)
        .where(eq(HsdataImportJobChunk.jobId, jobId));

      await tx.update(HsdataImportJob)
        .set({
          stagingCleanupStatus: 'succeeded',
          stagingCleanupError:  null,
          cleanedAt:            new Date(),
        })
        .where(eq(HsdataImportJob.id, jobId));
    });
  } catch (error) {
    await db.update(HsdataImportJob)
      .set({
        stagingCleanupStatus: 'failed',
        stagingCleanupError:  toErrorMessage(error),
      })
      .where(eq(HsdataImportJob.id, jobId));

    throw error;
  }
}

// Staged job finalized into the raw archive tables.
export async function finalizeHsdataImportJob(jobId: string): Promise<ImportHsdataReport> {
  const job = await getHsdataImportJobRow(jobId);

  if (!job) {
    throw new Error(`hsdata import job ${jobId} does not exist`);
  }

  const profiler = createHsdataProfiler('finalize', {
    jobId,
    sourceTag:        job.sourceTag,
    build:            job.build,
    dryRun:           job.dryRun,
    force:            job.force,
    totalChunkCount:  job.totalChunkCount,
    totalEntityCount: job.totalEntityCount,
  });
  profiler.mark('load_job');

  if (job.status === 'completed') {
    if (job.report == null) {
      profiler.mark('completed_without_report');
      profiler.done({ outcome: 'failed' });
      throw new Error(`hsdata import job ${jobId} completed without a report`);
    }

    profiler.mark('reuse_completed_job');
    profiler.done({ outcome: 'completed_cached' });
    return job.report as unknown as ImportHsdataReport;
  }

  const chunkRows = await db.select({
    status: HsdataImportJobChunk.status,
  })
    .from(HsdataImportJobChunk)
    .where(eq(HsdataImportJobChunk.jobId, jobId));

  const completedChunkCount = chunkRows.filter(row => row.status === 'completed').length;
  const failedChunkCount = chunkRows.filter(row => row.status === 'failed').length;
  const processingChunkCount = chunkRows.filter(row => row.status === 'processing').length;
  profiler.mark('load_chunk_status', {
    completedChunkCount,
    failedChunkCount,
    processingChunkCount,
  });
  const normalizedStatus = normalizeHsdataImportJobStatus({
    status: job.status,
    totalChunkCount: job.totalChunkCount,
    completedChunkCount,
    failedChunkCount,
    processingChunkCount,
  });

  if (normalizedStatus !== 'ready_to_finalize') {
    profiler.mark('validate_ready_to_finalize_failed', {
      status:           job.status,
      normalizedStatus,
    });
    profiler.done({ outcome: 'failed' });
    throw new Error(`job ${jobId} cannot be finalized from status ${job.status}`);
  }

  if (chunkRows.length !== job.totalChunkCount || completedChunkCount !== job.totalChunkCount) {
    profiler.mark('validate_completed_chunks_failed', {
      chunkRowCount: chunkRows.length,
      completedChunkCount,
    });
    profiler.done({ outcome: 'failed' });
    throw new Error(`job ${jobId} is missing completed chunks`);
  }

  const [claimedJob] = await db.update(HsdataImportJob)
    .set({
      status: 'finalizing',
      error:  null,
    })
    .where(and(
      eq(HsdataImportJob.id, jobId),
      inArray(HsdataImportJob.status, ['uploading', 'ready_to_finalize']),
    ))
    .returning({
      id: HsdataImportJob.id,
    });
  profiler.mark('claim_job');

  if (!claimedJob) {
    const latestJob = await getHsdataImportJobRow(jobId);

    if (!latestJob) {
      profiler.mark('reload_latest_job_missing');
      profiler.done({ outcome: 'failed' });
      throw new Error(`hsdata import job ${jobId} does not exist`);
    }

    if (latestJob.status === 'completed') {
      if (latestJob.report == null) {
        profiler.mark('reload_completed_without_report');
        profiler.done({ outcome: 'failed' });
        throw new Error(`hsdata import job ${jobId} completed without a report`);
      }

      profiler.mark('reuse_completed_job_after_claim');
      profiler.done({ outcome: 'completed_cached' });
      return latestJob.report as unknown as ImportHsdataReport;
    }

    profiler.mark('claim_job_failed', {
      latestStatus: latestJob.status,
    });
    profiler.done({ outcome: 'failed' });
    throw new Error(`job ${jobId} cannot be finalized from status ${latestJob.status}`);
  }

  const snapshotRows = await db.select({
    cardId:           HsdataImportJobSnapshot.cardId,
    dbfId:            HsdataImportJobSnapshot.dbfId,
    entityXmlVersion: HsdataImportJobSnapshot.entityXmlVersion,
    snapshotHash:     HsdataImportJobSnapshot.snapshotHash,
    tags:             HsdataImportJobSnapshot.tags,
    extraPayload:     HsdataImportJobSnapshot.extraPayload,
  })
    .from(HsdataImportJobSnapshot)
    .where(eq(HsdataImportJobSnapshot.jobId, jobId))
    .orderBy(asc(HsdataImportJobSnapshot.chunkIndex), asc(HsdataImportJobSnapshot.cardId));
  profiler.mark('load_staged_snapshots', {
    snapshotCount: snapshotRows.length,
  });

  const parsed: ParsedHsdata = {
    build:    job.build,
    entities: snapshotRows.map(row => mapStagedEntity({
      ...row,
      tags: row.tags as RawTagInput[],
      extraPayload: row.extraPayload as JsonMap,
    })),
  };
  profiler.mark('map_staged_entities', {
    entityCount: parsed.entities.length,
  });

  try {
    // Delay the raw import module load so manifest-only helpers and tests do not pay for the full
    // raw-import dependency graph during module initialization.
    const { importParsedHsdata } = await import('./hsdata-import');
    const report = await importParsedHsdata({
      parsed,
      sourceTag:    job.sourceTag,
      sourceHash:   job.sourceHash,
      sourceCommit: job.sourceCommit,
      sourceUri:    job.sourceUri,
      importEngineVersion: job.importEngineVersion,
      dryRun:       job.dryRun,
      force:        job.force,
    });
    profiler.mark('import_parsed_hsdata');

    await db.update(HsdataImportJob)
      .set({
        status:               'completed',
        report:               report as unknown as JsonMap,
        error:                null,
        finalizedAt:          new Date(),
        stagingCleanupStatus: 'pending',
        stagingCleanupError:  null,
      })
      .where(eq(HsdataImportJob.id, jobId));
    profiler.mark('persist_completed_job');

    try {
      await cleanupHsdataImportJobStaging(jobId);
      profiler.mark('cleanup_staging');
    } catch (error) {
      profiler.mark('cleanup_staging_failed', {
        error: toErrorMessage(error),
      });
      console.error('[hearthstone][hsdata-import-job] cleanup failed', {
        jobId,
        error,
      });
    }

    profiler.done({ outcome: 'completed' });
    return report;
  } catch (error) {
    await markHsdataImportJobFailed(jobId, toErrorMessage(error));
    profiler.mark('failed', {
      error: toErrorMessage(error),
    });
    profiler.done({ outcome: 'failed' });
    throw error;
  }
}

// Job plus aggregated chunk progress counters.
export async function getHsdataImportJobState(jobId: string): Promise<HsdataImportJobState> {
  const job = await getHsdataImportJobRow(jobId);

  if (!job) {
    throw new Error(`hsdata import job ${jobId} does not exist`);
  }

  let currentJob = job;

  const chunkStatusRows = await db.select({
    status: HsdataImportJobChunk.status,
    value:  count(),
  })
    .from(HsdataImportJobChunk)
    .where(eq(HsdataImportJobChunk.jobId, jobId))
    .groupBy(HsdataImportJobChunk.status);

  const statusCounts = new Map(chunkStatusRows.map(row => [row.status, row.value]));
  const completedChunkCount = statusCounts.get('completed') ?? 0;
  const failedChunkCount = statusCounts.get('failed') ?? 0;
  const processingChunkCount = statusCounts.get('processing') ?? 0;
  let status = normalizeHsdataImportJobStatus({
    status: currentJob.status,
    totalChunkCount: currentJob.totalChunkCount,
    completedChunkCount,
    failedChunkCount,
    processingChunkCount,
  });

  if (status !== currentJob.status) {
    // Concurrent chunk completions can leave the persisted job row one transition behind.
    // Promote the durable status once reads can prove the staging set is fully complete.
    const [updatedJob] = await db.update(HsdataImportJob)
      .set({
        status,
      })
      .where(and(
        eq(HsdataImportJob.id, jobId),
        eq(HsdataImportJob.status, currentJob.status),
      ))
      .returning({
        status: HsdataImportJob.status,
      });

    if (!updatedJob) {
      const latestJob = await getHsdataImportJobRow(jobId);

      if (!latestJob) {
        throw new Error(`hsdata import job ${jobId} does not exist`);
      }

      currentJob = latestJob;
      status = currentJob.status;
    }
  }

  return {
    jobId:                currentJob.id,
    sourceTag:            currentJob.sourceTag,
    build:                currentJob.build,
    sourceHash:           currentJob.sourceHash,
    dryRun:               currentJob.dryRun,
    force:                currentJob.force,
    status,
    stagingCleanupStatus: currentJob.stagingCleanupStatus,
    totalChunkCount:      currentJob.totalChunkCount,
    totalEntityCount:     currentJob.totalEntityCount,
    completedChunkCount:  status === 'completed' && completedChunkCount === 0
      ? currentJob.totalChunkCount
      : completedChunkCount,
    failedChunkCount,
    processingChunkCount,
    report:               currentJob.report as ImportHsdataReport | null,
    error:                currentJob.error,
    stagingCleanupError:  currentJob.stagingCleanupError,
    cleanedAt:            currentJob.cleanedAt?.toISOString() ?? null,
    finalizedAt:          currentJob.finalizedAt?.toISOString() ?? null,
  };
}
