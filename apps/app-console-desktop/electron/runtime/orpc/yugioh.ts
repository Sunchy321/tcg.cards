import { z } from 'zod';

import { getLatestYugiohImportBatch, listYugiohImportBatches } from '../lib/yugioh/cards-import';
import { getIncompleteYugiohPublishBatch, listYugiohPublishBatches } from '../lib/yugioh/cards-publish';
import { yugiohCardsSource, yugiohCardsUrl } from '../lib/yugioh/cards-source';
import { getLatestYugiohImageImportBatch, listYugiohImageImportBatches } from '../lib/yugioh/image-import';
import { yugiohImageMetadataUrl, yugiohImageSource } from '../lib/yugioh/image-source';
import { getYugiohPublishTarget } from '../lib/yugioh/publish-target';
import { os } from './index';

const importReport = z.object({
  batchId:           z.string(),
  source:            z.string(),
  sourceUrl:         z.string(),
  archiveHash:       z.string().nullable(),
  status:            z.enum(['running', 'completed', 'completed_with_errors', 'failed', 'interrupted']),
  sourceRecordCount: z.number(),
  addedCount:        z.number(),
  updatedCount:      z.number(),
  skippedCount:      z.number(),
  failedCount:       z.number(),
  softDeletedCount:  z.number(),
  error:             z.string().nullable(),
  startedAt:         z.string(),
  completedAt:       z.string().nullable(),
});

const imageImportReport = z.object({
  batchId:              z.string(),
  source:               z.string(),
  metadataUrl:          z.string(),
  metadataHash:         z.string().nullable(),
  status:               z.enum(['running', 'completed', 'completed_with_errors', 'failed', 'interrupted']),
  metadataRecordCount:  z.number(),
  eligibleCardCount:    z.number(),
  unavailableCardCount: z.number(),
  unmatchedSourceCount: z.number(),
  addedCount:           z.number(),
  updatedCount:         z.number(),
  skippedCount:         z.number(),
  missingCount:         z.number(),
  failedCount:          z.number(),
  softDeletedCount:     z.number(),
  downloadedByteCount:  z.number(),
  error:                z.string().nullable(),
  startedAt:            z.string(),
  completedAt:          z.string().nullable(),
});

const publishReport = z.object({
  batchId:              z.string(),
  publishTargetId:      z.string(),
  environment:          z.string(),
  targetFingerprint:    z.string(),
  manifestHash:         z.string(),
  previousManifestHash: z.string().nullable(),
  status:               z.enum(['planning', 'applying', 'completed', 'failed']),
  error:                z.string().nullable(),
  totalRowCount:        z.number(),
  changedRowCount:      z.number(),
  insertedRowCount:     z.number(),
  updatedRowCount:      z.number(),
  unchangedRowCount:    z.number(),
  createdAt:            z.string(),
  completedAt:          z.string().nullable(),
  pendingRowCount:      z.number().optional(),
});

/** Fixed structured card source shown on the local management page. */
const sourceInfo = os.output(z.strictObject({ source: z.string(), url: z.string() })).handler(async () => ({
  source: yugiohCardsSource,
  url:    yugiohCardsUrl,
}));

/** Fixed primary-image source shown on the local management page. */
const imageSourceInfo = os.output(z.strictObject({ source: z.string(), metadataUrl: z.string() })).handler(async () => ({
  source:      yugiohImageSource,
  metadataUrl: yugiohImageMetadataUrl,
}));

/** Recent card imports and the latest batch shown after a page opens. */
const getImportState = os.output(z.strictObject({ latest: importReport.nullable(), batches: importReport.array() })).handler(async () => ({
  latest:  await getLatestYugiohImportBatch(),
  batches: await listYugiohImportBatches(),
}));

/** Recent primary-image imports shown after a page opens. */
const getImageImportState = os.output(z.strictObject({ latest: imageImportReport.nullable(), batches: imageImportReport.array() })).handler(async () => ({
  latest:  await getLatestYugiohImageImportBatch(),
  batches: await listYugiohImageImportBatches(),
}));

/** Recent test publications for the configured target, without opening a remote connection. */
const getPublishState = os.output(z.strictObject({ incomplete: publishReport.nullable(), batches: publishReport.array() })).handler(async () => {
  if (getYugiohPublishTarget() == null) return { incomplete: null, batches: [] };
  return {
    incomplete: await getIncompleteYugiohPublishBatch(),
    batches:    await listYugiohPublishBatches(),
  };
});

/** Read-only Yu-Gi-Oh! runtime procedures; writes start through the Electron task host. */
export const yugiohRouter = {
  sourceInfo,
  imageSourceInfo,
  getImportState,
  getImageImportState,
  getPublishState,
};
