import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { runWithDb } from '@tcg-cards/db';
import { Print } from '@tcg-cards/db/schema/shared/magic/print';

import { createDefinition } from '#task/definition';
import { getLocalDb } from '../../../hearthstone/hsdata-local-db';
import { assessQuality, encodeWebp, writeCanonical } from '../../image-import/common';

/** Stable task type for the module-C manual image replace (single file or zip). */
export const magicManualImageReplaceTaskType = 'magic_manual_image_replace';

type Db = ReturnType<typeof getLocalDb>;

const input = z.strictObject({
  mode:       z.enum(['single', 'zip']),
  set:        z.string().min(1),
  lang:       z.string().min(1),
  // single mode
  number:     z.string().optional(),
  faceIndex:  z.number().int().min(0).max(15).optional(),
  fileName:   z.string().optional(),
  dataBase64: z.string().optional(),
  // zip mode
  zipBase64:  z.string().optional(),
}).refine(v => v.mode === 'single'
  ? (!!v.number && !!v.dataBase64 && !v.zipBase64)
  : (!!v.zipBase64 && !v.number && !v.dataBase64), {
  message: 'single 需要 number+dataBase64;zip 需要 zipBase64',
});

const output = z.strictObject({
  items:       z.number(),
  written:     z.number(),
  unchanged:   z.number(),
  failed:      z.number(),
  updatedRows: z.number(),
});

type Output = z.infer<typeof output>;
const emptyCounts: Output = { items: 0, written: 0, unchanged: 0, failed: 0, updatedRows: 0 };

interface QueueItem {
  number:    string;
  faceIndex: number | undefined;
  ext:       string;
  data:      Buffer;
}

interface BlockState {
  items:  QueueItem[];
  offset: number;
  counts: Output;
}

const BATCH = 10;

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp']);

function addCounts(a: Output, b: Output): Output {
  return {
    items:       a.items + b.items, written:     a.written + b.written,
    unchanged:   a.unchanged + b.unchanged, failed:      a.failed + b.failed,
    updatedRows: a.updatedRows + b.updatedRows,
  };
}

function parseZipEntryName(name: string): { number: string, faceIndex?: number, ext: string } | null {
  const base = name.split('/').pop() ?? name;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return null;
  const ext = base.slice(dot + 1).toLowerCase();
  if (!IMAGE_EXT.has(ext)) return null;
  const stem = base.slice(0, dot);
  const m = /^(.+)-(\d+)$/.exec(stem);
  if (m) return { number: m[1]!, faceIndex: Number(m[2]), ext };
  return { number: stem, ext };
}

function unzipToDir(zipPath: string, dest: string): boolean {
  const r = spawnSync('unzip', ['-o', '-q', zipPath, '-d', dest], { encoding: 'utf8' });
  return r.status === 0;
}

function collectZipItems(zipBase64: string): QueueItem[] {
  const zipBuf = Buffer.from(zipBase64, 'base64');
  const work = mkdtempSync(join(tmpdir(), 'magic-img-c-'));
  const zipPath = join(work, 'input.zip');
  const outDir = join(work, 'out');
  writeFileSync(zipPath, zipBuf);
  const items: QueueItem[] = [];
  try {
    if (!unzipToDir(zipPath, outDir)) return items;
    for (const entry of readdirSync(outDir, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const name = entry.name;
      if (name.startsWith('._') || name.includes('__MACOSX')) continue;
      const parsed = parseZipEntryName(name);
      if (!parsed) continue;
      const parent = (entry as { parentPath?: string }).parentPath;
      const p = parent ? join(parent, name) : join(outDir, entry.name);
      if (!existsSync(p)) continue;
      items.push({ number: parsed.number, faceIndex: parsed.faceIndex, ext: parsed.ext, data: readFileSync(p) });
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return items;
}

async function processItem(db: Db, item: QueueItem, set: string, lang: string): Promise<Partial<Output>> {
  const enc = await encodeWebp(item.data);

  if (!enc) {
    return { failed: 1 };
  }

  const tier = await assessQuality(enc, item.data);
  const res = writeCanonical(set, lang, item.number, item.faceIndex, enc);
  if (res === 'error') return { failed: 1 };
  const result = await db.update(Print).set({
    imageType:         'webp',
    imageSource:       'manual',
    imageStatus:       tier.status,
    imageSha256:       enc.sha256,
    imageWidth:        enc.width,
    imageHeight:       enc.height,
    imageByteSize:     enc.byteSize,
    imageQualityScore: tier.score,
    imageVerifiedAt:   new Date(),
  }).where(and(
    eq(Print.set, set),
    eq(Print.lang, lang as typeof Print.$inferSelect.lang),
    eq(Print.number, item.number),
  )).returning({ cardId: Print.cardId });
  return {
    written:     res === 'written' ? 1 : 0,
    unchanged:   res === 'unchanged' ? 1 : 0,
    updatedRows: result.length,
  };
}

const definition = createDefinition(magicManualImageReplaceTaskType, {
  version:     '2026-09-05:v1',
  effectModel: 'reconcilable',
})
  .scope(z.object({}), {
    type:    'magic_manual_image_replace',
    resolve: () => ({ key: 'global', snapshot: {} }),
  })
  .input(input)
  .output(output)
  .context({ init: values => values })
  .stage('replace', { label: '手动替换卡图', progressMode: 'bounded', resumeMode: 'durable' })
  .entry(async ({ ctx, checkpoint }) => {
    const restored = checkpoint?.blockInput as BlockState | undefined;
    if (restored) return { total: restored.items.length, blockInput: restored };
    let items: QueueItem[];
    if (ctx.mode === 'single') {
      const ext = (ctx.fileName?.split('.').pop() ?? 'png').toLowerCase();
      items = [{
        number:    ctx.number!,
        faceIndex: ctx.faceIndex,
        ext:       IMAGE_EXT.has(ext) ? ext : 'png',
        data:      Buffer.from(ctx.dataBase64!, 'base64'),
      }];
    } else {
      items = collectZipItems(ctx.zipBase64!);
    }
    const state: BlockState = { items, offset: 0, counts: emptyCounts };
    return { total: items.length, blockInput: state };
  })
  .block(async ({ blockInput, ctx, checkpoint, progress, done, signal }) => {
    const state = blockInput as BlockState;
    if (state.offset >= state.items.length) return done(state);
    const batch = state.items.slice(state.offset, state.offset + BATCH);
    const db = getLocalDb();
    const counts = await runWithDb(db, async () => {
      let acc = emptyCounts;
      for (const item of batch) {
        if (signal?.aborted) break;
        const r = await processItem(db, item, ctx.set, ctx.lang);
        acc = addCounts(acc, { ...emptyCounts, items: 1, ...r });
      }
      return acc;
    });
    state.counts = addCounts(state.counts, counts);
    state.offset += batch.length;
    await checkpoint(state);
    progress({ done: state.offset, total: state.items.length });
    if (state.offset >= state.items.length) return done(state);
    return state;
  })
  .exit(({ blockInput }) => (blockInput as BlockState).counts)
  .build();

export const magicManualImageReplaceTaskDefinition = definition;
