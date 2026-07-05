import type {
  TaskBlock,
  TaskDefinition,
  TaskExecuteStore,
  TaskRunInput,
  TaskScope,
  TaskStagePlan,
  TaskStageState,
} from '#task/definition';
import type { CardImageRequirementExportInput } from '@tcg-cards/model/src/hearthstone/schema/data/image';
import { imageRequirementFile } from '@tcg-cards/model/src/hearthstone/schema/data/image';
import { CardImageAsset } from '@tcg-cards/db/schema/shared/hearthstone/card-image';
import { TaskRun } from '@tcg-cards/db/schema/local/task';
import { eq } from 'drizzle-orm';
import { exportCardImageRequirements } from '@tcg-cards/console-api/lib/hearthstone/card-image';
import { importCardImageFilesToLocalBucket } from '@tcg-cards/console-api/lib/hearthstone/card-image-local-import';
import { buildDebugRenderRequests, buildCardIdRenderRequests } from '../../image-debug';
import { getLocalDb } from '../../hsdata-local-db';
import { requireHearthstoneImageBucketDir, requireHearthstoneImageRendererBaseUrl } from '../../image-config';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { omit } from 'lodash-es';

export const imageRenderTaskType = 'hearthstone_image_render';
export const imageRenderDefinitionVersion = '2026-06-27:v1';

export const imageRenderStagePlans: TaskStagePlan[] = [
  { stageKey: 'counting', stageIndex: 0, label: 'Counting', progressMode: 'simple', resumeMode: 'none' },
  { stageKey: 'processing', stageIndex: 1, label: 'Processing', progressMode: 'bounded', resumeMode: 'none' },
  { stageKey: 'finalizing', stageIndex: 2, label: 'Finalize', progressMode: 'simple', resumeMode: 'none' },
];

function buildScope(input: CardImageRequirementExportInput): TaskScope {
  const snapshot: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) snapshot[k] = v;
  return { type: 'image_render', key: `hearthstone:${input.lang ?? 'all'}`, snapshot };
}

export function buildImageRenderRunInput(input: CardImageRequirementExportInput): TaskRunInput {
  return {
    taskType: imageRenderTaskType,
    definitionVersion: imageRenderDefinitionVersion,
    scope: buildScope(input),
    params: input as unknown as Record<string, unknown>,
  };
}

type ImageOutputMode = 'import' | 'download';

interface RenderCtx {
  filters: CardImageRequirementExportInput;
  totalMissing: number;
  cursor: string | null;
  batchIndex: number;
  overallWritten: number;
  overallSkipped: number;
  overallRejected: number;
  rendererBaseUrl: string;
  bucketDir: string;
  outputMode: ImageOutputMode;
  /** ZIP archive path (download mode only). */
  archivePath?: string;
  /** Accumulated PNG file paths (download mode only). */
  archiveFilePaths?: string[];
}

const ctxMap = new Map<string, RenderCtx>();

export function getImageRenderCtx(taskRunId: string): RenderCtx | undefined {
  return ctxMap.get(taskRunId);
}

const CHUNK_SIZE = 50;

export function buildImageRenderBlocks(stage: TaskStageState, taskRunId: string): TaskBlock[] {
  if (stage.stageKey === 'counting' || stage.stageKey === 'finalizing') {
    return [{ blockKey: `${stage.stageKey}:run`, effectModel: 'atomic', payload: { stageKey: stage.stageKey } }];
  }
  const ctx = ctxMap.get(taskRunId);
  const chunkSize = ctx?.filters.limit ?? CHUNK_SIZE;
  const n = ctx ? Math.ceil(ctx.totalMissing / chunkSize) : 1;
  if (n <= 1) return [{ blockKey: 'proc:run', effectModel: 'reconcilable', payload: { stageKey: 'processing' } }];
  return Array.from({ length: n }, (_, i) => ({
    blockKey: `proc:chunk_${i + 1}`,
    effectModel: 'reconcilable' as const,
    payload: { stageKey: 'processing', chunkIndex: i },
  }));
}

