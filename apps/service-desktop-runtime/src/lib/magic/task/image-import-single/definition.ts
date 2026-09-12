import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
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

/** Single-target import: one or more prints, uploaded as a file or downloaded by number. */
export const magicImageImportSingleTaskType = 'magic_image_import_single';

const input = z.strictObject({
  source:     z.enum([...uploadImageSources, 'scryfall', 'gatherer']),
  set:        z.string().min(1),
  lang:       z.string().min(1),
  numbers:    z.array(z.string().min(1)).min(1),
  force:      z.boolean().optional().default(false),
  cleanupJpg: z.boolean().optional().default(false),
  // Upload single image only.
  faceIndex:  z.number().int().min(0).max(15).optional(),
  fileName:   z.string().optional(),
  dataBase64: z.string().optional(),
}).refine(v => {
  const isUpload = (uploadImageSources as readonly string[]).includes(v.source);
  // One uploaded file belongs to one print, so an upload carries exactly one number.
  if (v.dataBase64 != null) return isUpload && v.numbers.length === 1;
  // Download sources derive the face index from scryfall_face, never from the caller.
  return !isUpload && v.faceIndex == null;
}, { message: '上传单张需要 dataBase64 与单个编号;下载来源不接受 faceIndex' });

type Input = z.infer<typeof input>;

const rowColumns = {
  cardId:              Print.cardId,
  version:             Print.version,
  set:                 Print.set,
  lang:                Print.lang,
  number:              Print.number,
  source:              Print.source,
  layout:              Print.layout,
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
      inArray(Print.number, ctx.numbers),
      isNull(Print.deletedAt),
    )));

  // One requested number stands for every print carrying it; a number the set
  // does not have is reported instead of written.
  const rowsByNumber = new Map<string, typeof rows>();
  for (const row of rows) {
    const bucket = rowsByNumber.get(row.number);
    if (bucket) bucket.push(row);
    else rowsByNumber.set(row.number, [row]);
  }

  const data = ctx.dataBase64 != null ? Buffer.from(ctx.dataBase64, 'base64') : null;
  const remoteSkipped = emptyRemoteSkipped();
  let counts: ImageImportOutput = emptyImageImportOutput();

  for (const number of ctx.numbers) {
    const matched = rowsByNumber.get(number) ?? [];
    if (matched.length === 0) {
      counts.unmatched += 1;
      pushCapped(counts.unmatchedNumbers, number);
      continue;
    }

    if (data != null) {
      const { kept, skipped, skippedUpload, singleImageFaces } = applySkipRules(matched, ctx.source, !!ctx.force, ctx.faceIndex);
      counts = addImageImportOutput(counts, { skipped, skippedUpload, warnings: singleImageFaces });
      for (const target of kept) {
        counts = addImageImportOutput(counts, await ingestUploadItem(db, { number, faceIndex: ctx.faceIndex, rows: [target] }, data, {
          imageSource: ctx.source,
          cleanupJpg:  !!ctx.cleanupJpg,
        }));
      }
      continue;
    }

    // Download sources: every face of the print, resolved by the source's own rules.
    for (const row of matched) {
      const queued = ctx.source === 'gatherer' ? gathererQueueRow(row, remoteSkipped) : scryfallQueueRow(row, remoteSkipped);
      if (!queued) continue;
      counts = addImageImportOutput(counts, await ingestRemoteRow(db, queued, {
        imageSource: ctx.source,
        cleanupJpg:  !!ctx.cleanupJpg,
        force:       !!ctx.force,
      }));
    }
  }

  return addImageImportOutput(counts, {
    placeholder: remoteSkipped.placeholder,
    missingId:   remoteSkipped.missingId,
    missingUrl:  remoteSkipped.missingUrl,
  });
}

const definition = createDefinition(magicImageImportSingleTaskType, {
  version:     '2026-09-12:v1',
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
