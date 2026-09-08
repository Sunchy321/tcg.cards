import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { desc, eq, isNull } from 'drizzle-orm';

import {
  EvolveCard,
  EvolveImageAsset,
  EvolveImageImportBatch,
  EvolveImageImportFailure,
} from '@tcg-cards/db/schema/local/shadowverse';

import {
  evolveImageSource,
  getEvolveImageBucketDir,
  evolveImageAssetKey,
} from './image-config';
import { getShadowverseEvolveLocalDb } from './shadowverse-evolve-local-db';

import type { ShadowverseEvolveLocalDb } from './shadowverse-evolve-local-db';

/** PNG magic bytes every downloaded asset must start with. */
const pngSignature = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

const maxAssetBytes = 20 * 1024 * 1024;
const maxAttempts = 3;

/** Structured image-source error with a stable machine-readable code. */
export class EvolveImageSourceError extends Error {
  /** Builds one image-source error with a stable machine-readable code. */
  constructor(
    public readonly code: 'HTTP_MISSING' | 'HTTP_ERROR' | 'INVALID_PNG' | 'NETWORK_ERROR',
    message: string,
  ) {
    super(message);
    this.name = 'EvolveImageSourceError';
  }
}

/** Whether one HTTP status should be retried with backoff instead of failing fast. */
function isRetryableStatus(status: number) {
  return status === 429 || status >= 500;
}

/** Sleeps for one backoff tick. */
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** One PNG asset downloaded and validated against the PNG signature. */
export async function downloadEvolveImage(url: string, fetcher: typeof fetch = fetch): Promise<Uint8Array> {
  let lastError: EvolveImageSourceError = new EvolveImageSourceError('NETWORK_ERROR', 'image download failed.');

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;

    try {
      response = await fetcher(url, {
        headers: {
          accept: 'image/png,image/*;q=0.9',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        },
      });
    } catch (error) {
      lastError = new EvolveImageSourceError('NETWORK_ERROR', error instanceof Error ? error.message : String(error));
      await sleep(attempt * 1000);
      continue;
    }

    if (response.status === 403 || response.status === 404) {
      throw new EvolveImageSourceError('HTTP_MISSING', `image ${url} is not available (HTTP ${response.status}).`);
    }

    if (!response.ok) {
      lastError = new EvolveImageSourceError('HTTP_ERROR', `image ${url} download failed with HTTP ${response.status}.`);
      if (!isRetryableStatus(response.status)) {
        throw lastError;
      }
      await sleep(attempt * 1000);
      continue;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());

    if (bytes.length === 0 || bytes.length > maxAssetBytes) {
      throw new EvolveImageSourceError('INVALID_PNG', `image ${url} has an unexpected byte size ${bytes.length}.`);
    }

    if (!bytes.subarray(0, pngSignature.length).every((byte, index) => byte === pngSignature[index])) {
      throw new EvolveImageSourceError('INVALID_PNG', `image ${url} is not a PNG payload.`);
    }

    return bytes;
  }

  throw lastError;
}

/** One planned Evolve image download resolved to its local file path and source URL. */
export interface PlannedEvolveImage {
  lang: 'ja' | 'en';
  cardNo: string;
  filePath: string;
  url: string;
}

/** Deterministic download plan derived from the official image paths stored on each card. */
export async function buildEvolveImagePlan(db: ShadowverseEvolveLocalDb): Promise<PlannedEvolveImage[]> {
  const rows = await db.select({
    cardNo: EvolveCard.cardNo,
    imageUrlJa: EvolveCard.imageUrlJa,
    imageUrlEn: EvolveCard.imageUrlEn,
  })
    .from(EvolveCard)
    .where(isNull(EvolveCard.deletedAt))
    .orderBy(EvolveCard.cardNo);

  const assets: PlannedEvolveImage[] = [];

  for (const row of rows) {
    if (row.imageUrlJa != null) {
      assets.push({
        lang: 'ja',
        cardNo: row.cardNo,
        filePath: resolve(getEvolveImageBucketDir(), 'ja', `${row.cardNo}.png`),
        url: new URL(row.imageUrlJa, 'https://shadowverse-evolve.com').toString(),
      });
    }

    if (row.imageUrlEn != null) {
      assets.push({
        lang: 'en',
        cardNo: row.cardNo,
        filePath: resolve(getEvolveImageBucketDir(), 'en', `${row.cardNo}.png`),
        url: new URL(row.imageUrlEn, 'https://en.shadowverse-evolve.com').toString(),
      });
    }
  }

  return assets;
}

/** Interrupted image batches marked before a new desktop image import begins. */
export async function markInterruptedEvolveImageBatches(db: ShadowverseEvolveLocalDb) {
  const now = new Date();

  await db.update(EvolveImageImportBatch)
    .set({ status: 'interrupted', error: 'Desktop image import process ended before completion.', completedAt: now, updatedAt: now })
    .where(eq(EvolveImageImportBatch.status, 'running'));
}

/** Running counters threaded through the image import blocks. */
export interface EvolveImageImportCounters {
  downloadedCount: number;
  skippedCount: number;
  missingCount: number;
  failedCount: number;
  downloadedByteCount: number;
}

