import { eventIterator, ORPCError } from '@orpc/server';
import { z } from 'zod';

import {
  cardImageRequirementExportInput,
  cardImageRequirementExportResult,
  imageRequirementFile,
  imageRequirementRequest,
  type CardImageRequirementExportInput,
} from '@tcg-cards/model/src/hearthstone/schema/data/image';
import { CardImageAsset } from '@tcg-cards/db/schema/shared/hearthstone/card-image';
import { exportCardImageRequirements } from '@tcg-cards/console-api/lib/hearthstone/card-image';
import { importCardImageFilesToLocalBucket } from '@tcg-cards/console-api/lib/hearthstone/card-image-local-import';

import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { os } from './index';
import { getLocalDb } from '../lib/hearthstone/hsdata-local-db';
import {
  getHearthstoneImageSettings,
  requireHearthstoneImageBucketDir,
  requireHearthstoneImageRendererBaseUrl,
} from '../lib/hearthstone/image-config';
import {
  getCurrentImageJob,
  startImageJob,
  updateImageJob,
  watchImageJob,
} from '../lib/hearthstone/image-job';
import { buildDebugRenderRequests } from '../lib/hearthstone/image-debug';

const localImportFileInput = z.strictObject({
  fileName: z.string().trim().min(1),
  bytesBase64: z.string().min(1),
});

const localImportInput = z.strictObject({
  requirementContent: z.string().trim().min(1),
  requirementName: z.string().trim().min(1),
  files: z.array(localImportFileInput),
  force: z.boolean().optional(),
  dryRun: z.boolean().optional(),
});

const localImportProblem = z.strictObject({
  fileName: z.string(),
  message: z.string(),
});

const localImportSummary = z.strictObject({
  requirementName: z.string(),
  expectedCount: z.number().int().nonnegative(),
  writtenCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  missingCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  dryRun: z.boolean(),
});

const localImportResult = z.strictObject({
  bucketDir: z.string(),
  summary: localImportSummary,
  problems: z.array(localImportProblem),
});

const rendererSubmitResult = z.strictObject({
  jobId: z.string().trim().min(1),
});

const imageJobState = z.strictObject({
  jobId: z.string(),
  phase: z.string(),
  message: z.string(),
  startedAt: z.string(),
  phaseStartedAt: z.string(),
  finishedAt: z.string().nullable(),
  updatedAt: z.string(),
  filters: z.strictObject({
    lang: z.string(),
    version: z.number().int().positive().nullable(),
    cardId: z.string().nullable(),
    zones: z.array(z.string()),
    templates: z.array(z.string()),
    premiums: z.array(z.string()),
    limit: z.number().int().positive(),
    cursor: z.string().nullable(),
  }),
  exportId: z.string().nullable(),
  requestCount: z.number().int().nonnegative().nullable(),
  totalCount: z.number().int().nonnegative().nullable(),
  remainingEstimate: z.number().int().nonnegative().nullable(),
  rendererJobId: z.string().nullable(),
  requirementContent: z.string().nullable(),
  requirementName: z.string().nullable(),
  rendererStatus: z.string().nullable(),
  completedCount: z.number().int().nonnegative().nullable(),
  missingCount: z.number().int().nonnegative().nullable(),
  rejectedCount: z.number().int().nonnegative().nullable(),
  writtenCount: z.number().int().nonnegative().nullable(),
  skippedCount: z.number().int().nonnegative().nullable(),
  errorMessage: z.string().nullable(),
  rejectedLogPath: z.string().nullable(),
});

const submitRenderJobResult = z.strictObject({
  job: imageJobState,
});

const rendererProblem = z.strictObject({
  fileName: z.string(),
  message: z.string(),
});

const rendererFile = z.strictObject({
  requestId: z.string().trim().min(1),
  url: z.string().trim().min(1).optional().nullable(),
  bytesBase64: z.string().min(1).optional().nullable(),
  fileName: z.string().trim().min(1).optional().nullable(),
});

