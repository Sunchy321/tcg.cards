import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { runWithDb } from '@tcg-cards/db';
import { Gatherer, ScryfallCard } from '@tcg-cards/db/schema/local/magic';
import { Print } from '@tcg-cards/db/schema/shared/magic/print';

import { createDefinition } from '#task/definition';
import { getLocalDb } from '../../../hearthstone/hsdata-local-db';
import { createImportBatchState, emptyImageImportOutput, runImportBlock, type ImportBatchState } from '../../image-import/batch';
import { importablePrintCondition, mapWithConcurrency } from '../../image-import/common';
import { ingestRemoteRow } from '../../image-import/ingest';
import { addImageImportOutput, imageImportOutput } from '../../image-import/result';
import { emptyRemoteSkipped, gathererQueueRow, remoteExpectedFaces, scryfallQueueRow, type RemoteQueueRow } from '../../image-import/source';

/** Remote batch sweep: downloads every importable print of one source (scryfall/gatherer). */
export const magicImageImportRemoteTaskType = 'magic_image_import_remote';

const input = z.strictObject({
  source:     z.enum(['scryfall', 'gatherer']),
  scope:      z.enum(['full', 'set']),
  set:        z.string().optional(),
  lang:       z.string().optional(),
  force:      z.boolean().optional().default(false),
  cleanupJpg: z.boolean().optional().default(false),
}).refine(
  v => v.source === 'gatherer'
    ? v.scope === 'set' && !!v.set
    : v.scope === 'full' || !!v.set,
  { message: 'scope=set 需要 set;gatherer 只支持 scope=set' },
);

const BATCH = 24;
const CONCURRENCY = 4;

const definition = createDefinition(magicImageImportRemoteTaskType, {
  version:     '2026-09-09:v1',
  effectModel: 'reconcilable',
})
  .scope(z.object({}), {
    type:    magicImageImportRemoteTaskType,
    resolve: () => ({ key: 'global', snapshot: {} }),
  })
  .input(input)
  .output(imageImportOutput)
  .context({ init: values => values })
  .stage('import', { label: '卡图批量导入', progressMode: 'bounded', resumeMode: 'durable' })
  .entry(async ({ ctx, checkpoint }) => {
    const restored = checkpoint?.blockInput as ImportBatchState<RemoteQueueRow> | undefined;
    if (restored) return { total: restored.items.length, blockInput: restored };

    const db = getLocalDb();
    const skipped = emptyRemoteSkipped();
    const where = (extra: ReturnType<typeof eq> | undefined) => and(
      extra,
      ctx.lang ? sql`${Print.lang} = ${ctx.lang}` : undefined,
      importablePrintCondition(!!ctx.force, remoteExpectedFaces(ctx.source)),
    );

    const queue: RemoteQueueRow[] = [];
    if (ctx.source === 'scryfall') {
      const rows = await runWithDb(db, () => db.select({
        cardId:              Print.cardId,
        version:             Print.version,
        set:                 Print.set,
        number:              Print.number,
        lang:                Print.lang,
        source:              Print.source,
        scryfallFace:        Print.scryfallFace,
        imageInfo:           Print.imageInfo,
        scryfallImageStatus: ScryfallCard.imageStatus,
        scryfallImageUris:   ScryfallCard.imageUris,
        scryfallCardFaces:   ScryfallCard.cardFaces,
      }).from(Print)
        .leftJoin(ScryfallCard, eq(Print.scryfallCardId, ScryfallCard.cardId))
        .where(where(ctx.scope === 'set' ? eq(Print.set, ctx.set!) : undefined)));
      for (const row of rows) {
        const queued = scryfallQueueRow(row, skipped);
        if (queued) queue.push(queued);
      }
    } else {
      const rows = await runWithDb(db, () => db.select({
        cardId:       Print.cardId,
        version:      Print.version,
        set:          Print.set,
        number:       Print.number,
        lang:         Print.lang,
        source:       Print.source,
        scryfallFace: Print.scryfallFace,
        imageInfo:    Print.imageInfo,
        multiverseId: Print.multiverseId,
        gathererData: Gatherer.data,
      }).from(Print)
        .leftJoin(Gatherer, sql`${Gatherer.multiverseId} = ${Print.multiverseId}[1]`)
        .where(where(ctx.scope === 'set' ? eq(Print.set, ctx.set!) : undefined)));
      for (const row of rows) {
        const queued = gathererQueueRow(row, skipped);
        if (queued) queue.push(queued);
      }
    }

    const counts = addImageImportOutput(emptyImageImportOutput(), {
      placeholder: skipped.placeholder,
      missingId:   skipped.missingId,
      missingUrl:  skipped.missingUrl,
    });
    const state = createImportBatchState(queue, counts, { cleanupJpg: !!ctx.cleanupJpg, force: !!ctx.force });
    return { total: queue.length, blockInput: state };
  })
  .block(async ({ ctx, blockInput, checkpoint, progress, done, signal }) => {
    return runImportBlock({
      state:     blockInput as ImportBatchState<RemoteQueueRow>,
      batchSize: BATCH,
      run:       async (batch, sig) => {
        const db = getLocalDb();
        const results = await mapWithConcurrency(
          batch,
          CONCURRENCY,
          row => ingestRemoteRow(db, row, { imageSource: ctx.source, cleanupJpg: !!ctx.cleanupJpg, force: !!ctx.force }),
          () => sig?.aborted ?? false,
        );
        return results.reduce(addImageImportOutput, emptyImageImportOutput());
      },
      progress,
      checkpoint,
      done,
      signal,
    });
  })
  .exit(({ blockInput }) => (blockInput as ImportBatchState<RemoteQueueRow>).counts)
  .build();

export const magicImageImportRemoteTaskDefinition = definition;
