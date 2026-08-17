import {
  and,
  desc,
  eq,
} from 'drizzle-orm';

import {
  Card,
  CardImageSource,
  ImageImportBatch,
  ImageImportFailure,
  ImageImportState,
} from '@tcg-cards/db/schema/local/yugioh';

import { getYugiohLocalDb } from './yugioh-local-db';
import { requireYugiohImageBucketDir } from './image-config';
import {
  ImageSourceError,
  downloadYugiohImage,
  downloadYugiohImageMetadata,
  isYugiohImageAssetValid,
  passwordToImageSourceId,
  prepareYugiohImageBucket,
  writeYugiohImageAsset,
  yugiohImageMetadataUrl,
  yugiohImageR2Bucket,
  yugiohImageSource,
  type ImageFetcher,
  type YugiohImageMetadataRecord,
} from './image-source';

/** Aggregate primary-image import result returned to desktop clients. */
export interface YugiohImageImportReport {
  batchId: string;
  source: string;
  metadataUrl: string;
  metadataHash: string | null;
  status: 'running' | 'completed' | 'completed_with_errors' | 'failed' | 'interrupted';
  metadataRecordCount: number;
  eligibleCardCount: number;
  unavailableCardCount: number;
  unmatchedSourceCount: number;
  addedCount: number;
  updatedCount: number;
  skippedCount: number;
  missingCount: number;
  failedCount: number;
  softDeletedCount: number;
  downloadedByteCount: number;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

/** Optional progress event emitted while one image metadata snapshot is applied. */
export interface YugiohImageImportProgress {
  phase: string;
  message: string;
  completedCount?: number;
  totalCount?: number;
}

/** Pure inputs controlling whether one matched image is added, updated, or skipped. */
export interface ImageImportDecisionInput {
  hasDomainImage: boolean;
  domainImageActive: boolean;
  mappingMatches: boolean;
  localAssetValid: boolean;
}

/** Minimal state controlling whether a previously active image must be soft-deleted. */
export interface ImageSoftDeleteInput {
  mappingActive: boolean;
  sourceRecordMatched: boolean;
  cardMatched: boolean;
}

/** Existing image state classified without performing network or database writes. */
export function decideImageImportAction(input: ImageImportDecisionInput) {
  if (!input.hasDomainImage) {
    return 'added' as const;
  }

  if (input.domainImageActive && input.mappingMatches && input.localAssetValid) {
    return 'skipped' as const;
  }

  return 'updated' as const;
}

/** Active source mapping absent from the matched snapshot classified for soft deletion. */
export function shouldSoftDeletePrimaryImage(input: ImageSoftDeleteInput) {
  return input.mappingActive && !input.sourceRecordMatched && !input.cardMatched;
}

/** Database batch row converted into the stable desktop report shape. */
function buildImageImportReport(batch: typeof ImageImportBatch.$inferSelect): YugiohImageImportReport {
  return {
    batchId: batch.id,
    source: batch.source,
    metadataUrl: batch.metadataUrl,
    metadataHash: batch.metadataHash,
    status: batch.status,
    metadataRecordCount: batch.metadataRecordCount,
    eligibleCardCount: batch.eligibleCardCount,
    unavailableCardCount: batch.unavailableCardCount,
    unmatchedSourceCount: batch.unmatchedSourceCount,
    addedCount: batch.addedCount,
    updatedCount: batch.updatedCount,
    skippedCount: batch.skippedCount,
    missingCount: batch.missingCount,
    failedCount: batch.failedCount,
    softDeletedCount: batch.softDeletedCount,
    downloadedByteCount: batch.downloadedByteCount,
    error: batch.error,
    startedAt: batch.startedAt.toISOString(),
    completedAt: batch.completedAt?.toISOString() ?? null,
  };
}

/** Unknown thrown value converted into one safe diagnostic string. */
function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** Image-source error mapped to one stable per-record failure stage. */
function getFailureStage(error: unknown) {
  if (!(error instanceof ImageSourceError)) {
    return 'write';
  }

  if (error.code === 'IMAGE_HTTP_ERROR' || error.code === 'IMAGE_HTML_RESPONSE') {
    return 'download';
  }

  if (error.code === 'ASSET_CONFLICT'
    || error.code === 'ASSET_WRITE_MISMATCH'
    || error.code === 'INVALID_BUCKET'
    || error.code === 'INVALID_BUCKET_PATH') {
    return 'write';
  }

  return 'validation';
}

/** Bounded worker pool processes source records without retaining all image bytes. */
async function runBounded<T>(values: T[], limit: number, worker: (value: T, index: number) => Promise<void>) {
  let cursor = 0;

  /** One worker repeatedly claims the next unprocessed array index. */
  async function runWorker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      await worker(values[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => runWorker()));
}

/** Source record and matching card paired for one bounded download task. */
interface ImageCandidate {
  card: typeof Card.$inferSelect;
  record: YugiohImageMetadataRecord;
}

/** Current mapping compared with provider metadata and domain facts. */
function mappingMatches(
  mapping: typeof CardImageSource.$inferSelect | undefined,
  card: typeof Card.$inferSelect,
  record: YugiohImageMetadataRecord,
) {
  return mapping != null
    && mapping.retiredAt == null
    && mapping.cardId === card.id
    && mapping.sourceMd5 === record.md5
    && mapping.sourceByteSize === record.byteSize
    && mapping.sourceModifiedAt.getTime() === record.modifiedAt.getTime()
    && mapping.r2Key === card.primaryImageR2Key
    && mapping.assetSha256 === card.primaryImageSha256;
}

/** One complete primary-image metadata snapshot downloaded and applied to local cards. */
export async function importYugiohImages(options?: {
  bucketDir?: string;
  fetcher?: ImageFetcher;
  concurrency?: number;
  onProgress?: (progress: YugiohImageImportProgress) => void;
}) {
  const db = getYugiohLocalDb();
  const bucketDir = options?.bucketDir ?? requireYugiohImageBucketDir();
  const fetcher = options?.fetcher ?? fetch;
  const concurrency = options?.concurrency ?? 6;
  const onProgress = options?.onProgress;
  const interruptedAt = new Date();

  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 16) {
    throw new Error('Yu-Gi-Oh! image import concurrency must be between 1 and 16.');
  }

