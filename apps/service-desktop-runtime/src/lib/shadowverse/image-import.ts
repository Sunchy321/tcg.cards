import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { desc, eq, isNull } from 'drizzle-orm';

import {
  Card,
  CardEvolutionLocalization,
  CardLocalization,
  CardStyleLocalization,
  ImageAsset,
  ImageImportBatch,
  ImageImportFailure,
} from '@tcg-cards/db/schema/local/shadowverse';

import {
  buildImageUrl,
  getShadowverseImageBucketDir,
  imageAssetKey,
  imageKindDirectory,
  shadowverseImageSource,
} from './image-config';
import { downloadImageAsset, ImageSourceError } from './image-source';
import { getShadowverseLocalDb } from './shadowverse-local-db';

import type { ShadowverseLocalDb } from './shadowverse-local-db';
import type { ImageAssetKind } from '@tcg-cards/db/schema/local/shadowverse/image-import';
import type { ShadowverseLang } from '#model/shadowverse/schema/data/card-list';

const langOrder: ShadowverseLang[] = ['ja', 'en', 'chs', 'cht', 'ko'];
const kindOrder: ImageAssetKind[] = ['card', 'banner', 'card_evo', 'banner_evo', 'style_card', 'style_evo'];

/** One planned image download resolved to its local file path and source URL. */
export interface PlannedImageAsset {
  lang: ShadowverseLang;
  kind: ImageAssetKind;
  cardId: number;
  styleIndex: number;
  hash: string;
  filePath: string;
  url: string;
}

/** Optional progress update emitted during one desktop image import. */
export interface ShadowverseImageImportProgress {
  phase: string;
  message: string;
  completedCount?: number;
  totalCount?: number;
}

