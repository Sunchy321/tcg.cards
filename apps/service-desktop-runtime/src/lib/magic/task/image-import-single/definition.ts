import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { runWithDb } from '@tcg-cards/db';
import { Gatherer, ScryfallCard } from '@tcg-cards/db/schema/local/magic';
import { Print } from '@tcg-cards/db/schema/shared/magic/print';

import { createDefinition, type BlockDone } from '#task/definition';
import { getLocalDb } from '../../../hearthstone/hsdata-local-db';
import { uploadImageSources } from '../../image-import/common';
import { createImportBatchState, runImportBlock, type ImportBatchState } from '../../image-import/batch';
import { applySkipRules, ingestRemoteRow, ingestUploadItem } from '../../image-import/ingest';
import { addImageImportOutput, emptyImageImportOutput, imageImportOutput, pushCapped, type ImageImportOutput } from '../../image-import/result';
import { emptyRemoteSkipped, gathererQueueRow, scryfallQueueRow, type RemoteSkipped } from '../../image-import/source';

/** Single-target import: one or more prints, uploaded as a file or downloaded by number. */
export const magicImageImportSingleTaskType = 'magic_image_import_single';

const input = z.strictObject({
  source:     z.enum([...uploadImageSources, 'scryfall', 'gatherer']),
  set:        z.string().min(1),
  langs:      z.array(z.string()).min(1),
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

/** Checkpointable state of one single-import stage: the number list plus the upload payload. */
interface SingleImportState extends ImportBatchState<string> {
  data:          string | null;
  faceIndex:     number | null;
  remoteSkipped: RemoteSkipped;
}

/** One block processes exactly one number, so the progress bar advances per number. */
const NUMBERS_PER_BLOCK = 1;

const definition = createDefinition(magicImageImportSingleTaskType, {
  version:     '2026-09-16:v2',
  effectModel: 'reconcilable',
})
  .scope(z.object({}), {
    type:    magicImageImportSingleTaskType,
    resolve: () => ({ key: 'global', snapshot: {} }),
  })
  .input(input)
  .output(imageImportOutput)
  .context({ init: values => values })
  .stage('import', { label: '卡图单条导入', progressMode: 'bounded' })
  .entry(({ ctx, checkpoint }) => {
    const restored = checkpoint?.blockInput as SingleImportState | undefined;
    if (restored) return { total: restored.items.length, blockInput: restored };

    const state = createImportBatchState([...ctx.numbers], emptyImageImportOutput(), {
      cleanupJpg: !!ctx.cleanupJpg,
      force:      !!ctx.force,
    }) as SingleImportState;
    state.data = ctx.dataBase64 ?? null;
    state.faceIndex = ctx.faceIndex ?? null;
    state.remoteSkipped = emptyRemoteSkipped();
    return { total: state.items.length, blockInput: state };
  })
  .block(async ({ ctx, blockInput, progress, checkpoint, done, signal }) => {
    const state = blockInput as SingleImportState;
    // The framework hands back callbacks typed for the declared block input; the
    // runtime state is always the fuller SingleImportState, so widen for the
    // shared batch runner.
    const checkpointState = checkpoint as (state: ImportBatchState<string>) => Promise<void>;
    const doneState = done as (state: ImportBatchState<string>) => BlockDone;
    return runImportBlock({
      state,
      batchSize: NUMBERS_PER_BLOCK,
      run:       async numbers => {
        const db = getLocalDb();
        // One requested number stands for every print carrying it; a number the
        // set does not have is reported instead of written. Rows are re-read per
        // block so the checkpointed state stays small.
        const rows = await runWithDb(db, () => db.select(rowColumns).from(Print)
          .leftJoin(ScryfallCard, eq(Print.scryfallCardId, ScryfallCard.cardId))
          .leftJoin(Gatherer, sql`${Gatherer.multiverseId} = ${Print.multiverseId}[1]`)
          .where(and(
            eq(Print.set, ctx.set),
            inArray(Print.lang, ctx.langs as typeof Print.$inferSelect.lang[]),
            inArray(Print.number, numbers),
            isNull(Print.deletedAt),
          )));
        const rowsByNumber = new Map<string, typeof rows>();
        for (const row of rows) {
          const bucket = rowsByNumber.get(row.number);
          if (bucket) bucket.push(row);
          else rowsByNumber.set(row.number, [row]);
        }

        let counts: ImageImportOutput = emptyImageImportOutput();
        for (const number of numbers) {
          const matched = rowsByNumber.get(number) ?? [];
          if (matched.length === 0) {
            counts.unmatched += 1;
            pushCapped(counts.unmatchedNumbers, number);
            continue;
          }

          if (state.data != null) {
            const data = Buffer.from(state.data, 'base64');
            const { kept, skipped, skippedUpload, singleImageFaces } = applySkipRules(matched, ctx.source, state.force, state.faceIndex ?? undefined);
            counts = addImageImportOutput(counts, { skipped, skippedUpload, warnings: singleImageFaces });
            for (const target of kept) {
              counts = addImageImportOutput(counts, await ingestUploadItem(db, { number, faceIndex: state.faceIndex ?? undefined, rows: [target] }, data, {
                imageSource: ctx.source,
                cleanupJpg:  state.cleanupJpg,
              }));
            }
            continue;
          }

          // Download sources: every face of the print, resolved by the source's own rules.
          for (const row of matched) {
            const queued = ctx.source === 'gatherer' ? gathererQueueRow(row, state.remoteSkipped) : scryfallQueueRow(row, state.remoteSkipped);
            if (!queued) continue;
            counts = addImageImportOutput(counts, await ingestRemoteRow(db, queued, {
              imageSource: ctx.source,
              cleanupJpg:  state.cleanupJpg,
              force:       state.force,
            }));
          }
        }
        return counts;
      },
      progress,
      checkpoint: checkpointState,
      done:       doneState,
      signal,
    }) as Promise<SingleImportState | BlockDone>;
  })
  .exit(({ blockInput }) => {
    const state = blockInput as SingleImportState;
    return addImageImportOutput(state.counts, {
      placeholder: state.remoteSkipped.placeholder,
      missingId:   state.remoteSkipped.missingId,
      missingUrl:  state.remoteSkipped.missingUrl,
    });
  })
  .build();

export const magicImageImportSingleTaskDefinition = definition;