  await prepareYugiohImageBucket(bucketDir);

  await db.update(ImageImportBatch)
    .set({ status: 'interrupted', error: 'Previous image import was interrupted.', completedAt: interruptedAt, updatedAt: interruptedAt })
    .where(and(
      eq(ImageImportBatch.source, yugiohImageSource),
      eq(ImageImportBatch.status, 'running'),
    ));

  const batch = await db.insert(ImageImportBatch).values({
    source: yugiohImageSource,
    metadataUrl: yugiohImageMetadataUrl,
  }).returning().then(rows => rows[0]);

  if (batch == null) {
    throw new Error('Image import batch creation did not return a batch ID.');
  }

  try {
    onProgress?.({ phase: 'metadata', message: '正在读取卡图清单…' });
    const metadata = await downloadYugiohImageMetadata(fetcher);
    const cards = await db.select().from(Card);
    const mappings = await db.select()
      .from(CardImageSource)
      .where(eq(CardImageSource.source, yugiohImageSource));
    const recordById = new Map(metadata.records.map(record => [record.sourceRecordId, record]));
    const mappingBySourceId = new Map(mappings.map(mapping => [mapping.sourceRecordId, mapping]));
    const activeMappingByCardId = new Map(
      mappings.filter(mapping => mapping.retiredAt == null).map(mapping => [mapping.cardId, mapping]),
    );
    const candidates: ImageCandidate[] = [];
    const matchedSourceIds = new Set<string>();
    const matchedCardIds = new Set<number>();
    let unavailableCardCount = 0;
    let missingCount = 0;

    for (const card of cards) {
      const sourceRecordId = passwordToImageSourceId(card.password);

      if (sourceRecordId == null) {
        unavailableCardCount += 1;
        continue;
      }

      const record = recordById.get(sourceRecordId);

      if (record == null) {
        missingCount += 1;
        continue;
      }

      matchedSourceIds.add(sourceRecordId);
      matchedCardIds.add(card.id);
      candidates.push({ card, record });
    }

    const unmatchedSourceCount = metadata.records.length - matchedSourceIds.size;
    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let softDeletedCount = 0;
    let downloadedByteCount = 0;
    let completedCount = 0;

    await db.update(ImageImportBatch).set({
      metadataHash: metadata.metadataHash,
      etag: metadata.etag,
      lastModified: metadata.lastModified,
      metadataRecordCount: metadata.records.length,
      eligibleCardCount: candidates.length,
      unavailableCardCount,
      unmatchedSourceCount,
      missingCount,
      updatedAt: new Date(),
    }).where(eq(ImageImportBatch.id, batch.id));

    onProgress?.({
      phase: 'images',
      message: '正在导入主卡图…',
      completedCount: 0,
      totalCount: candidates.length,
    });

    await runBounded(candidates, concurrency, async ({ card, record }) => {
      const mapping = mappingBySourceId.get(record.sourceRecordId);

      try {
        if (mapping != null && mapping.cardId !== card.id) {
          throw new Error(`Image source ${record.sourceRecordId} is mapped to card ${mapping.cardId}, not ${card.id}.`);
        }

        const matches = mappingMatches(mapping, card, record);
        const hasDomainImage = card.primaryImageR2Key != null;
        const domainImageActive = hasDomainImage && card.primaryImageDeletedAt == null;
        const localAssetValid = matches
          && card.primaryImageR2Key != null
          && card.primaryImageSha256 != null
          ? await isYugiohImageAssetValid(bucketDir, card.primaryImageR2Key, card.primaryImageSha256)
          : false;
        const action = decideImageImportAction({
          hasDomainImage,
          domainImageActive,
          mappingMatches: matches,
          localAssetValid,
        });

        if (action === 'skipped' && mapping != null) {
          await db.update(CardImageSource).set({
            lastSeenBatchId: batch.id,
            retiredAt: null,
            updatedAt: new Date(),
          }).where(and(
            eq(CardImageSource.source, yugiohImageSource),
            eq(CardImageSource.sourceRecordId, record.sourceRecordId),
          ));
          skippedCount += 1;
          return;
        }

        const image = await downloadYugiohImage(record, fetcher);
        await writeYugiohImageAsset(bucketDir, image);
        downloadedByteCount += image.byteSize;
        const now = new Date();
        const previousMapping = activeMappingByCardId.get(card.id);

        await db.transaction(async tx => {
          if (previousMapping != null && previousMapping.sourceRecordId !== record.sourceRecordId) {
            await tx.update(CardImageSource).set({ retiredAt: now, updatedAt: now })
              .where(and(
                eq(CardImageSource.source, yugiohImageSource),
                eq(CardImageSource.sourceRecordId, previousMapping.sourceRecordId),
              ));
          }

          await tx.update(Card).set({
            primaryImageR2Bucket: yugiohImageR2Bucket,
            primaryImageR2Key: image.r2Key,
            primaryImageContentType: 'image/webp',
            primaryImageByteSize: image.byteSize,
            primaryImageWidth: image.width,
            primaryImageHeight: image.height,
            primaryImageSha256: image.sha256,
            primaryImageDeletedAt: null,
            updatedAt: now,
          }).where(eq(Card.id, card.id));

          await tx.insert(CardImageSource).values({
            source: yugiohImageSource,
            sourceRecordId: record.sourceRecordId,
            cardId: card.id,
            sourceUrl: record.sourceUrl,
            sourceMd5: record.md5,
            sourceByteSize: record.byteSize,
            sourceModifiedAt: record.modifiedAt,
            assetSha256: image.sha256,
            r2Key: image.r2Key,
            firstSeenBatchId: batch.id,
            lastSeenBatchId: batch.id,
          }).onConflictDoUpdate({
            target: [CardImageSource.source, CardImageSource.sourceRecordId],
            set: {
              cardId: card.id,
              sourceUrl: record.sourceUrl,
              sourceMd5: record.md5,
              sourceByteSize: record.byteSize,
              sourceModifiedAt: record.modifiedAt,
              assetSha256: image.sha256,
              r2Key: image.r2Key,
              lastSeenBatchId: batch.id,
              retiredAt: null,
              updatedAt: now,
            },
          });
        });

        if (action === 'added') {
          addedCount += 1;
        } else {
          updatedCount += 1;
        }
      } catch (error) {
        failedCount += 1;
        const code = error instanceof ImageSourceError ? error.code : 'IMAGE_IMPORT_ERROR';

        await db.insert(ImageImportFailure).values({
          batchId: batch.id,
          sourceRecordId: record.sourceRecordId,
          stage: getFailureStage(error),
          code,
          message: getErrorMessage(error),
          payload: {
            cardId: card.id,
            sourceFileName: record.fileName,
            sourceByteSize: record.byteSize,
          },
        });
      } finally {
        completedCount += 1;
        onProgress?.({
          phase: 'images',
          message: '正在导入主卡图…',
          completedCount,
          totalCount: candidates.length,
        });
      }
    });

    for (const mapping of mappings) {
      const mappingActive = mapping.retiredAt == null;
      const sourceRecordMatched = matchedSourceIds.has(mapping.sourceRecordId);

      if (!mappingActive || sourceRecordMatched) {
        continue;
      }

      const deletedAt = new Date();
      const softDeleteImage = shouldSoftDeletePrimaryImage({
        mappingActive,
        sourceRecordMatched,
        cardMatched: matchedCardIds.has(mapping.cardId),
      });

      await db.transaction(async tx => {
        await tx.update(CardImageSource).set({ retiredAt: deletedAt, updatedAt: deletedAt })
          .where(and(
            eq(CardImageSource.source, yugiohImageSource),
            eq(CardImageSource.sourceRecordId, mapping.sourceRecordId),
          ));
        if (softDeleteImage) {
          await tx.update(Card).set({ primaryImageDeletedAt: deletedAt, updatedAt: deletedAt })
            .where(eq(Card.id, mapping.cardId));
        }
      });

      if (softDeleteImage) {
        softDeletedCount += 1;
      }
    }

    const completedAt = new Date();
    const status = failedCount === 0 ? 'completed' as const : 'completed_with_errors' as const;

    if (status === 'completed') {
      await db.insert(ImageImportState).values({
        source: yugiohImageSource,
        metadataUrl: yugiohImageMetadataUrl,
        lastSuccessfulBatchId: batch.id,
        metadataHash: metadata.metadataHash,
        etag: metadata.etag,
        lastModified: metadata.lastModified,
        updatedAt: completedAt,
      }).onConflictDoUpdate({
        target: ImageImportState.source,
        set: {
          metadataUrl: yugiohImageMetadataUrl,
          lastSuccessfulBatchId: batch.id,
          metadataHash: metadata.metadataHash,
          etag: metadata.etag,
          lastModified: metadata.lastModified,
          updatedAt: completedAt,
        },
      });
    }

    const completed = await db.update(ImageImportBatch).set({
      status,
      addedCount,
      updatedCount,
      skippedCount,
      missingCount,
      failedCount,
      softDeletedCount,
      downloadedByteCount,
      completedAt,
      updatedAt: completedAt,
    }).where(eq(ImageImportBatch.id, batch.id)).returning().then(rows => rows[0]);

    if (completed == null) {
      throw new Error('Completed image import batch could not be reloaded.');
    }

    onProgress?.({
      phase: 'completed',
      message: '主卡图导入完成。',
      completedCount: candidates.length,
      totalCount: candidates.length,
    });
    return buildImageImportReport(completed);
  } catch (error) {
    const failedAt = new Date();

    await db.update(ImageImportBatch).set({
      status: 'failed',
      error: getErrorMessage(error),
      completedAt: failedAt,
      updatedAt: failedAt,
    }).where(eq(ImageImportBatch.id, batch.id));
    throw error;
  }
}

/** Recent local primary-image import batches ordered from newest to oldest. */
export async function listYugiohImageImportBatches(limit = 20) {
  const rows = await getYugiohLocalDb().select()
    .from(ImageImportBatch)
    .where(eq(ImageImportBatch.source, yugiohImageSource))
    .orderBy(desc(ImageImportBatch.startedAt))
    .limit(limit);

  return rows.map(buildImageImportReport);
}

/** Most recent local primary-image import batch or null before the first run. */
export async function getLatestYugiohImageImportBatch() {
  return await listYugiohImageImportBatches(1).then(rows => rows[0] ?? null);
}