const rendererJobStatus = z.strictObject({
  jobId: z.string().trim().min(1),
  status: z.string().trim().min(1),
  message: z.string().optional().nullable(),
  errorMessage: z.string().optional().nullable(),
  completedCount: z.number().int().nonnegative().optional().nullable(),
  missingCount: z.number().int().nonnegative().optional().nullable(),
  rejected: z.array(rendererProblem).optional().default([]),
  files: z.array(rendererFile).optional().default([]),
});

const rendererHealthStatus = z.strictObject({
  service:         z.string(),
  version:         z.string(),
  protocolVersion: z.string(),
  requestShape:    z.string(),
  outputFormat:    z.string(),
  ready:           z.boolean(),
  message:         z.string().optional().nullable(),
});

const rendererHealthResult = z.strictObject({
  configured: z.boolean(),
  reachable:  z.boolean(),
  status:     rendererHealthStatus.nullable(),
  error:      z.string().optional().nullable(),
});

/** Decodes one base64 PNG payload from the desktop RPC input. */
function decodeBase64Bytes(value: string) {
  try {
    return new Uint8Array(Buffer.from(value, 'base64'));
  } catch {
    throw new ORPCError('BAD_REQUEST', {
      message: 'One local image file has invalid base64 content',
    });
  }
}

/** Maps one export failure into a desktop-runtime RPC error code. */
function toExportError(error: unknown) {
  if (error instanceof ORPCError) {
    return error;
  }

  if (error instanceof Error) {
    const code = error.message === 'No missing card images matched filters'
      ? 'NOT_FOUND'
      : 'BAD_REQUEST';

    return new ORPCError(code, { message: error.message });
  }

  return new ORPCError('INTERNAL_SERVER_ERROR', {
    message: String(error),
  });
}

/** Maps one local-import failure into a desktop-runtime RPC error code. */
function toLocalImportError(error: unknown) {
  if (error instanceof ORPCError) {
    return error;
  }

  if (error instanceof Error) {
    return new ORPCError('BAD_REQUEST', { message: error.message });
  }

  return new ORPCError('INTERNAL_SERVER_ERROR', {
    message: String(error),
  });
}

/** Maps one render-task failure into a desktop-runtime RPC error code. */
function toRenderJobError(error: unknown) {
  if (error instanceof ORPCError) {
    return error;
  }

  if (error instanceof Error) {
    return new ORPCError('BAD_REQUEST', { message: error.message });
  }

  return new ORPCError('INTERNAL_SERVER_ERROR', {
    message: String(error),
  });
}

interface RejectedEntry {
  requestId?: string;
  fileName: string;
  message: string;
}

/** Directory under system temp where rejected-file logs are written. */
const rejectedLogBaseDir = join(tmpdir(), 'hs-render-rejected');

/** Writes rejected-file details to a JSON log file under the system temp directory. Returns the absolute path. */
async function writeRejectedLog(jobId: string, entries: RejectedEntry[]) {
  const dir = rejectedLogBaseDir;
  await Bun.spawn(['mkdir', '-p', dir]).exited;
  const logPath = join(dir, `rejected-${jobId}.json`);
  await Bun.write(logPath, JSON.stringify(entries, null, 2));
  return logPath;
}

/** Returns one normalized renderer submit URL from the configured base URL. */
function buildRendererSubmitUrl(rendererBaseUrl: string) {
  return new URL('/render', rendererBaseUrl).toString();
}

/** Returns one normalized renderer status URL for the provided renderer job id. */
function buildRendererStatusUrl(rendererBaseUrl: string, rendererJobId: string) {
  return new URL(`/render/jobs/${rendererJobId}`, rendererBaseUrl).toString();
}

/** Posts one requirements JSON payload into the configured local renderer. */
async function submitRendererJob(rendererBaseUrl: string, requirementContent: string) {
  const response = await fetch(buildRendererSubmitUrl(rendererBaseUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: requirementContent,
  }).catch(error => {
    throw new Error(`Failed to reach local renderer: ${error instanceof Error ? error.message : String(error)}`);
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      body.trim().length > 0
        ? `Local renderer rejected the request: ${body.trim()}`
        : `Local renderer rejected the request with status ${response.status}`,
    );
  }

  return rendererSubmitResult.parse(await response.json());
}

