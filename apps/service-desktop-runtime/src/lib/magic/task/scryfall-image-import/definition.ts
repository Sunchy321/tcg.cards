import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { runWithDb } from '@tcg-cards/db';
import { ScryfallCard } from '@tcg-cards/db/schema/local/magic';
import { Print } from '@tcg-cards/db/schema/shared/magic/print';
import type { ImageInfo, ImageStatus } from '#model/magic/schema/print';

import { createDefinition } from '#task/definition';
import { getLocalDb } from '../../../hearthstone/hsdata-local-db';
import { assessQuality, encodeWebp, faceIndexOf, importablePrintCondition, mapWithConcurrency, removeSameStemJpg, writeCanonical } from '../../image-import/common';

/** Stable task type for the module-A Scryfall image import (png -> webp q50). */
export const magicScryfallImageImportTaskType = 'magic_scryfall_image_import';

type Db = ReturnType<typeof getLocalDb>;

const input = z.strictObject({
  scope:      z.enum(['full', 'set']),
  set:        z.string().optional(),
  lang:       z.string().optional(),
  force:      z.boolean().optional().default(false),
  cleanupJpg: z.boolean().optional().default(false),
}).refine(v => v.scope === 'full' || !!v.set, { message: 'set is required when scope=set' });

const output = z.strictObject({
  processed:   z.number(),
  written:     z.number(),
  unchanged:   z.number(),
  failed:      z.number(),
  missingUrl:  z.number(),
  placeholder: z.number(),
  lowQuality:  z.number(),
  cleanedJpg:  z.number(),
});

type Output = z.infer<typeof output>;
const emptyCounts: Output = { processed: 0, written: 0, unchanged: 0, failed: 0, missingUrl: 0, placeholder: 0, lowQuality: 0, cleanedJpg: 0 };

interface QueueFace {
  faceIndex: number;
  url:       string | null;
}

interface QueueRow {
  cardId: string; version: string; set: string; number: string;
  lang: string; source: string;
  /** Download target per face (array index = face index). */
  faces:     QueueFace[];
  imageInfo: ImageInfo;
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
    processed:   a.processed + b.processed,
    written:     a.written + b.written,
    unchanged:   a.unchanged + b.unchanged,
    failed:      a.failed + b.failed,
    missingUrl:  a.missingUrl + b.missingUrl,
    placeholder: a.placeholder + b.placeholder,
    lowQuality:  a.lowQuality + b.lowQuality,
    cleanedJpg:  a.cleanedJpg + b.cleanedJpg,
  };
}

async function fetchToBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { 'user-agent': 'tcg-cards/desktop' } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

/** Picks the preferred download url of one scryfall face uris map. */
function faceUrl(uris: Record<string, string> | null | undefined): string | null {
  return uris?.['png'] ?? uris?.['large'] ?? null;
}

async function processRow(db: Db, row: QueueRow, cleanupJpg: boolean): Promise<Output> {
  const out = { ...emptyCounts, processed: 1 };

  // One import pass per face; the row update happens once with the merged
  // image_info array, and the column snapshot tracks the primary (face 0).
  const infos: ImageInfo = [...(row.imageInfo ?? [])];
  let written = 0;
  let unchanged = 0;
  let failed = 0;
  let missingUrl = 0;
  let lowQuality = 0;
  let face0Status: ImageStatus | null = null;
  let face0Imported = false;

  for (const face of row.faces) {
    const i = face.faceIndex;
    const url = face.url;
    if (!url) {
      missingUrl += 1;
      continue;
    }
    const source = await fetchToBuffer(url);
    if (!source) {
      failed += 1;
      continue;
    }
    const enc = await encodeWebp(source);
    if (!enc) {
      failed += 1;
      continue;
    }
    const tier = await assessQuality(enc, source);
    if (tier.score != null && tier.status === 'lowres') lowQuality += 1;
    const res = writeCanonical(row.set, row.lang, row.number, i, enc);
    if (res === 'error') {
      failed += 1;
      continue;
    }
    if (res === 'written') written += 1;
    if (res === 'unchanged') unchanged += 1;
    if (i === 0 && cleanupJpg && removeSameStemJpg(row.set, row.lang, row.number, undefined)) out.cleanedJpg += 1;

    infos[i] = {
      status:       tier.status,
      type:         'webp',
      source:       'scryfall',
      sha256:       enc.sha256,
      width:        enc.width,
      height:       enc.height,
      byteSize:     enc.byteSize,
      qualityScore: tier.score,
      verifiedAt:   new Date(),
    };
    if (i === 0) {
      face0Status = tier.status;
      face0Imported = true;
    }
  }

  out.written = written;
  out.unchanged = unchanged;
  out.failed = failed;
  out.missingUrl = missingUrl;
  out.lowQuality = lowQuality;

  if (written + unchanged === 0) return out;

  const patch: Partial<typeof Print.$inferInsert> = { imageInfo: infos };

  if (face0Imported && face0Status != null) {
    patch.imageStatus = face0Status;
  }

  await db.update(Print).set(patch).where(and(
    eq(Print.cardId, row.cardId),
    eq(Print.version, row.version),
    eq(Print.set, row.set),
    eq(Print.number, row.number),
    eq(Print.lang, row.lang as typeof Print.$inferSelect.lang),
    eq(Print.source, row.source),
  ));
  return out;
}

