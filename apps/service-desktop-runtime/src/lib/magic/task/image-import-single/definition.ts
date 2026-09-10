import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { runWithDb } from '@tcg-cards/db';
import { Gatherer, ScryfallCard } from '@tcg-cards/db/schema/local/magic';
import { Print } from '@tcg-cards/db/schema/shared/magic/print';

import { createDefinition } from '#task/definition';
import { getLocalDb } from '../../../hearthstone/hsdata-local-db';
import { uploadImageSources } from '../../image-import/common';
import { applySkipRules, ingestRemoteRow, ingestUploadItem } from '../../image-import/ingest';
import { addImageImportOutput, emptyImageImportOutput, imageImportOutput, pushCapped, type ImageImportOutput } from '../../image-import/result';
import { emptyRemoteSkipped, gathererQueueRow, scryfallQueueRow } from '../../image-import/source';

/** Single-target import: one print, uploaded as a file or downloaded by number. */
export const magicImageImportSingleTaskType = 'magic_image_import_single';

const input = z.strictObject({
  source:     z.enum([...uploadImageSources, 'scryfall', 'gatherer']),
  set:        z.string().min(1),
  lang:       z.string().min(1),
  number:     z.string().min(1),
  force:      z.boolean().optional().default(false),
  cleanupJpg: z.boolean().optional().default(false),
  // Upload single image only.
  faceIndex:  z.number().int().min(0).max(15).optional(),
  fileName:   z.string().optional(),
  dataBase64: z.string().optional(),
}).refine(v => {
  const isUpload = (uploadImageSources as readonly string[]).includes(v.source);
  if (v.dataBase64 != null) return isUpload;
  // Download sources derive the face index from scryfall_face, never from the caller.
  return !isUpload && v.faceIndex == null;
}, { message: '上传单张需要 dataBase64 与上传来源;下载来源不接受 faceIndex' });

type Input = z.infer<typeof input>;

const rowColumns = {
  cardId:              Print.cardId,
  version:             Print.version,
  set:                 Print.set,
  lang:                Print.lang,
  number:              Print.number,
  source:              Print.source,
  printName:           Print.name,
  scryfallFace:        Print.scryfallFace,
  imageInfo:           Print.imageInfo,
  scryfallImageStatus: ScryfallCard.imageStatus,
  scryfallImageUris:   ScryfallCard.imageUris,
  scryfallCardFaces:   ScryfallCard.cardFaces,
  multiverseId:        Print.multiverseId,
  gathererData:        Gatherer.data,
};

/** Runs one single-target import and returns its report. */
async function runSingle(ctx: Input): Promise<ImageImportOutput> {
  const db = getLocalDb();
  const rows = await runWithDb(db, () => db.select(rowColumns).from(Print)
    .leftJoin(ScryfallCard, eq(Print.scryfallCardId, ScryfallCard.cardId))
    .leftJoin(Gatherer, sql`${Gatherer.multiverseId} = ${Print.multiverseId}[1]`)
    .where(and(
      eq(Print.set, ctx.set),
      eq(Print.lang, ctx.lang as typeof Print.$inferSelect.lang),
      eq(Print.number, ctx.number),
      isNull(Print.deletedAt),
    )));

  if (rows.length === 0) {
    const counts = emptyImageImportOutput();
    counts.unmatched = 1;
    pushCapped(counts.unmatchedNumbers, ctx.number);
    return counts;
  }

  if (ctx.dataBase64 != null) {
    const data = Buffer.from(ctx.dataBase64, 'base64');
    let counts: ImageImportOutput = emptyImageImportOutput();
    for (const row of rows) {
      const { kept, skipped, skippedUpload } = applySkipRules([row], ctx.source, !!ctx.force, ctx.faceIndex);
      counts = addImageImportOutput(counts, { skipped, skippedUpload });
      for (const target of kept) {
        counts = addImageImportOutput(counts, await ingestUploadItem(db, { number: ctx.number, faceIndex: ctx.faceIndex, rows: [target] }, data, {
          imageSource: ctx.source,
          cleanupJpg:  !!ctx.cleanupJpg,
        }));
      }
    }
    return counts;
  }

  // Download sources: every face of the print, resolved by the source's own rules.
  const skipped = emptyRemoteSkipped();
  let counts: ImageImportOutput = emptyImageImportOutput();
  for (const row of rows) {
    const queued = ctx.source === 'gatherer' ? gathererQueueRow(row, skipped) : scryfallQueueRow(row, skipped);
    if (!queued) continue;
    counts = addImageImportOutput(counts, await ingestRemoteRow(db, queued, {
      imageSource: ctx.source,
      cleanupJpg:  !!ctx.cleanupJpg,
      force:       !!ctx.force,
    }));
  }
  return addImageImportOutput(counts, {
    placeholder: skipped.placeholder,
    missingId:   skipped.missingId,
    missingUrl:  skipped.missingUrl,
  });
}

const definition = createDefinition(magicImageImportSingleTaskType, {
  version:     '2026-09-09:v1',
  effectModel: 'reconcilable',
})
  .scope(z.object({}), {
    type:    magicImageImportSingleTaskType,
    resolve: () => ({ key: 'global', snapshot: {} }),
  })
  .input(input)
  .output(imageImportOutput)
  .context({ init: values => values })
  .stage('import', { label: '卡图单条导入', progressMode: 'simple' })
  .handler(({ ctx }) => runSingle(ctx))
  .build();

export const magicImageImportSingleTaskDefinition = definition;