/** One image asset downloaded or skipped against the local bucket, with bookkeeping. */
export async function processEvolveImageAsset(
  db: ShadowverseEvolveLocalDb,
  batchId: string,
  asset: PlannedEvolveImage,
): Promise<{ outcome: 'downloaded' | 'skipped' | 'missing' | 'failed'; byteSize: number }> {
  const key = evolveImageAssetKey(asset.lang, asset.cardNo);

  try {
    const file = Bun.file(asset.filePath);

    if (await file.exists()) {
      await upsertEvolveImageAssetRow(db, asset, file.size, null);
      return { outcome: 'skipped', byteSize: 0 };
    }

    const bytes = await downloadEvolveImage(asset.url);
    mkdirSync(dirname(asset.filePath), { recursive: true });
    await Bun.write(asset.filePath, bytes);
    await upsertEvolveImageAssetRow(db, asset, bytes.length, new Date());

    return { outcome: 'downloaded', byteSize: bytes.length };
  } catch (error) {
    const isMissing = error instanceof EvolveImageSourceError && error.code === 'HTTP_MISSING';
    const code = error instanceof EvolveImageSourceError ? error.code : 'FILE_WRITE';
    const message = error instanceof Error ? error.message : String(error);

    await db.insert(EvolveImageImportFailure).values({
      batchId,
      assetKey: key,
      stage: 'download',
      code,
      message,
      payload: { url: asset.url, cardNo: asset.cardNo },
    }).onConflictDoUpdate({
      target: [EvolveImageImportFailure.batchId, EvolveImageImportFailure.assetKey],
      set: { stage: 'download', code, message },
    });

    return { outcome: isMissing ? 'missing' : 'failed', byteSize: 0 };
  }
}

/** Image-asset registry row upserted after a file is confirmed on disk. */
async function upsertEvolveImageAssetRow(
  db: ShadowverseEvolveLocalDb,
  asset: PlannedEvolveImage,
  byteSize: number,
  downloadedAt: Date | null,
) {
  await db.insert(EvolveImageAsset).values({
    lang: asset.lang,
    cardNo: asset.cardNo,
    filePath: asset.filePath,
    byteSize,
    downloadedAt: downloadedAt ?? new Date(),
  }).onConflictDoUpdate({
    target: [EvolveImageAsset.lang, EvolveImageAsset.cardNo],
    set: {
      filePath: asset.filePath,
      byteSize,
      retiredAt: null,
      ...(downloadedAt == null ? {} : { downloadedAt }),
    },
  });
}

/** Image import batch summary returned to desktop clients. */
export interface EvolveImageImportReport {
  batchId: string;
  source: string;
  status: 'running' | 'completed' | 'completed_with_errors' | 'failed' | 'interrupted';
  assetCount: number;
  downloadedCount: number;
  skippedCount: number;
  missingCount: number;
  failedCount: number;
  downloadedByteCount: number;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

/** One database image import batch row converted into the stable desktop report shape. */
export function buildEvolveImageImportReport(batch: typeof EvolveImageImportBatch.$inferSelect): EvolveImageImportReport {
  return {
    batchId: batch.id,
    source: batch.source,
    status: batch.status,
    assetCount: batch.assetCount,
    downloadedCount: batch.downloadedCount,
    skippedCount: batch.skippedCount,
    missingCount: batch.missingCount,
    failedCount: batch.failedCount,
    downloadedByteCount: batch.downloadedByteCount,
    error: batch.error,
    startedAt: batch.startedAt.toISOString(),
    completedAt: batch.completedAt?.toISOString() ?? null,
  };
}

/** Most recent local image import batches ordered from newest to oldest. */
export async function listEvolveImageImportBatches(limit = 20) {
  const rows = await getShadowverseEvolveLocalDb().select()
    .from(EvolveImageImportBatch)
    .where(eq(EvolveImageImportBatch.source, evolveImageSource))
    .orderBy(desc(EvolveImageImportBatch.startedAt))
    .limit(limit);

  return rows.map(buildEvolveImageImportReport);
}

/** Aggregated counters persisted once all planned assets are processed. */
export async function finalizeEvolveImageImportBatch(options: {
  db: ShadowverseEvolveLocalDb;
  batchId: string;
  counters: EvolveImageImportCounters;
  assetCount: number;
}) {
  const { db, batchId, counters, assetCount } = options;
  const completedAt = new Date();
  const status = counters.failedCount > 0 ? 'completed_with_errors' as const : 'completed' as const;

  const completed = await db.update(EvolveImageImportBatch)
    .set({
      status,
      assetCount,
      downloadedCount: counters.downloadedCount,
      skippedCount: counters.skippedCount,
      missingCount: counters.missingCount,
      failedCount: counters.failedCount,
      downloadedByteCount: counters.downloadedByteCount,
      completedAt,
      updatedAt: completedAt,
    })
    .where(eq(EvolveImageImportBatch.id, batchId))
    .returning()
    .then(rows => rows[0]);

  return completed ?? null;
}
