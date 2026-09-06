import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { runWithDb } from '@tcg-cards/db';
import { Print } from '@tcg-cards/db/schema/shared/magic/print';

import { createDefinition } from '#task/definition';
import { getLocalDb } from '../../../hearthstone/hsdata-local-db';
import { assessQuality, encodeWebp, faceIndexOf, mapWithConcurrency, removeSameStemJpg, writeCanonical } from '../../image-import/common';

/** Stable task type for the module-B Gatherer image crawl (by set only). */
export const magicGathererImageImportTaskType = 'magic_gatherer_image_import';

type Db = ReturnType<typeof getLocalDb>;

const input = z.strictObject({
  set:        z.string().min(1),
  lang:       z.string().optional(),
  force:      z.boolean().optional().default(false),
  cleanupJpg: z.boolean().optional().default(false),
});

const output = z.strictObject({
  processed:  z.number(),
  written:    z.number(),
  unchanged:  z.number(),
  failed:     z.number(),
  missingId:  z.number(),
  lowQuality: z.number(),
  cleanedJpg: z.number(),
});

type Output = z.infer<typeof output>;
const emptyCounts: Output = { processed: 0, written: 0, unchanged: 0, failed: 0, missingId: 0, lowQuality: 0, cleanedJpg: 0 };

interface QueueRow {
  cardId: string; version: string; set: string; number: string;
  lang: string; source: string;
  multiverseId: number | null;
  faceIndex:    number | undefined;
}

interface BlockState {
  rows:       QueueRow[];
  offset:     number;
  counts:     Output;
  cleanupJpg: boolean;
}

const BATCH = 24;

function addCounts(a: Output, b: Output): Output {
  return {
    processed:  a.processed + b.processed,
    written:    a.written + b.written,
    unchanged:  a.unchanged + b.unchanged,
    failed:     a.failed + b.failed,
    missingId:  a.missingId + b.missingId,
    lowQuality: a.lowQuality + b.lowQuality,
    cleanedJpg: a.cleanedJpg + b.cleanedJpg,
  };
}

function gathererUrl(multiverseId: number): string {
  return `https://gatherer.wizards.com/Handlers/Image.ashx?multiverseid=${multiverseId}&type=card`;
}

async function processRow(db: Db, row: QueueRow, cleanupJpg: boolean): Promise<Output> {
  const out = { ...emptyCounts, processed: 1 };

  if (row.multiverseId == null) {
    out.missingId = 1;
    return out;
  }

  let source: Buffer | null;
  try {
    const res = await fetch(gathererUrl(row.multiverseId), { signal: AbortSignal.timeout(60_000), headers: { 'user-agent': 'tcg-cards/desktop' } });

    if (!res.ok) {
      out.failed = 1;
      return out;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    source = buf.length > 0 ? buf : null;

    if (!source) {
      out.failed = 1;
      return out;
    }
  } catch {
    out.failed = 1;
    return out;
  }
  const enc = await encodeWebp(source);

  if (!enc) {
    out.failed = 1;
    return out;
  }

  const tier = await assessQuality(enc, source);
  if (tier.score != null && tier.status === 'lowres') out.lowQuality = 1;
  const res = writeCanonical(row.set, row.lang, row.number, row.faceIndex, enc);

  if (res === 'error') {
    out.failed = 1;
    return out;
  }

  if (res === 'written') out.written = 1;
  if (res === 'unchanged') out.unchanged = 1;

  if (cleanupJpg && removeSameStemJpg(row.set, row.lang, row.number, row.faceIndex)) out.cleanedJpg = 1;
  await db.update(Print).set({
    imageType:         'webp',
    imageSource:       'gatherer',
    imageStatus:       tier.status,
    imageSha256:       enc.sha256,
    imageWidth:        enc.width,
    imageHeight:       enc.height,
    imageByteSize:     enc.byteSize,
    imageQualityScore: tier.score,
    imageVerifiedAt:   new Date(),
  }).where(and(
    eq(Print.cardId, row.cardId),
    eq(Print.version, row.version),
    eq(Print.set, row.set),
    eq(Print.number, row.number),
    eq(Print.lang, row.lang as typeof Print.$inferSelect.lang),
    eq(Print.source, row.source),
  ));
  return out;
}

const definition = createDefinition(magicGathererImageImportTaskType, {
  version:     '2026-09-05:v1',
  effectModel: 'reconcilable',
})
  .scope(z.object({}), {
    type:    'magic_gatherer_image_import',
    resolve: () => ({ key: 'global', snapshot: {} }),
  })
  .input(input)
  .output(output)
  .context({ init: values => values })
  .stage('crawl', { label: 'Gatherer 卡图爬取', progressMode: 'bounded', resumeMode: 'durable' })
  .entry(async ({ ctx, checkpoint }) => {
    const restored = checkpoint?.blockInput as BlockState | undefined;
    if (restored) return { total: restored.rows.length, blockInput: restored };
    const db = getLocalDb();
    const rows = await runWithDb(db, () => db.select({
      cardId:       Print.cardId, version:      Print.version, set:          Print.set, number:       Print.number,
      lang:         Print.lang, source:       Print.source, scryfallFace: Print.scryfallFace,
      multiverseId: Print.multiverseId,
    }).from(Print).where(and(
      eq(Print.set, ctx.set),
      ctx.lang ? sql`${Print.lang} = ${ctx.lang}` : undefined,
      ctx.force ? undefined : sql`${Print.imageSource} is null`,
      sql`${Print.imageSource} is distinct from 'manual'`,
    )));
    const queue: QueueRow[] = rows.map(r => ({
      cardId:       r.cardId, version:      r.version, set:          r.set, number:       r.number,
      lang:         r.lang, source:       r.source,
      multiverseId: (r.multiverseId?.[0] as number | undefined) ?? null,
      faceIndex:    faceIndexOf(r.scryfallFace),
    }));
    const state: BlockState = { rows: queue, offset: 0, counts: emptyCounts, cleanupJpg: !!ctx.cleanupJpg };
    return { total: queue.length, blockInput: state };
  })
  .block(async ({ blockInput, checkpoint, progress, done, signal }) => {
    const state = blockInput as BlockState;
    if (state.offset >= state.rows.length) return done(state);
    const batch = state.rows.slice(state.offset, state.offset + BATCH);
    try {
      const db = getLocalDb();
      const counts = await runWithDb(db, async () => {
        const results = await mapWithConcurrency(
          batch,
          4,
          row => processRow(db, row, state.cleanupJpg),
          () => signal?.aborted ?? false,
        );
        return results.reduce(addCounts, emptyCounts);
      });
      state.counts = addCounts(state.counts, counts);
      state.offset += batch.length;
      await checkpoint(state);
      progress({ done: state.offset, total: state.rows.length });
      if (state.offset >= state.rows.length) return done(state);
      return state;
    } finally {
      // in-memory only: nothing to clean up
    }
  })
  .exit(({ blockInput }) => (blockInput as BlockState).counts)
  .build();

export const magicGathererImageImportTaskDefinition = definition;
