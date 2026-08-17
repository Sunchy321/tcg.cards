import { z } from 'zod';

import {
  getLatestYugiohImportBatch,
  importYugiohCards,
  listYugiohImportBatches,
} from '../lib/yugioh/cards-import';
import {
  getIncompleteYugiohPublishBatch,
  listYugiohPublishBatches,
  publishYugiohCards,
} from '../lib/yugioh/cards-publish';
import {
  getCurrentYugiohJob,
  runYugiohJob,
  updateCurrentYugiohJob,
} from '../lib/yugioh/cards-progress';
import { yugiohCardsSource, yugiohCardsUrl } from '../lib/yugioh/cards-source';
import {
  getLatestYugiohImageImportBatch,
  importYugiohImages,
  listYugiohImageImportBatches,
} from '../lib/yugioh/image-import';
import {
  yugiohImageMetadataUrl,
  yugiohImageSource,
} from '../lib/yugioh/image-source';
import { os } from './index';

const importReport = z.object({
  batchId: z.string(),
  source: z.string(),
  sourceUrl: z.string(),
  archiveHash: z.string().nullable(),
  status: z.enum(['running', 'completed', 'completed_with_errors', 'failed', 'interrupted']),
  sourceRecordCount: z.number(),
  addedCount: z.number(),
  updatedCount: z.number(),
  skippedCount: z.number(),
  failedCount: z.number(),
  softDeletedCount: z.number(),
  error: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
});

const publishReport = z.object({
  batchId: z.string(),
  publishTargetId: z.string(),
  environment: z.string(),
  targetFingerprint: z.string(),
  manifestHash: z.string(),
  previousManifestHash: z.string().nullable(),
  status: z.enum(['planning', 'applying', 'completed', 'failed']),
  error: z.string().nullable(),
  totalRowCount: z.number(),
  changedRowCount: z.number(),
  insertedRowCount: z.number(),
  updatedRowCount: z.number(),
  unchangedRowCount: z.number(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  pendingRowCount: z.number().optional(),
});

const imageImportReport = z.object({
  batchId: z.string(),
  source: z.string(),
  metadataUrl: z.string(),
  metadataHash: z.string().nullable(),
  status: z.enum(['running', 'completed', 'completed_with_errors', 'failed', 'interrupted']),
  metadataRecordCount: z.number(),
  eligibleCardCount: z.number(),
  unavailableCardCount: z.number(),
  unmatchedSourceCount: z.number(),
  addedCount: z.number(),
  updatedCount: z.number(),
  skippedCount: z.number(),
  missingCount: z.number(),
  failedCount: z.number(),
  softDeletedCount: z.number(),
  downloadedByteCount: z.number(),
  error: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
});

const jobSnapshot = z.object({
  jobId: z.string(),
  kind: z.enum(['import', 'image_import', 'publish']),
  status: z.enum(['running', 'completed', 'failed']),
  phase: z.string(),
  message: z.string(),
  completedCount: z.number().nullable(),
  totalCount: z.number().nullable(),
  error: z.string().nullable(),
  startedAt: z.string(),
  updatedAt: z.string(),
  finishedAt: z.string().nullable(),
});

const sourceInfo = os
  .route({ method: 'GET', description: 'Read the fixed Yu-Gi-Oh! structured card source', tags: ['Yu-Gi-Oh!'] })
  .output(z.object({ source: z.string(), url: z.string() }))
  .handler(async () => ({ source: yugiohCardsSource, url: yugiohCardsUrl }));

const imageSourceInfo = os
  .route({ method: 'GET', description: 'Read the fixed Yu-Gi-Oh! primary-image metadata source', tags: ['Yu-Gi-Oh!'] })
  .output(z.object({ source: z.string(), metadataUrl: z.string() }))
  .handler(async () => ({ source: yugiohImageSource, metadataUrl: yugiohImageMetadataUrl }));

const getJob = os
  .route({ method: 'GET', description: 'Read the current Yu-Gi-Oh! desktop task', tags: ['Yu-Gi-Oh!'] })
  .output(jobSnapshot.nullable())
  .handler(async () => getCurrentYugiohJob());

const getImportState = os
  .route({ method: 'GET', description: 'Read recent Yu-Gi-Oh! import batches', tags: ['Yu-Gi-Oh!'] })
  .output(z.object({ latest: importReport.nullable(), batches: z.array(importReport) }))
  .handler(async () => ({
    latest: await getLatestYugiohImportBatch(),
    batches: await listYugiohImportBatches(),
  }));

const importCards = os
  .route({ method: 'POST', description: 'Download and import the fixed Yu-Gi-Oh! cards source', tags: ['Yu-Gi-Oh!'] })
  .output(importReport)
  .handler(async () => await runYugiohJob('import', async () => await importYugiohCards({
    onProgress: updateCurrentYugiohJob,
  })));

const getImageImportState = os
  .route({ method: 'GET', description: 'Read recent Yu-Gi-Oh! primary-image import batches', tags: ['Yu-Gi-Oh!'] })
  .output(z.object({ latest: imageImportReport.nullable(), batches: z.array(imageImportReport) }))
  .handler(async () => ({
    latest: await getLatestYugiohImageImportBatch(),
    batches: await listYugiohImageImportBatches(),
  }));

const importImages = os
  .route({ method: 'POST', description: 'Download and import the fixed Yu-Gi-Oh! primary-image source', tags: ['Yu-Gi-Oh!'] })
  .output(imageImportReport)
  .handler(async () => await runYugiohJob('image_import', async () => await importYugiohImages({
    onProgress: updateCurrentYugiohJob,
  })));

const getPublishState = os
  .route({ method: 'GET', description: 'Read recent Yu-Gi-Oh! test publication batches', tags: ['Yu-Gi-Oh!'] })
  .output(z.object({ incomplete: publishReport.nullable(), batches: z.array(publishReport) }))
  .handler(async () => ({
    incomplete: await getIncompleteYugiohPublishBatch(),
    batches: await listYugiohPublishBatches(),
  }));

const publishCards = os
  .route({ method: 'POST', description: 'Publish Yu-Gi-Oh! cards to the bound test remote', tags: ['Yu-Gi-Oh!'] })
  .output(publishReport)
  .handler(async () => await runYugiohJob('publish', async () => await publishYugiohCards({
    onProgress: updateCurrentYugiohJob,
  })));

/** Yu-Gi-Oh! import and test publication procedures exposed to desktop clients. */
export const yugiohRouter = {
  sourceInfo,
  imageSourceInfo,
  getJob,
  getImportState,
  importCards,
  getImageImportState,
  importImages,
  getPublishState,
  publishCards,
};