/** Returns the /status URL for the renderer health check. */
function buildRendererHealthUrl(rendererBaseUrl: string) {
  return new URL('/status', rendererBaseUrl).toString();
}

/** Fetches the renderer health/status endpoint. */
async function fetchRendererHealth(rendererBaseUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(buildRendererHealthUrl(rendererBaseUrl), {
      signal: controller.signal,
    }).catch(error => {
      throw new Error(`Failed to reach the local renderer: ${error instanceof Error ? error.message : String(error)}`);
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        body.trim().length > 0
          ? `The local renderer returned an error status: ${body.trim()}`
          : `The local renderer returned HTTP status ${response.status}`,
      );
    }

    return rendererHealthStatus.parse(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

/** Returns whether one renderer status should keep the desktop job waiting. */
function isPendingRendererStatus(status: string) {
  return status === 'queued' || status === 'pending' || status === 'processing' || status === 'running';
}

/** Downloads one renderer-produced PNG payload from base64 or one remote URL. */
async function loadRendererFileBytes(input: {
  rendererBaseUrl: string;
  file: z.infer<typeof rendererFile>;
}) {
  if (input.file.bytesBase64 != null) {
    return decodeBase64Bytes(input.file.bytesBase64);
  }

  if (input.file.url == null) {
    throw new Error(`Renderer file ${input.file.requestId} is missing both url and bytesBase64`);
  }

  const url = new URL(input.file.url, input.rendererBaseUrl).toString();
  const response = await fetch(url).catch(error => {
    throw new Error(`Failed to download rendered PNG ${input.file.requestId}: ${error instanceof Error ? error.message : String(error)}`);
  });

  if (!response.ok) {
    throw new Error(`Failed to download rendered PNG ${input.file.requestId}: status ${response.status}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

/** Builds one request-id to output-file-name lookup table from the exported requirements JSON. */
function buildRequirementFileNameMap(requirementContent: string) {
  const requirement = imageRequirementFile.parse(JSON.parse(requirementContent));
  return new Map(requirement.requests.map(request => [request.requestId, request.output.fileName]));
}

/** Loads one renderer status snapshot from the configured local renderer. */
async function getRendererJobStatus(rendererBaseUrl: string, rendererJobId: string) {
  const response = await fetch(buildRendererStatusUrl(rendererBaseUrl, rendererJobId)).catch(error => {
    throw new Error(`Failed to query local renderer job: ${error instanceof Error ? error.message : String(error)}`);
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      body.trim().length > 0
        ? `Local renderer status request failed: ${body.trim()}`
        : `Local renderer status request failed with status ${response.status}`,
    );
  }

  return rendererJobStatus.parse(await response.json());
}

/** Exports missing Hearthstone card image requirements through the desktop runtime database. */
const exportRequirements = os
  .route({
    method:      'POST',
    description: 'Export missing Hearthstone card image requirements',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Image'],
  })
  .input(cardImageRequirementExportInput)
  .output(cardImageRequirementExportResult)
  .handler(async ({ input }: { input: CardImageRequirementExportInput }) => {
    try {
      return await exportCardImageRequirements(input, {
        db: getLocalDb(),
      });
    } catch (error) {
      throw toExportError(error);
    }
  });

/** Imports one requirements batch plus PNG payloads into the configured local bucket directory. */
const importLocalFiles = os
  .route({
    method:      'POST',
    description: 'Import rendered Hearthstone PNG files into the configured local bucket directory',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Image'],
  })
  .input(localImportInput)
  .output(localImportResult)
  .handler(async ({ input }) => {
    try {
      const bucketDir = requireHearthstoneImageBucketDir();
      const result = await importCardImageFilesToLocalBucket({
        requirementContent: input.requirementContent,
        requirementName:    input.requirementName,
        files:              input.files.map(file => ({
          fileName: file.fileName,
          bytes:    decodeBase64Bytes(file.bytesBase64),
        })),
        bucketDir,
        force: input.force ?? false,
        dryRun: input.dryRun ?? false,
      });

      return {
        bucketDir,
        summary: result.summary,
        problems: result.problems,
      };
    } catch (error) {
      throw toLocalImportError(error);
    }
  });

/** Submits one Hearthstone image render job to the configured local renderer, renders one-by-one, and imports locally. */
/** Runs the full render-and-import pipeline in the background, publishing progress updates. */
async function runRenderJob(jobId: string, input: CardImageRequirementExportInput) {
  try {
    const rendererBaseUrl = requireHearthstoneImageRendererBaseUrl();
    const bucketDir = requireHearthstoneImageBucketDir();
    const exportResult = await exportCardImageRequirements(input, { db: getLocalDb() });

    const requirementsFile = imageRequirementFile.parse(JSON.parse(exportResult.content));
    const totalCount = requirementsFile.requests.length;

    updateImageJob(jobId, {
      phase: 'submitting_renderer_job',
      message: 'Rendering images one-by-one',
      exportId: exportResult.exportId,
      requestCount: totalCount,
      totalCount,
      remainingEstimate: exportResult.remainingEstimate,
      requirementContent: exportResult.content,
      requirementName: exportResult.fileName,
    });

    const renderedFiles: Array<{ requestId: string; fileName: string; bytes: Uint8Array }> = [];
    const failedFiles: Array<{ requestId: string; fileName: string; message: string }> = [];

    for (let i = 0; i < requirementsFile.requests.length; i++) {
      const request = requirementsFile.requests[i]!;
      const requestJson = JSON.stringify(request);

      try {
        const response = await fetch(buildRendererSubmitUrl(rendererBaseUrl), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: requestJson,
        });

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          failedFiles.push({
            requestId: request.requestId,
            fileName: request.output.fileName,
            message: body.trim().slice(0, 200) || `HTTP ${response.status}`,
          });
        } else {
          const bytes = new Uint8Array(await response.arrayBuffer());
          renderedFiles.push({ requestId: request.requestId, fileName: request.output.fileName, bytes });
        }
      } catch (error) {
        failedFiles.push({
          requestId: request.requestId,
          fileName: request.output.fileName,
          message: error instanceof Error ? error.message : String(error),
        });
      }

      updateImageJob(jobId, {
        message: `Rendered ${i + 1}/${totalCount} (${renderedFiles.length} ok, ${failedFiles.length} failed)`,
        completedCount: renderedFiles.length,
        rejectedCount: failedFiles.length,
      });
    }

    if (renderedFiles.length === 0) {
      const rejectedLogPath = await writeRejectedLog(jobId, failedFiles);
      updateImageJob(jobId, {
        phase: 'failed',
        message: 'All render requests failed',
        errorMessage: failedFiles.map(f => `${f.fileName}: ${f.message}`).join('; '),
        completedCount: 0,
        rejectedCount: failedFiles.length,
        rejectedLogPath,
        finishedAt: new Date().toISOString(),
      });
      return;
    }

    updateImageJob(jobId, {
      phase: 'importing_local_bucket',
      message: `Importing ${renderedFiles.length} rendered images to local bucket`,
      completedCount: renderedFiles.length,
      rejectedCount: failedFiles.length,
    });

    const importResult = await importCardImageFilesToLocalBucket({
      requirementContent: exportResult.content,
      requirementName: exportResult.fileName,
      files: renderedFiles.map(f => ({ fileName: f.fileName, bytes: f.bytes })),
      bucketDir,
      force: false,
      dryRun: false,
    });

    if (importResult.summary.writtenCount > 0 || importResult.summary.skippedCount > 0) {
      const fileByName = new Map(renderedFiles.map(f => [f.fileName, f]));
      const assetRows = [];

      for (const request of requirementsFile.requests) {
        const rendered = fileByName.get(request.output.fileName);
        if (!rendered) continue;

        assetRows.push({
          imageSpecVersion: requirementsFile.imageSpecVersion ?? 'v1',
          renderHash:       request.card.renderHash,
          lang:             request.card.lang,
          zone:             request.variant.zone,
          template:         request.variant.template,
          premium:          request.variant.premium,
          r2Bucket:         request.target.r2Bucket,
          r2Key:            request.target.r2Key,
          contentType:      request.target.contentType,
          width:            request.output.width,
          height:           request.output.height,
          sourceExportId:   exportResult.exportId,
          status:           'ready',
          verifiedAt:       new Date(),
        });
      }

      if (assetRows.length > 0) {
        const db = getLocalDb();
        for (const row of assetRows) {
          try {
            await db.insert(CardImageAsset).values(row).onConflictDoUpdate({
              target: [
                CardImageAsset.imageSpecVersion,
                CardImageAsset.renderHash,
                CardImageAsset.zone,
                CardImageAsset.template,
                CardImageAsset.premium,
              ],
              set: {
                lang: row.lang, r2Bucket: row.r2Bucket, r2Key: row.r2Key,
                contentType: row.contentType, width: row.width, height: row.height,
                sourceExportId: row.sourceExportId, status: 'ready', verifiedAt: row.verifiedAt,
              },
            });
          } catch { /* best-effort */ }
        }
      }
    }

    const rejectedLogPath = failedFiles.length > 0
      ? await writeRejectedLog(jobId, failedFiles)
      : importResult.problems.length > 0
        ? await writeRejectedLog(jobId, importResult.problems)
        : null;

    updateImageJob(jobId, {
      phase: importResult.problems.length === 0 && failedFiles.length === 0 ? 'completed' : 'failed',
      message: importResult.problems.length === 0 && failedFiles.length === 0
        ? `Completed: ${importResult.summary.writtenCount} written, ${importResult.summary.skippedCount} skipped`
        : `Completed with issues: ${importResult.summary.writtenCount} written, ${importResult.summary.rejectedCount} rejected`,
      completedCount: importResult.summary.writtenCount,
      missingCount: importResult.summary.missingCount,
      rejectedCount: importResult.summary.rejectedCount + failedFiles.length,
      writtenCount: importResult.summary.writtenCount,
      skippedCount: importResult.summary.skippedCount,
      errorMessage: importResult.problems.length > 0
        ? `${importResult.summary.rejectedCount} file(s) rejected; ${failedFiles.length} render failure(s)`
        : failedFiles.length > 0 ? `${failedFiles.length} render failure(s)` : null,
      rejectedLogPath,
      finishedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateImageJob(jobId, {
      phase: 'failed',
      message,
      errorMessage: message,
      finishedAt: new Date().toISOString(),
    });
  }
}

/** Submits one Hearthstone image render job and starts background processing. */
const submitRenderJob = os
  .route({
    method:      'POST',
    description: 'Submit one Hearthstone image render job to the configured local renderer',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Image'],
  })
  .input(cardImageRequirementExportInput)
  .output(submitRenderJobResult)
  .handler(async ({ input }: { input: CardImageRequirementExportInput }) => {
    const current = getCurrentImageJob();

    if (current != null && current.finishedAt == null) {
      throw new ORPCError('CONFLICT', {
        message: 'Another Hearthstone image job is already running',
      });
    }

    const job = startImageJob({
      message: 'Exporting Hearthstone image requirements',
      filters: {
        lang: input.lang,
        version: input.version ?? null,
        cardId: input.cardId ?? null,
        zones: [...input.zones],
        templates: [...input.templates],
        premiums: [...input.premiums],
        limit: input.limit,
        cursor: input.cursor ?? null,
      },
    });

    void runRenderJob(job.jobId, input);

    return { job: getCurrentImageJob() ?? job };
  });

/** Returns the current in-memory desktop image job snapshot when present. */
const getCurrentJob = os
  .route({
    method:      'GET',
    description: 'Get the current Hearthstone image job snapshot',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Image'],
  })
  .output(imageJobState.nullable())
  .handler(async () => getCurrentImageJob());

/** Returns the current in-memory image job snapshot (rendering is done inline during submit). */
const refreshCurrentJob = os
  .route({
    method:      'POST',
    description: 'Return the current Hearthstone image job snapshot',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Image'],
  })
  .output(imageJobState.nullable())
  .handler(async () => {
    return getCurrentImageJob();
  });

const imageJobProgressEvent = z.object({
  phase:          z.string(),
  message:        z.string(),
  startedAt:      z.string(),
  phaseStartedAt: z.string(),
  finishedAt:     z.string().nullable(),
  completedCount: z.number().int().nonnegative().nullable(),
  totalCount:     z.number().int().nonnegative().nullable(),
  writtenCount:   z.number().int().nonnegative().nullable(),
  skippedCount:   z.number().int().nonnegative().nullable(),
  rejectedCount:  z.number().int().nonnegative().nullable(),
  errorMessage:   z.string().nullable(),
  rejectedLogPath: z.string().nullable(),
});

/** Streams progress events for the current image render job via an ORPC event iterator. */
const watchJobProgress = os
  .route({
    method:      'GET',
    description: 'Watch the current Hearthstone image job progress as a stream of events',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Image'],
  })
  .output(eventIterator(imageJobProgressEvent))
  .handler(async function* () {
    yield* watchImageJob();
  });

const debugRenderRequestInput = z.strictObject({
  renderHash: z.string().trim().min(1),
  lang:       z.string().trim().min(1).optional(),
  zones:      z.array(z.string()).optional(),
  templates:  z.array(z.string()).optional(),
  premiums:   z.array(z.string()).optional(),
});

const debugRenderRequestOutput = z.strictObject({
  cardId:          z.string(),
  lang:            z.string(),
  renderHash:      z.string(),
  set:             z.string(),
  type:            z.string(),
  techLevel:       z.number().int().nullable(),
  variantCount:    z.number().int().nonnegative(),
  requests:        z.array(imageRequirementRequest),
});

/** Generates render request POST bodies for a given renderHash, for debugging. */
const debugRenderRequest = os
  .route({
    method:      'POST',
    description: 'Generate debug render request JSON for a given renderHash',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Image'],
  })
  .input(debugRenderRequestInput)
  .output(debugRenderRequestOutput)
  .handler(async ({ input }) => {
    const result = await buildDebugRenderRequests(getLocalDb(), input.renderHash, {
      lang:      input.lang,
      zones:     input.zones,
      templates: input.templates,
      premiums:  input.premiums,
    });

    return result;
  });

/** Detects whether the configured Hearthstone image renderer is reachable and reports its health status. */
const detectRenderer = os
  .route({
    method:      'POST',
    description: 'Detect the configured Hearthstone image renderer and report its health status',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Image'],
  })
  .input(z.strictObject({
    rendererBaseUrl: z.string().trim().min(1).optional(),
  }).optional())
  .output(rendererHealthResult)
  .handler(async (options) => {
    const baseUrl = options.input?.rendererBaseUrl?.trim() ?? getHearthstoneImageSettings().rendererBaseUrl;

    if (baseUrl == null || baseUrl.length === 0) {
      return {
        configured: false,
        reachable:  false,
        status:     null,
        error:      'Renderer base URL is not configured',
      };
    }

    try {
      const status = await fetchRendererHealth(baseUrl);
      return {
        configured: true,
        reachable:  true,
        status,
        error:      null,
      };
    } catch (error) {
      return {
        configured: true,
        reachable:  false,
        status:     null,
        error:      error instanceof Error ? error.message : String(error),
      };
    }
  });

/** Groups the desktop runtime Hearthstone image procedures under one router namespace. */
export const imageRouter = {
  exportRequirements,
  importLocalFiles,
  submitRenderJob,
  getCurrentJob,
  refreshCurrentJob,
  watchJobProgress,
  debugRenderRequest,
  detectRenderer,
};