export async function executeImageRenderBlock(input: {
  run: TaskRunInput;
  stage: TaskStageState;
  block: TaskBlock;
  store: TaskExecuteStore;
  taskRunId: string;
}): Promise<void> {
  const { store, taskRunId } = input;
  const ctx = ctxMap.get(taskRunId);
  if (!ctx) return;

  const stageKey = input.block.payload?.stageKey as string;

  if (stageKey === 'counting') {
    if (ctx.filters.renderHash || ctx.filters.cardId) {
      const fn = ctx.filters.renderHash ? buildDebugRenderRequests : buildCardIdRenderRequests;
      const key = ctx.filters.renderHash ?? ctx.filters.cardId!;
      const result = await fn(getLocalDb(), key, {
        lang: ctx.filters.lang, zones: ctx.filters.zones, templates: ctx.filters.templates, premiums: ctx.filters.premiums, allVersions: ctx.filters.allVersions,
      });
      ctx.totalMissing = new Map(result.requests.map(r => [r.output.fileName, r])).size;
    } else {
      const countResult = await exportCardImageRequirements(
        { ...omit(ctx.filters, 'renderHash'), scanAll: ctx.filters.scanAll ?? false, cursor: null, limit: ctx.filters.limit ?? 50 },
        { db: getLocalDb() },
      );
      ctx.totalMissing = ctx.filters.scanAll
        ? countResult.requestCount + countResult.remainingEstimate
        : countResult.requestCount;
    }
    store.updateStage(taskRunId, 'counting', { done: 1, total: 1 }).catch(() => {});
    return;
  }

  if (stageKey === 'finalizing') {
    if (ctx.outputMode === 'download' && ctx.archiveFilePaths && ctx.archiveFilePaths.length > 0 && !ctx.archivePath) {
      const archiveName = `hearthstone-renders-v${Date.now()}.zip`;
      const archivePath = join(tmpdir(), archiveName);
      await Bun.spawn(['zip', '-j', archivePath, ...ctx.archiveFilePaths]).exited;
      ctx.archivePath = archivePath;
      for (const fp of ctx.archiveFilePaths) { try { await Bun.spawnSync(['rm', '-f', fp]); } catch {} }
    }
    return;
  }

  const { filters, rendererBaseUrl, bucketDir, cursor } = ctx;

  let requirementsFile: any;
  let exportResult: any;

  if (filters.renderHash || filters.cardId) {
    const fn = filters.renderHash ? buildDebugRenderRequests : buildCardIdRenderRequests;
    const key = filters.renderHash ?? filters.cardId!;
    const result = await fn(getLocalDb(), key, {
      lang: filters.lang, zones: filters.zones, templates: filters.templates, premiums: filters.premiums, allVersions: filters.allVersions,
    });
    const uniqueReqs = [...new Map(result.requests.map(r => [r.output.fileName, r])).values()];
    const exportId = crypto.randomUUID();
    const fileObj = {
      schema: 'tcg.cards.hearthstone.card-image-requirements.v1',
      exportId, imageSpecVersion: 'v1',
      generatedAt: new Date().toISOString(),
      toolContract: { inputFormat: 'json', outputArchiveFormat: 'zip', outputImageFormat: 'png', fileNamePolicy: 'exact' },
      limits: { defaultMaxRequests: 500, hardMaxRequests: 500, maxRequests: 500, requestCount: uniqueReqs.length, remainingEstimate: 0 },
      batch: { index: 1, cursor: null, hasMore: false },
      defaults: { png: { color: 'rgba', transparentBackground: false }, target: { contentType: 'image/webp', webpPreset: 'q86-m4-fast' } },
      requests: uniqueReqs,
    };
    requirementsFile = fileObj;
    exportResult = { exportId, fileName: `${exportId}.json`, content: JSON.stringify(fileObj), hasMore: false, nextCursor: null };
  } else {
    exportResult = await exportCardImageRequirements(
      { ...omit(filters, 'renderHash'), scanAll: filters.scanAll ?? false, cursor, limit: filters.limit ?? CHUNK_SIZE },
      { db: getLocalDb() },
    );
    requirementsFile = imageRequirementFile.parse(JSON.parse(exportResult.content));
  }

  const batchCount = requirementsFile.requests.length;

  if (batchCount === 0) return;

  ctx.batchIndex++;

  const renderedFiles: Array<{ requestId: string; fileName: string; bytes: Uint8Array }> = [];
  const failedFiles: Array<{ requestId: string; cardId: string; renderHash: string; fileName: string; message: string }> = [];

  for (let i = 0; i < requirementsFile.requests.length; i++) {
    const request = requirementsFile.requests[i]!;
    try {
      const response = await fetch(`${rendererBaseUrl}/render`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (response.ok) {
        renderedFiles.push({ requestId: request.requestId, fileName: request.output.fileName, bytes: new Uint8Array(await response.arrayBuffer()) });
      } else {
        const body = await response.text().catch(() => '');
        failedFiles.push({ requestId: request.requestId, cardId: request.card.cardId, renderHash: request.card.renderHash, fileName: request.output.fileName, message: body.trim().slice(0, 200) || `HTTP ${response.status}` });
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') break;
      failedFiles.push({ requestId: request.requestId, cardId: request.card.cardId, renderHash: request.card.renderHash, fileName: request.output.fileName, message: error instanceof Error ? error.message : String(error) });
    }
    await store.updateStage(taskRunId, 'processing', { done: ctx.overallWritten + renderedFiles.length + failedFiles.length, total: ctx.totalMissing }).catch(() => {});
    await store.publishSnapshot?.().catch(() => {});

    // Detect cancellation mid-block. Break (not throw/return) so
    // already-fetched images are written to storage before exiting.
    const [taskRow] = await getLocalDb().select({ status: TaskRun.status, controlRequestKind: TaskRun.controlRequestKind })
      .from(TaskRun)
      .where(eq(TaskRun.id, taskRunId));
    if (taskRow && (taskRow.status === 'canceling' || taskRow.controlRequestKind === 'cancel')) break;
  }

  if (renderedFiles.length > 0) {
    if (ctx.outputMode === 'import') {
      await importCardImageFilesToLocalBucket({
        requirementContent: exportResult.content ?? '{}',
        requirementName: exportResult.fileName ?? '',
        files: renderedFiles.map(f => ({ fileName: f.fileName, bytes: f.bytes })),
        bucketDir, force: false, dryRun: false,
      });
      const fileByName = new Map(renderedFiles.map(f => [f.fileName, f]));
      const db = getLocalDb();
      for (const request of requirementsFile.requests) {
        const rendered = fileByName.get(request.output.fileName);
        if (!rendered) continue;
        try {
          await db.insert(CardImageAsset).values({
            imageSpecVersion: requirementsFile.imageSpecVersion ?? 'v1',
            renderHash: request.card.renderHash,
            lang: request.card.lang,
            zone: request.variant.zone,
            template: request.variant.template,
            premium: request.variant.premium,
            r2Bucket: request.target.r2Bucket,
            r2Key: request.target.r2Key,
            contentType: request.target.contentType,
            width: request.output.width,
            height: request.output.height,
            sourceExportId: exportResult.exportId,
            status: 'ready' as const,
            verifiedAt: new Date(),
          }).onConflictDoUpdate({
            target: [CardImageAsset.imageSpecVersion, CardImageAsset.renderHash, CardImageAsset.zone, CardImageAsset.template, CardImageAsset.premium],
            set: { status: 'ready' as const, verifiedAt: new Date() },
          });
        } catch { /* best-effort */ }
      }
    } else {
      const tempDir = join(tmpdir(), 'hearthstone-image-render');
      await Bun.write(join(tempDir, 'dummy'), '').catch(() => Bun.spawnSync(['mkdir', '-p', tempDir]));
      for (const f of renderedFiles) {
        await Bun.write(join(tempDir, f.fileName), f.bytes);
      }
      ctx.archiveFilePaths = renderedFiles.map(f => join(tempDir, f.fileName));
    }
  }

  ctx.overallWritten += renderedFiles.length;
  ctx.overallRejected += failedFiles.length;

  // Advance cursor
  if (!exportResult.hasMore || !exportResult.nextCursor) {
    ctx.cursor = null;
  } else {
    ctx.cursor = exportResult.nextCursor;
  }
}

export const imageRenderTaskDefinition: TaskDefinition = {
  taskType: imageRenderTaskType,
  definitionVersion: imageRenderDefinitionVersion,
  supportsResume: false,
  effectModel: 'reconcilable',
  buildStagePlan(input) {
    const stages = imageRenderStagePlans.map(s => ({ ...s }));
    if ((input.params as any)?.outputMode !== 'download') {
      return stages.filter(s => s.stageKey !== 'finalizing');
    }
    return stages;
  },
  async prepareStageEntry({ stage, run, taskRunId }) {
    if (stage.stageKey === 'counting') {
      const params = run.params as unknown as CardImageRequirementExportInput;
      ctxMap.set(taskRunId, {
        filters: params,
        totalMissing: 0,
        cursor: null,
        batchIndex: 0,
        overallWritten: 0,
        overallSkipped: 0,
        overallRejected: 0,
        rendererBaseUrl: requireHearthstoneImageRendererBaseUrl(),
        bucketDir: requireHearthstoneImageBucketDir(),
        outputMode: (params as any).outputMode ?? 'import',
      });

      return { stageKey: stage.stageKey, stageIndex: stage.stageIndex, progressMode: 'simple', resumeMode: 'none', total: null, selectionAnchor: null };
    }
    if (stage.stageKey === 'processing') {
      const total = ctxMap.get(taskRunId)?.totalMissing ?? 1;
      return { stageKey: stage.stageKey, stageIndex: stage.stageIndex, progressMode: 'bounded', resumeMode: 'none', total, selectionAnchor: null };
    }
    if (stage.stageKey === 'finalizing') {
      return { stageKey: stage.stageKey, stageIndex: stage.stageIndex, progressMode: 'simple', resumeMode: 'none', total: null, selectionAnchor: null };
    }
    return { stageKey: stage.stageKey, stageIndex: stage.stageIndex, progressMode: stage.progressMode, resumeMode: stage.resumeMode, total: null, selectionAnchor: null };
  },
  buildBlocks({ stage, taskRunId }) { return buildImageRenderBlocks(stage, taskRunId); },
  async executeBlock(input) { await executeImageRenderBlock(input); },
};
