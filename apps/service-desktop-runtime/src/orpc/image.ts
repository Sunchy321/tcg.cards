import { ORPCError } from '@orpc/server';
import { z } from 'zod';

import { locale } from '@tcg-cards/model/src/hearthstone/schema/basic';
import {
  cardImageRequirementExportInput,
  cardImageRequirementExportResult,
  imagePremium,
  imageRequirementRequest,
  imageTemplate,
  imageZone,
} from '@tcg-cards/model/src/hearthstone/schema/data/image';
import {
  exportCardImageRequirements,
} from '@tcg-cards/console-api/lib/hearthstone/card-image';
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
import { buildCardIdRenderRequests, buildDebugRenderRequests } from '../lib/hearthstone/image-debug';
import { getImageRenderCtx } from '../lib/hearthstone/task/image-render';

const localImportFileInput = z.strictObject({
  fileName:    z.string().trim().min(1),
  bytesBase64: z.string().min(1),
});

const localImportInput = z.strictObject({
  requirementContent: z.string().trim().min(1),
  requirementName:    z.string().trim().min(1),
  files:              z.array(localImportFileInput),
  force:              z.boolean().optional(),
  dryRun:             z.boolean().optional(),
});

const localImportProblem = z.strictObject({
  fileName: z.string(),
  message:  z.string(),
});

const localImportSummary = z.strictObject({
  requirementName: z.string(),
  expectedCount:   z.number().int().nonnegative(),
  writtenCount:    z.number().int().nonnegative(),
  skippedCount:    z.number().int().nonnegative(),
  missingCount:    z.number().int().nonnegative(),
  rejectedCount:   z.number().int().nonnegative(),
  dryRun:          z.boolean(),
});

const localImportResult = z.strictObject({
  bucketDir: z.string(),
  summary:   localImportSummary,
  problems:  z.array(localImportProblem),
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

/** Returns one normalized renderer submit URL from the configured base URL. */
function buildRendererSubmitUrl(rendererBaseUrl: string) {
  return new URL('/render', rendererBaseUrl).toString();
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

/** Exports missing Hearthstone card image requirements through the desktop runtime database. */
const exportRequirements = os
  .route({
    method:      'POST',
    description: 'Export missing Hearthstone card image requirements',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Image'],
  })
  .input(cardImageRequirementExportInput)
  .output(cardImageRequirementExportResult)
  .handler(async ({ input }) => {
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
        force:  input.force ?? false,
        dryRun: input.dryRun ?? false,
      });

      return {
        bucketDir,
        summary:  result.summary,
        problems: result.problems,
      };
    } catch (error) {
      throw toLocalImportError(error);
    }
  });

const debugRenderRequestInput = z.strictObject({
  cardId:     z.string().trim().min(1).optional(),
  renderHash: z.string().trim().min(1).optional(),
  lang:       locale.optional(),
  zones:      z.array(imageZone).optional(),
  templates:  z.array(imageTemplate).optional(),
  premiums:   z.array(imagePremium).optional(),
});