/** Image import batch summary returned to desktop clients. */
export interface ShadowverseImageImportReport {
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

/** Deterministic sort order so a resumed run walks assets in the same sequence. */
function planSortKey(asset: PlannedImageAsset) {
  return [
    langOrder.indexOf(asset.lang),
    kindOrder.indexOf(asset.kind),
    asset.cardId,
    asset.styleIndex,
  ];
}

/** Collects planned base and banner assets for every active card localization. */
async function planCardAssets(db: ShadowverseLocalDb): Promise<PlannedImageAsset[]> {
  const rows = await db.select({
    lang: CardLocalization.lang,
    cardId: CardLocalization.cardId,
    cardImageHash: CardLocalization.cardImageHash,
    cardBannerImageHash: CardLocalization.cardBannerImageHash,
  })
    .from(CardLocalization)
    .innerJoin(Card, eq(Card.cardId, CardLocalization.cardId))
    .where(isNull(Card.deletedAt));

  const assets: PlannedImageAsset[] = [];

  for (const row of rows) {
    for (const kind of ['card', 'banner'] as const) {
      const hash = kind === 'card' ? row.cardImageHash : row.cardBannerImageHash;
      if (hash == null) continue;
      assets.push(buildPlannedAsset(row.lang, kind, row.cardId, 0, hash));
    }
  }

  return assets;
}

/** Collects planned evolution assets for every active card evolution localization. */
async function planEvolutionAssets(db: ShadowverseLocalDb): Promise<PlannedImageAsset[]> {
  const rows = await db.select({
    lang: CardEvolutionLocalization.lang,
    cardId: CardEvolutionLocalization.cardId,
    cardImageHash: CardEvolutionLocalization.cardImageHash,
    cardBannerImageHash: CardEvolutionLocalization.cardBannerImageHash,
  })
    .from(CardEvolutionLocalization)
    .innerJoin(Card, eq(Card.cardId, CardEvolutionLocalization.cardId))
    .where(isNull(Card.deletedAt));

  const assets: PlannedImageAsset[] = [];

  for (const row of rows) {
    for (const kind of ['card_evo', 'banner_evo'] as const) {
      const hash = kind === 'card_evo' ? row.cardImageHash : row.cardBannerImageHash;
      if (hash == null) continue;
      assets.push(buildPlannedAsset(row.lang, kind, row.cardId, 0, hash));
    }
  }

  return assets;
}

/** Collects planned style assets for every active card style localization. */
async function planStyleAssets(db: ShadowverseLocalDb): Promise<PlannedImageAsset[]> {
  const rows = await db.select({
    lang: CardStyleLocalization.lang,
    cardId: CardStyleLocalization.cardId,
    styleIndex: CardStyleLocalization.styleIndex,
    cardImageHash: CardStyleLocalization.cardImageHash,
    evoCardImageHash: CardStyleLocalization.evoCardImageHash,
  })
    .from(CardStyleLocalization)
    .innerJoin(Card, eq(Card.cardId, CardStyleLocalization.cardId))
    .where(isNull(Card.deletedAt));

  const assets: PlannedImageAsset[] = [];

  for (const row of rows) {
    assets.push(buildPlannedAsset(row.lang, 'style_card', row.cardId, row.styleIndex, row.cardImageHash));
    if (row.evoCardImageHash != null) {
      assets.push(buildPlannedAsset(row.lang, 'style_evo', row.cardId, row.styleIndex, row.evoCardImageHash));
    }
  }

  return assets;
}

/** Resolves one hash into a fully planned asset with local path and source URL. */
function buildPlannedAsset(
  lang: ShadowverseLang,
  kind: ImageAssetKind,
  cardId: number,
  styleIndex: number,
  hash: string,
): PlannedImageAsset {
  const directory = imageKindDirectory(kind);
  const filePath = resolve(getShadowverseImageBucketDir(), lang, directory, `${hash}.png`);

  return {
    lang,
    kind,
    cardId,
    styleIndex,
    hash,
    filePath,
    url: buildImageUrl(lang, kind, hash),
  };
}

/** Full deterministic download plan derived from current localization rows. */
export async function buildImageAssetPlan(db: ShadowverseLocalDb) {
  const assets = [
    ...await planCardAssets(db),
    ...await planEvolutionAssets(db),
    ...await planStyleAssets(db),
  ];

  assets.sort((left, right) => {
    const leftKey = planSortKey(left);
    const rightKey = planSortKey(right);

    for (let index = 0; index < leftKey.length; index += 1) {
      const diff = (leftKey[index] ?? 0) - (rightKey[index] ?? 0);
      if (diff !== 0) return diff;
    }

    return 0;
  });

  return assets;
}

/** Interrupted image batches marked before a new desktop image import begins. */
export async function markInterruptedImageImportBatches(db: ShadowverseLocalDb) {
  const now = new Date();

  await db.update(ImageImportBatch)
    .set({ status: 'interrupted', error: 'Desktop image import process ended before completion.', completedAt: now, updatedAt: now })
    .where(eq(ImageImportBatch.status, 'running'));
}

/** One image asset downloaded or skipped against the local bucket, with bookkeeping. */
export async function processImageAsset(
  db: ShadowverseLocalDb,
  batchId: string,
  asset: PlannedImageAsset,
): Promise<{ outcome: 'downloaded' | 'skipped' | 'missing' | 'failed'; byteSize: number }> {
  const key = imageAssetKey(asset.lang, asset.kind, asset.cardId, asset.styleIndex);

  try {
    const file = Bun.file(asset.filePath);

    if (await file.exists()) {
      await upsertImageAssetRow(db, asset, file.size, null);
      return { outcome: 'skipped', byteSize: 0 };
    }

    const bytes = await downloadImageAsset(asset.lang, asset.kind, asset.hash);
    mkdirSync(dirname(asset.filePath), { recursive: true });
    await Bun.write(asset.filePath, bytes);
    await upsertImageAssetRow(db, asset, bytes.length, new Date());

    return { outcome: 'downloaded', byteSize: bytes.length };
  } catch (error) {
    const isMissing = error instanceof ImageSourceError && error.code === 'HTTP_MISSING';
    const code = error instanceof ImageSourceError ? error.code : 'FILE_WRITE';
    const message = error instanceof Error ? error.message : String(error);

    await db.insert(ImageImportFailure).values({
      batchId,
      assetKey: key,
      stage: 'download',
      code,
      message,
      payload: { url: asset.url, cardId: asset.cardId, kind: asset.kind },
    }).onConflictDoUpdate({
      target: [ImageImportFailure.batchId, ImageImportFailure.assetKey],
      set: { stage: 'download', code, message },
    });

    return { outcome: isMissing ? 'missing' : 'failed', byteSize: 0 };
  }
}

/** Image-asset registry row upserted after a file is confirmed on disk. */
async function upsertImageAssetRow(
  db: ShadowverseLocalDb,
  asset: PlannedImageAsset,
  byteSize: number,
  downloadedAt: Date | null,
) {
  await db.insert(ImageAsset).values({
    lang: asset.lang,
    kind: asset.kind,
    cardId: asset.cardId,
    styleIndex: asset.styleIndex,
    hash: asset.hash,
    filePath: asset.filePath,
    byteSize,
    downloadedAt: downloadedAt ?? new Date(),
  }).onConflictDoUpdate({
    target: [ImageAsset.lang, ImageAsset.kind, ImageAsset.cardId, ImageAsset.styleIndex],
    set: {
      hash: asset.hash,
      filePath: asset.filePath,
      byteSize,
      retiredAt: null,
      ...(downloadedAt == null ? {} : { downloadedAt }),
    },
  });
}

/** One database image import batch row converted into the stable desktop report shape. */
export function buildImageImportReport(batch: typeof ImageImportBatch.$inferSelect): ShadowverseImageImportReport {
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
export async function listShadowverseImageImportBatches(limit = 20) {
  const rows = await getShadowverseLocalDb().select()
    .from(ImageImportBatch)
    .where(eq(ImageImportBatch.source, shadowverseImageSource))
    .orderBy(desc(ImageImportBatch.startedAt))
    .limit(limit);

  return rows.map(buildImageImportReport);
}

/** Running counters threaded through the image import blocks. */
export interface ImageImportCounters {
  downloadedCount: number;
  skippedCount: number;
  missingCount: number;
  failedCount: number;
  downloadedByteCount: number;
}

/** Aggregated counters persisted once all planned assets are processed. */
export async function finalizeImageImportBatch(options: {
  db: ShadowverseLocalDb;
  batchId: string;
  counters: ImageImportCounters;
  assetCount: number;
}) {
  const { db, batchId, counters, assetCount } = options;
  const completedAt = new Date();
  const status = counters.failedCount > 0 ? 'completed_with_errors' as const : 'completed' as const;

  const completed = await db.update(ImageImportBatch)
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
    .where(eq(ImageImportBatch.id, batchId))
    .returning()
    .then(rows => rows[0]);

  return completed ?? null;
}
