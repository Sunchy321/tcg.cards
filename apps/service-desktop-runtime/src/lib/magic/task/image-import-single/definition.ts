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
import { probeImageImport } from '../../image-import/probe';
import { emptyRemoteSkipped, gathererQueueRow, preferGathererQueueRow, scryfallQueueRow, type RemoteSkipped } from '../../image-import/source';

/** Single-target import: one or more prints, uploaded as a file or downloaded by number. */
export const magicImageImportSingleTaskType = 'magic_image_import_single';

const input = z.strictObject({
  source:     z.enum([...uploadImageSources, 'scryfall', 'gatherer', 'prefer_gatherer']),
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
  printStatus:         Print.imageStatus,
  scryfallImageStatus: ScryfallCard.imageStatus,
  scryfallImageUris:   ScryfallCard.imageUris,
  scryfallCardFaces:   ScryfallCard.cardFaces,
  multiverseId:        Print.multiverseId,
  gathererData:        Gatherer.data,
};

/** One work unit: a print row identified by its primary key. `set` must ride along — one card shares its number and language across many sets. */
interface SingleRowKey {
  cardId:  string;
  version: string;
  set:     string;
  source:  string;
  lang:    string;
  number:  string;
}

/** Checkpointable state of one single-import stage: the row list plus the upload payload. */
interface SingleImportState extends ImportBatchState<SingleRowKey> {
  data:          string | null;
  faceIndex:     number | null;
  remoteSkipped: RemoteSkipped;
}

/** One block processes exactly one print row, so the progress bar counts the same unit as the batch import: images. */
const ROWS_PER_BLOCK = 1;

const definition = createDefinition(magicImageImportSingleTaskType, {
  version:     '2026-09-21:v2',
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
  .entry(async ({ ctx, checkpoint }) => {
    const restored = checkpoint?.blockInput as SingleImportState | undefined;
    if (restored) return { total: restored.items.length, blockInput: restored };

    const db = getLocalDb();
    const keys: SingleRowKey[] = await runWithDb(db, () => db.select({
      cardId:  Print.cardId,
      version: Print.version,
      set:     Print.set,
      source:  Print.source,
      lang:    Print.lang,
      number:  Print.number,
    }).from(Print).where(and(
      eq(Print.set, ctx.set),
      inArray(Print.lang, ctx.langs as typeof Print.$inferSelect.lang[]),
      inArray(Print.number, ctx.numbers),
      isNull(Print.deletedAt),
    )));

    // Requested numbers the scope matched no row for are reported, not processed.
    const counts = emptyImageImportOutput();
    const matched = new Set(keys.map(key => key.number));
    for (const number of ctx.numbers) {
      if (!matched.has(number)) {
        counts.unmatched += 1;
        pushCapped(counts.unmatchedNumbers, number);
      }
    }

    const state = createImportBatchState(keys, counts, {
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
    const checkpointState = checkpoint as (state: ImportBatchState<SingleRowKey>) => Promise<void>;
    const doneState = done as (state: ImportBatchState<SingleRowKey>) => BlockDone;
    return runImportBlock({
      state,
      batchSize: ROWS_PER_BLOCK,
      run:       async keys => {
        const db = getLocalDb();
        let counts: ImageImportOutput = emptyImageImportOutput();
        for (const key of keys) {
          // The full row is re-read at process time by its primary key so the
          // checkpointed state stays a small list of keys. `set` is part of
          // the key: one card shares its number and language across sets.
          const rowQuery = db.select(rowColumns).from(Print)
            .leftJoin(ScryfallCard, eq(Print.scryfallCardId, ScryfallCard.cardId))
            .leftJoin(Gatherer, sql`${Gatherer.multiverseId} = ${Print.multiverseId}[1]`)
            .where(and(
              eq(Print.cardId, key.cardId),
              eq(Print.version, key.version),
              eq(Print.set, key.set),
              eq(Print.source, key.source),
              eq(Print.lang, key.lang as typeof Print.$inferSelect.lang),
              eq(Print.number, key.number),
            ));
          const { sql: rowSqlText, params: rowSqlParams } = rowQuery.toSQL();
          const rowSqlInline = rowSqlParams.reduce(
            (acc: string, param, index) => acc.replace(`$${index + 1}`, param == null ? 'null' : typeof param === 'number' ? String(param) : `'${String(param).replaceAll('\'', '\'\'')}'`),
            rowSqlText,
          );
          const row = (await runWithDb(db, () => rowQuery))[0];
          const probeDb = await db.$client.unsafe('select current_database() as db, inet_server_port()::text as port, pg_postmaster_start_time()::text as pg_start');
          probeImageImport({
            kind:                'single-row-read',
            rowSql:              rowSqlInline,
            number:              row?.number,
            force:               state.force,
            printStatus:         JSON.stringify(row?.printStatus ?? null),
            scryfallImageStatus: JSON.stringify(row?.scryfallImageStatus ?? null),
            imageInfoNull:       row?.imageInfo == null,
            db:                  probeDb[0],
          });
          if (!row) continue;

          if (state.data != null) {
            const data = Buffer.from(state.data, 'base64');
            const { kept, skipped, skippedUpload, singleImageFaces } = applySkipRules([row], ctx.source, state.force, state.faceIndex ?? undefined);
            counts = addImageImportOutput(counts, { skipped, skippedUpload, warnings: singleImageFaces });
            for (const target of kept) {
              counts = addImageImportOutput(counts, await ingestUploadItem(db, { number: key.number, faceIndex: state.faceIndex ?? undefined, rows: [target] }, data, {
                imageSource: ctx.source,
                cleanupJpg:  state.cleanupJpg,
              }));
            }
            continue;
          }

          // Download sources: every face of the print, resolved by the source's own rules.
          // A print in the placeholder state has no real image anywhere —
          // never fetch a stand-in for it, unless the operator forced this
          // pass: force is the explicit way to override the placeholder.
          if (row.printStatus === 'placeholder' && !state.force) {
            counts = addImageImportOutput(counts, { markedPlaceholder: 1 });
            pushCapped(counts.markedNumbers, row.number);
            continue;
          }
          const queued = ctx.source === 'gatherer'
            ? gathererQueueRow(row, state.remoteSkipped)
            : ctx.source === 'prefer_gatherer'
              ? preferGathererQueueRow(row, state.remoteSkipped)
              : scryfallQueueRow(row, state.remoteSkipped);
          if (!queued) continue;
          counts = addImageImportOutput(counts, await ingestRemoteRow(db, queued, {
            imageSource: ctx.source,
            cleanupJpg:  state.cleanupJpg,
            force:       state.force,
          }));
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