const debugRenderRequestOutput = z.strictObject({
  cardId:       z.string(),
  lang:         z.string(),
  renderHash:   z.string(),
  set:          z.string(),
  type:         z.string(),
  techLevel:    z.number().int().nullable(),
  variantCount: z.number().int().nonnegative(),
  requests:     z.array(imageRequirementRequest),
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
    const cardId = input.cardId?.trim() || undefined;
    const renderHash = input.renderHash?.trim() || undefined;
    const options = {
      lang:      input.lang,
      zones:     input.zones,
      templates: input.templates,
      premiums:  input.premiums,
    };
    const result = cardId != null
      ? await buildCardIdRenderRequests(getLocalDb(), cardId, options)
      : await buildDebugRenderRequests(getLocalDb(), renderHash ?? '', options);

    const parsed = debugRenderRequestOutput.safeParse(result);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(i => ({
        path:    i.path.join('.'),
        message: i.message,
      }));
      console.error('debugRenderRequest output validation failed:', JSON.stringify(issues, null, 2));
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: `Output validation: ${issues.slice(0, 5).map(i => `${i.path}: ${i.message}`).join('; ')}`,
      });
    }
    return parsed.data;
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
  .handler(async options => {
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

const previewRenderInput = z.strictObject({
  cardId:     z.string().trim().min(1).optional(),
  renderHash: z.string().trim().min(1).optional(),
  lang:       locale.optional(),
  zones:      z.array(imageZone).optional(),
  templates:  z.array(imageTemplate).optional(),
  premiums:   z.array(imagePremium).optional(),
});

const previewVariant = z.strictObject({
  zone:      imageZone,
  template:  imageTemplate,
  premium:   imagePremium,
  base64Png: z.string(),
  requestId: z.string(),
});

const previewRenderOutput = z.strictObject({
  cardId:       z.string(),
  renderHash:   z.string(),
  set:          z.string(),
  type:         z.string(),
  techLevel:    z.number().int().nullable(),
  variantCount: z.number().int().nonnegative(),
  previews:     z.array(previewVariant),
});

/** Maximum number of variants to render in one preview request. */
const MAX_PREVIEW_VARIANTS = 20;

/** Renders one card (by cardId or renderHash) and returns base64 PNG previews without writing to disk or DB. */
const previewRender = os
  .route({
    method:      'POST',
    description: 'Preview rendered card images for one card without writing to disk',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Image'],
  })
  .input(previewRenderInput)
  .output(previewRenderOutput)
  .handler(async ({ input }) => {
    const cardId = input.cardId?.trim() || undefined;
    const renderHash = input.renderHash?.trim() || undefined;

    if (!cardId && !renderHash) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Either cardId or renderHash is required',
      });
    }

    if (cardId && renderHash) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Provide either cardId or renderHash, not both',
      });
    }

    const rendererBaseUrl = requireHearthstoneImageRendererBaseUrl();
    const db = getLocalDb();
    const options = {
      lang:      input.lang,
      zones:     input.zones,
      templates: input.templates,
      premiums:  input.premiums,
    };

    const result = cardId != null
      ? await buildCardIdRenderRequests(db, cardId, options)
      : await buildDebugRenderRequests(db, renderHash!, options);

    const requests = result.requests.slice(0, MAX_PREVIEW_VARIANTS);
    const previews: z.infer<typeof previewRenderOutput>['previews'] = [];

    for (const request of requests) {
      try {
        const response = await fetch(buildRendererSubmitUrl(rendererBaseUrl), {
          method:  'POST',
          headers: { 'content-type': 'application/json' },
          body:    JSON.stringify(request),
        });

        if (response.ok) {
          const bytes = new Uint8Array(await response.arrayBuffer());
          const base64Png = Buffer.from(bytes).toString('base64');
          previews.push({
            zone:      request.variant.zone,
            template:  request.variant.template,
            premium:   request.variant.premium,
            base64Png,
            requestId: request.requestId,
          });
        }
      } catch {
        // Skip failed variants in preview mode
      }
    }

    return {
      cardId:       result.cardId,
      renderHash:   result.renderHash ?? '',
      set:          result.set,
      type:         result.type,
      techLevel:    result.techLevel,
      variantCount: previews.length,
      previews,
    };
  });

const downloadArchiveInput = z.strictObject({
  cardId:      z.string().trim().min(1).optional(),
  renderHash:  z.string().trim().min(1).optional(),
  lang:        locale.optional(),
  zones:       z.array(imageZone).optional(),
  templates:   z.array(imageTemplate).optional(),
  premiums:    z.array(imagePremium).optional(),
  version:     z.number().int().positive().optional(),
  allVersions: z.boolean().optional(),
  limit:       z.number().int().positive().optional(),
});

const downloadArchiveSyncOutput = z.strictObject({
  fileName:  z.string(),
  base64Zip: z.string(),
});

/** Renders and packages card images into a ZIP archive. Returns the archive path for single-card mode,
 *  or submits a background job for batch mode. */
