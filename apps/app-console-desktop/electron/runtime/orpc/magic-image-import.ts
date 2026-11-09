import { ORPCError } from '@orpc/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { runWithDb } from '@tcg-cards/db';
import { Print } from '@tcg-cards/db/schema/shared/magic/print';

import { getLocalDb } from '../lib/hearthstone/hsdata-local-db';
import { analyzeImportZip } from '../lib/magic/image-import/analyze';
import { clearImages, imageClearResult } from '../lib/magic/image-import/clear';
import { compareImageSources, imageCompareResult } from '../lib/magic/image-import/compare';
import { loadLocalAssetPreview } from '../lib/magic/image-import/local';
import { imageMarkResult, markPlaceholderImages } from '../lib/magic/image-import/mark';
import { checkImageQuality, imageQualityReport } from '../lib/magic/image-import/quality';
import { printImageDir } from '../lib/magic/image-import/common';
import { os } from './index';

const imageSet = z.strictObject({ code: z.string(), prints: z.number() });
const imageZipAnalysis = z.strictObject({
  convention:   z.enum(['face', 'named', 'plain', 'tree']).nullable(),
  entryCount:   z.number(),
  unrecognized: z.array(z.string()),
  candidates:   z.array(z.strictObject({ set: z.string(), lang: z.string(), rate: z.number() })),
});

/** Lists Magic sets with the number of active prints in each set. */
const listImageSets = os
  .input(z.strictObject({}))
  .output(z.array(imageSet))
  .handler(async () => {
    const db = getLocalDb();
    const rows = await runWithDb(db, () => db.select({
      code:   Print.set,
      prints: sql<number>`count(*)::int`,
    }).from(Print).where(isNull(Print.deletedAt)).groupBy(Print.set).orderBy(Print.set));
    return rows.map(row => ({ code: row.code, prints: Number(row.prints) }));
  });

/** Reads the print layout and local asset files used by one import preview. */
const localImagePreview = os
  .input(z.strictObject({ set: z.string().min(1), lang: z.string().min(1), number: z.string().min(1) }))
  .output(z.strictObject({
    layout: z.string().nullable(),
    faces:  z.array(z.strictObject({
      faceIndex: z.number(),
      fileName:  z.string().nullable(),
      found:     z.boolean(),
      dataUrl:   z.string().nullable(),
    })),
  }))
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const row = await db.select({ layout: Print.layout })
      .from(Print)
      .where(and(
        eq(Print.set, input.set),
        eq(Print.lang, input.lang as typeof Print.$inferSelect.lang),
        eq(Print.number, input.number),
        isNull(Print.deletedAt),
      ))
      .limit(1)
      .then(rows => rows[0] ?? null);
    return loadLocalAssetPreview(printImageDir(input.set, input.lang), row?.layout ?? null, input.number);
  });

/** Analyzes a zip archive's names and likely set/language targets. */
const analyzeImageArchive = os
  .input(z.strictObject({ zipPath: z.string().min(1) }))
  .output(imageZipAnalysis)
  .handler(async ({ input }) => analyzeImportZip(getLocalDb(), input.zipPath));

/** Compares the locally available Scryfall and Gatherer images for one print. */
const compareImages = os
  .input(z.strictObject({ set: z.string().min(1), lang: z.string().min(1), number: z.string().min(1) }))
  .output(imageCompareResult)
  .handler(async ({ input }) => {
    const result = await compareImageSources(getLocalDb(), input);
    if (!result) throw new ORPCError('NOT_FOUND', { message: '未找到该印张' });
    return result;
  });

/** Checks a set's imported card images for missing images and size outliers. */
const checkImagesQuality = os
  .input(z.strictObject({ set: z.string().min(1) }))
  .output(imageQualityReport)
  .handler(async ({ input }) => checkImageQuality(getLocalDb(), input.set));

/** Clears imported images within one set, language, and optional number range. */
const clearPrintImages = os
  .input(z.strictObject({
    set:     z.string().min(1),
    langs:   z.array(z.string()).min(1),
    numbers: z.array(z.string().min(1)).optional(),
  }))
  .output(imageClearResult)
  .handler(async ({ input }) => clearImages(getLocalDb(), input));

/** Marks eligible prints with no image as confirmed image-less prints. */
const markPrintImages = os
  .input(z.strictObject({
    set:     z.string().min(1),
    langs:   z.array(z.string()).min(1),
    numbers: z.array(z.string().min(1)).optional(),
  }))
  .output(imageMarkResult)
  .handler(async ({ input }) => markPlaceholderImages(getLocalDb(), input));

/** Endpoints used by the Magic image import page. */
export const magicImageImportRouter = {
  images: {
    sets:         listImageSets,
    localPreview: localImagePreview,
    compare:      compareImages,
    qualityCheck: checkImagesQuality,
    clear:        clearPrintImages,
    mark:         markPrintImages,
  },
  analyze: { imageArchive: analyzeImageArchive },
};