const definition = createDefinition(magicScryfallImageImportTaskType, {
  version:     '2026-09-07:v2',
  effectModel: 'reconcilable',
})
  .scope(z.object({}), {
    type:    'magic_scryfall_image_import',
    resolve: () => ({ key: 'global', snapshot: {} }),
  })
  .input(input)
  .output(output)
  .context({ init: values => values })
  .stage('import', { label: 'Scryfall 卡图导入', progressMode: 'bounded', resumeMode: 'durable' })
  .entry(async ({ ctx, checkpoint }) => {
    const restored = checkpoint?.blockInput as BlockState | undefined;
    if (restored) return { total: restored.rows.length, blockInput: restored };
    const db = getLocalDb();
    const rows = await runWithDb(db, () => db.select({
      cardId:              Print.cardId, version:             Print.version, set:                 Print.set, number:              Print.number,
      lang:                Print.lang, source:              Print.source, scryfallFace:        Print.scryfallFace,
      imageInfo:           Print.imageInfo,
      scryfallImageStatus: ScryfallCard.imageStatus,
      scryfallImageUris:   ScryfallCard.imageUris,
      scryfallCardFaces:   ScryfallCard.cardFaces,
    }).from(Print).leftJoin(ScryfallCard, eq(Print.scryfallCardId, ScryfallCard.cardId)).where(and(
      ctx.scope === 'set' ? eq(Print.set, ctx.set!) : undefined,
      ctx.lang ? sql`${Print.lang} = ${ctx.lang}` : undefined,
      importablePrintCondition(!!ctx.force),
    )));

    // Placeholder art (unprinted/digital-only cards) would import as generic
    // card backs; keep it out of the queue regardless of the force mode.
    const queue: QueueRow[] = [];
    let placeholder = 0;
    for (const r of rows) {
      if (r.scryfallImageStatus === 'placeholder') {
        placeholder += 1;
        continue;
      }
      // Face-level uris: multi-face cards carry them in card_faces, single-face
      // cards at the top level.
      const rawFaces = (r.scryfallCardFaces ?? []) as Array<{ image_uris?: Record<string, string> | null }>;
      const faceUris = rawFaces.length > 0
        ? rawFaces.map(f => f.image_uris ?? null)
        : [r.scryfallImageUris];
      // Reversible-style rows are pinned to one face of their scryfall card.
      const pinned = faceIndexOf(r.scryfallFace);
      const allFaces: QueueFace[] = faceUris.map((uris, i) => ({ faceIndex: i, url: faceUrl(uris) }));
      queue.push({
        cardId:    r.cardId, version:   r.version, set:       r.set, number:    r.number,
        lang:      r.lang, source:    r.source,
        faces:     pinned == null ? allFaces : allFaces.filter(f => f.faceIndex === pinned),
        imageInfo: r.imageInfo ?? [],
      });
    }
    const state: BlockState = { rows: queue, offset: 0, counts: { ...emptyCounts, placeholder }, cleanupJpg: !!ctx.cleanupJpg };
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

export const magicScryfallImageImportTaskDefinition = definition;