const downloadArchive = os
  .route({
    method:      'POST',
    description: 'Render card images and package them into a downloadable ZIP archive',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Image'],
  })
  .input(downloadArchiveInput)
  .output(downloadArchiveSyncOutput)
  .handler(async ({ input }) => {
    const cardId = input.cardId?.trim() || undefined;
    const renderHash = input.renderHash?.trim() || undefined;

    if (!cardId && !renderHash) {
      throw new ORPCError('BAD_REQUEST', { message: 'Either cardId or renderHash is required for download' });
    }

    const rendererBaseUrl = requireHearthstoneImageRendererBaseUrl();
    const db = getLocalDb();
    const options = {
      lang:        input.lang,
      zones:       input.zones,
      templates:   input.templates,
      premiums:    input.premiums,
      allVersions: input.allVersions,
    };

    const result = cardId != null
      ? await buildCardIdRenderRequests(db, cardId, options)
      : await buildDebugRenderRequests(db, renderHash!, options);

    const requests = result.requests;
    const tempDir = join(tmpdir(), `hs-download-${crypto.randomUUID()}`);
    await Bun.spawn(['mkdir', '-p', tempDir]).exited;

    const pngPaths: string[] = [];

    for (const request of requests) {
      try {
        const response = await fetch(buildRendererSubmitUrl(rendererBaseUrl), {
          method:  'POST',
          headers: { 'content-type': 'application/json' },
          body:    JSON.stringify(request),
        });

        if (response.ok) {
          const bytes = new Uint8Array(await response.arrayBuffer());
          const pngPath = join(tempDir, request.output.fileName);
          await Bun.write(pngPath, bytes);
          pngPaths.push(pngPath);
        }
      } catch {
        // Skip failed renders in download mode
      }
    }

    if (pngPaths.length === 0) {
      throw new ORPCError('BAD_REQUEST', {
        message: `All ${requests.length} render requests failed`,
      });
    }

    const archiveName = `${result.cardId}-renders.zip`;
    const archivePath = join(tempDir, archiveName);
    await Bun.spawn(['zip', '-j', archivePath, ...pngPaths]).exited;

    const zipBytes = await Bun.file(archivePath).arrayBuffer();
    const base64Zip = Buffer.from(new Uint8Array(zipBytes)).toString('base64');

    // Clean up temp files
    await Bun.spawn(['rm', '-rf', tempDir]).exited.catch(() => {});

    return {
      fileName: archiveName,
      base64Zip,
    };
  });

const getArchiveInput = z.strictObject({
  filePath: z.string().trim().min(1),
});

/** Returns the base64-encoded ZIP file at the given path for browser download. */
const getArchive = os
  .route({
    method:      'POST',
    description: 'Get a generated ZIP archive as base64 for browser download',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Image'],
  })
  .input(getArchiveInput)
  .output(downloadArchiveSyncOutput)
  .handler(async ({ input }) => {
    const file = Bun.file(input.filePath.trim());
    if (!(await file.exists())) {
      throw new ORPCError('NOT_FOUND', {
        message: `Archive not found: ${input.filePath}`,
      });
    }
    const zipBytes = await file.arrayBuffer();
    const base64Zip = Buffer.from(new Uint8Array(zipBytes)).toString('base64');
    return {
      fileName: input.filePath.split(/[/\\]/).pop() ?? 'archive.zip',
      base64Zip,
    };
  });

/** Returns the download archive path for a completed image render task. */
const getTaskArchive = os
  .input(z.strictObject({ taskRunId: z.string() }))
  .output(z.strictObject({ archivePath: z.string().nullable(), archiveName: z.string().nullable() }))
  .handler(async ({ input }) => {
    const ctx = getImageRenderCtx(input.taskRunId);
    return { archivePath: ctx?.archivePath ?? null, archiveName: ctx?.archiveFilePaths && ctx.archiveFilePaths.length > 0 ? `hearthstone-renders.zip` : null };
  });

/** Groups the desktop runtime Hearthstone image procedures under one router namespace. */
export const imageRouter = {
  exportRequirements,
  importLocalFiles,
  debugRenderRequest,
  detectRenderer,
  previewRender,
  downloadArchive,
  getArchive,
  getTaskArchive,
};
