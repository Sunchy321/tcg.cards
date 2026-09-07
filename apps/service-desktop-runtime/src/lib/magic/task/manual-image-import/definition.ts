import { and, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { runWithDb } from '@tcg-cards/db';
import { ScryfallCard } from '@tcg-cards/db/schema/local/magic';
import { Print } from '@tcg-cards/db/schema/shared/magic/print';

import { createDefinition } from '#task/definition';
import { getLocalDb } from '../../../hearthstone/hsdata-local-db';
import { assessQuality, encodeWebp, faceIndexOf, uploadImageSources, writeCanonical } from '../../image-import/common';
import { chooseNamingPattern, numberCandidates, parseImageStem, stemOf } from '../../image-import/parse';
import { listZipImages, readZipImages } from '../../image-import/zip';

/** Stable task type for the manual per-target image import (uploads and download sources). */
export const magicManualImageImportTaskType = 'magic_manual_image_import';

type Db = ReturnType<typeof getLocalDb>;

const uploadSources = [...uploadImageSources] as const;
const downloadSources = ['scryfall', 'gatherer'] as const;

const input = z.strictObject({
  source: z.enum([...uploadSources, ...downloadSources]),
  set:    z.string().min(1),
  lang:   z.string().min(1),
  force:  z.boolean().optional().default(true),
  // upload single image
  number:     z.string().optional(),
  faceIndex:  z.number().int().min(0).max(15).optional(),
  fileName:   z.string().optional(),
  dataBase64: z.string().optional(),
  // upload zip archive
  zipPath:    z.string().optional(),
}).refine(v => {
  const isUpload = (uploadImageSources as readonly string[]).includes(v.source);
  if (v.zipPath != null) return isUpload && v.dataBase64 == null;
  if (v.dataBase64 != null) return isUpload && !!v.number;
  // download sources: the face index is derived from scryfall_face, not caller input
  return !isUpload && !!v.number && v.faceIndex == null;
}, { message: '上传 zip 需要 zipPath;上传单张需要 number+dataBase64;下载来源需要 number' });

const output = z.strictObject({
  processed:         z.number(),
  written:           z.number(),
  unchanged:         z.number(),
  failed:            z.number(),
  skipped:           z.number(),
  skippedUpload:     z.number(),
  placeholder:       z.number(),
  unmatched:         z.number(),
  unrecognized:      z.number(),
  lowQuality:        z.number(),
  unmatchedNumbers:  z.array(z.string()),
  unrecognizedNames: z.array(z.string()),
  warnings:          z.array(z.string()),
});

type Output = z.infer<typeof output>;
type MutableOutput = { -readonly [K in keyof Output]: Output[K] };
type OutputDelta = Partial<MutableOutput>;

const emptyCounts = (): MutableOutput => ({
  processed:         0,
  written:           0,
  unchanged:         0,
  failed:            0,
  skipped:           0,
  skippedUpload:     0,
  placeholder:       0,
  unmatched:         0,
  unrecognized:      0,
  lowQuality:        0,
  unmatchedNumbers:  [],
  unrecognizedNames: [],
  warnings:          [],
});

const numericCountKeys = ['processed', 'written', 'unchanged', 'failed', 'skipped', 'skippedUpload', 'placeholder', 'unmatched', 'unrecognized', 'lowQuality'] as const;
const listCountKeys = ['unmatchedNumbers', 'unrecognizedNames', 'warnings'] as const;

/** Upper bound per output list so huge archives cannot flood the task result. */
const maxListEntries = 50;

function addCounts(a: MutableOutput, b: OutputDelta): MutableOutput {
  const merged: MutableOutput = { ...a };
  for (const key of numericCountKeys) merged[key] = a[key] + (b[key] ?? 0);
  for (const key of listCountKeys) merged[key] = [...a[key], ...(b[key] ?? [])].slice(0, maxListEntries);
  return merged;
}

function pushCapped(list: string[], value: string): void {
  if (list.length < maxListEntries) list.push(value);
}

const rowColumns = {
  cardId:            Print.cardId,
  version:           Print.version,
  number:            Print.number,
  source:            Print.source,
  printName:         Print.name,
  scryfallFace:      Print.scryfallFace,
  scryfallImageUris: Print.scryfallImageUris,
  scryfallImageStatus: ScryfallCard.imageStatus,
  multiverseId:      Print.multiverseId,
};

function queryPrintRows(db: Db, where: SQL | undefined) {
  return db.select(rowColumns).from(Print).leftJoin(ScryfallCard, eq(Print.scryfallCardId, ScryfallCard.cardId)).where(where);
}

type SelectedRow = Awaited<ReturnType<typeof queryPrintRows>>[number];

/** Whether `rowSource` may be overwritten given the chosen import source and force mode. */
function mayOverwrite(rowSource: string, source: string, force: boolean): boolean {
  if ((uploadImageSources as readonly string[]).includes(rowSource)) {
    return (uploadImageSources as readonly string[]).includes(source) && force;
  }
  return force;
}

/** Splits matched rows into writable rows and skip counters per the force rules. */
function applySkipRules(rows: SelectedRow[], source: string, force: boolean, counts: MutableOutput): SelectedRow[] {
  const kept: SelectedRow[] = [];
  for (const row of rows) {
    if (mayOverwrite(row.source, source, force)) {
      kept.push(row);
    } else if ((uploadImageSources as readonly string[]).includes(row.source)) {
      counts.skippedUpload += 1;
    } else {
      counts.skipped += 1;
    }
  }
  return kept;
}

interface UploadItem {
  kind: 'upload';
  /** Collector number as written in the archive name (or the form input). */
  number:     string;
  faceIndex?: number;
  /** Archive card name, kept for the print-name mismatch warning. */
  name?:       string;
  /** Zip entry filename; absent for single uploads. */
  filename?:   string;
  /** Single-upload image payload. */
  dataBase64?: string;
  /** Non-skipped prints this item updates. */
  rows: SelectedRow[];
}

interface DownloadItem {
  kind: 'download';
  cardId:    string;
  version:   string;
  number:    string;
  source:    string;
  faceIndex?: number;
  url:          string | null;
  multiverseId: number | null;
}

type QueueItem = UploadItem | DownloadItem;

interface BlockState {
  items:  QueueItem[];
  offset: number;
  counts: MutableOutput;
}

const BATCH = 10;

async function buildUploadZipItems(db: Db, ctx: { source: string, set: string, lang: string, force: boolean, zipPath: string }, counts: MutableOutput): Promise<QueueItem[]> {
  const infos = await listZipImages(ctx.zipPath);
  const parsed = infos.flatMap(info => {
    const parsedName = parseImageStem(stemOf(info.filename));
    return parsedName == null ? [] : [{ info, parsedName }];
  });
  const convention = chooseNamingPattern(parsed.map(item => item.parsedName));
  if (convention == null) throw new Error('压缩包内文件命名约定无法识别,请整理文件名后重试');
  const selected = parsed.filter(item => item.parsedName.kind === convention);
  counts.unrecognized = infos.length - selected.length;
  for (const item of parsed) {
    if (item.parsedName.kind !== convention) pushCapped(counts.unrecognizedNames, item.info.filename);
  }

  const numbers = [...new Set(selected.flatMap(item => numberCandidates(item.parsedName.number)))];
  const rows = numbers.length === 0
    ? []
    : await runWithDb(db, () => queryPrintRows(db, and(
        eq(Print.set, ctx.set),
        eq(Print.lang, ctx.lang as typeof Print.$inferSelect.lang),
        isNull(Print.deletedAt),
        inArray(Print.number, numbers),
      )));
  const rowsByNumber = new Map<string, SelectedRow[]>();
  for (const row of rows) {
    const bucket = rowsByNumber.get(row.number) ?? [];
    bucket.push(row);
    rowsByNumber.set(row.number, bucket);
  }

  const items: QueueItem[] = [];
  for (const { info, parsedName } of selected) {
    const candidates = numberCandidates(parsedName.number);
    const matched = candidates.flatMap(number => rowsByNumber.get(number) ?? []);
    if (matched.length === 0) {
      counts.unmatched += 1;
      pushCapped(counts.unmatchedNumbers, parsedName.number);
      continue;
    }
    const keptRows = applySkipRules(matched, ctx.source, ctx.force, counts);
    if (keptRows.length === 0) continue;
    items.push({
      kind:      'upload',
      number:    parsedName.number,
      faceIndex: parsedName.faceIndex,
      name:      parsedName.name,
      filename:  info.filename,
      rows:      keptRows,
    });
  }
  return items;
}

async function buildDownloadItems(db: Db, ctx: { source: string, set: string, lang: string, force: boolean, number: string }, counts: MutableOutput): Promise<QueueItem[]> {
  const rows = await runWithDb(db, () => queryPrintRows(db, and(
    eq(Print.set, ctx.set),
    eq(Print.lang, ctx.lang as typeof Print.$inferSelect.lang),
    eq(Print.number, ctx.number),
    isNull(Print.deletedAt),
  )));
  if (rows.length === 0) {
    counts.unmatched = 1;
    pushCapped(counts.unmatchedNumbers, ctx.number);
    return [];
  }
  // Scryfall placeholder art (unprinted/digital-only cards) must not be downloaded.
  const downloadable = ctx.source === 'scryfall'
    ? rows.filter(row => {
      if (row.scryfallImageStatus === 'placeholder') {
        counts.placeholder += 1;
        return false;
      }
      return true;
    })
    : rows;
  const keptRows = applySkipRules(downloadable, ctx.source, ctx.force, counts);
  return keptRows.map(row => {
    const uris = (row.scryfallImageUris ?? []) as unknown as Record<string, string>[];
    return {
      kind:      'download',
      cardId:    row.cardId,
      version:   row.version,
      number:    row.number,
      source:    row.source,
      faceIndex: faceIndexOf(row.scryfallFace),
      url:          ctx.source === 'scryfall' ? (uris[0]?.['png'] ?? uris[0]?.['large'] ?? null) : null,
      multiverseId: ctx.source === 'gatherer' ? (row.multiverseId?.[0] as number | undefined ?? null) : null,
    } satisfies DownloadItem;
  });
}

async function processUploadItem(item: UploadItem, ctx: { source: string, set: string, lang: string }, data: Buffer | undefined, db: Db): Promise<OutputDelta> {
  if (data == null) return { processed: 1, failed: 1 };

  const enc = await encodeWebp(data);
  if (!enc) return { processed: 1, failed: 1 };

  const tier = await assessQuality(enc, data);
  const warnings: string[] = [];

  // One canonical file per distinct print number; every matched row is stamped
  // with the chosen source.
  const writtenNumbers = new Set<string>();
  let written = 0;
  let unchanged = 0;
  for (const row of item.rows) {
    if (!writtenNumbers.has(row.number)) {
      writtenNumbers.add(row.number);
      const res = writeCanonical(ctx.set, ctx.lang, row.number, item.faceIndex, enc);
      if (res === 'error') return { processed: 1, failed: 1 };
      if (res === 'written') written += 1;
      if (res === 'unchanged') unchanged += 1;
    }
    if (item.name && row.printName && item.name !== row.printName.trim()) {
      pushCapped(warnings, `${item.number}: 名称「${item.name}」与印刷名「${row.printName}」不一致`);
    }
    await db.update(Print).set({
      imageType:         'webp',
      imageSource:       ctx.source,
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
      eq(Print.set, ctx.set),
      eq(Print.number, row.number),
      eq(Print.lang, ctx.lang as typeof Print.$inferSelect.lang),
      eq(Print.source, row.source),
    ));
  }
  return {
    processed: 1,
    written,
    unchanged,
    lowQuality: tier.score != null && tier.status === 'lowres' ? 1 : 0,
    warnings,
  };
}

async function processDownloadItem(db: Db, item: DownloadItem, ctx: { source: string, set: string, lang: string }): Promise<OutputDelta> {
  const url = ctx.source === 'scryfall' ? item.url : null;
  const multiverseId = ctx.source === 'gatherer' ? item.multiverseId : null;

  try {
    let data: Buffer | null = null;
    if (url != null) {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { 'user-agent': 'tcg-cards/desktop' } });
      if (res.ok) data = Buffer.from(await res.arrayBuffer());
    } else if (multiverseId != null) {
      const res = await fetch(`https://gatherer.wizards.com/Handlers/Image.ashx?multiverseid=${multiverseId}&type=card`, { signal: AbortSignal.timeout(60_000), headers: { 'user-agent': 'tcg-cards/desktop' } });
      if (res.ok) data = Buffer.from(await res.arrayBuffer());
    }
    if (data == null || data.length === 0) return { processed: 1, failed: 1 };

    const enc = await encodeWebp(data);
    if (!enc) return { processed: 1, failed: 1 };

    const tier = await assessQuality(enc, data);
    const res = writeCanonical(ctx.set, ctx.lang, item.number, item.faceIndex, enc);
    if (res === 'error') return { processed: 1, failed: 1 };

    await db.update(Print).set({
      imageType:         'webp',
      imageSource:       ctx.source,
      imageStatus:       tier.status,
      imageSha256:       enc.sha256,
      imageWidth:        enc.width,
      imageHeight:       enc.height,
      imageByteSize:     enc.byteSize,
      imageQualityScore: tier.score,
      imageVerifiedAt:   new Date(),
    }).where(and(
      eq(Print.cardId, item.cardId),
      eq(Print.version, item.version),
      eq(Print.set, ctx.set),
      eq(Print.number, item.number),
      eq(Print.lang, ctx.lang as typeof Print.$inferSelect.lang),
      eq(Print.source, item.source),
    ));
    return {
      processed: 1,
      written:   res === 'written' ? 1 : 0,
      unchanged: res === 'unchanged' ? 1 : 0,
      lowQuality: tier.score != null && tier.status === 'lowres' ? 1 : 0,
    };
  } catch {
    return { processed: 1, failed: 1 };
  }
}

const definition = createDefinition(magicManualImageImportTaskType, {
  version:     '2026-09-07:v1',
  effectModel: 'reconcilable',
})
  .scope(z.object({}), {
    type:    'magic_manual_image_import',
    resolve: () => ({ key: 'global', snapshot: {} }),
  })
  .input(input)
  .output(output)
  .context({ init: values => values })
  .stage('import', { label: '手动导入卡图', progressMode: 'bounded', resumeMode: 'durable' })
  .entry(async ({ ctx, checkpoint }) => {
    const restored = checkpoint?.blockInput as BlockState | undefined;
    if (restored) return { total: restored.items.length, blockInput: restored };

    const db = getLocalDb();
    const counts = emptyCounts();
    let items: QueueItem[];
    if (ctx.zipPath != null) {
      items = await buildUploadZipItems(db, { source: ctx.source, set: ctx.set, lang: ctx.lang, force: ctx.force, zipPath: ctx.zipPath }, counts);
    } else if (ctx.dataBase64 != null) {
      const rows = await runWithDb(db, () => queryPrintRows(db, and(
        eq(Print.set, ctx.set),
        eq(Print.lang, ctx.lang as typeof Print.$inferSelect.lang),
        eq(Print.number, ctx.number!),
        isNull(Print.deletedAt),
      )));
      if (rows.length === 0) {
        counts.unmatched = 1;
        pushCapped(counts.unmatchedNumbers, ctx.number!);
        items = [];
      } else {
        const keptRows = applySkipRules(rows, ctx.source, ctx.force, counts);
        items = keptRows.length === 0 ? [] : [{
          kind:      'upload',
          number:    ctx.number!,
          faceIndex: ctx.faceIndex,
          dataBase64: ctx.dataBase64,
          rows:      keptRows,
        }];
      }
    } else {
      items = await buildDownloadItems(db, { source: ctx.source, set: ctx.set, lang: ctx.lang, force: ctx.force, number: ctx.number! }, counts);
    }
    const state: BlockState = { items, offset: 0, counts };
    return { total: items.length, blockInput: state };
  })
  .block(async ({ blockInput, ctx, checkpoint, progress, done, signal }) => {
    const state = blockInput as BlockState;
    if (state.offset >= state.items.length) return done(state);
    const batch = state.items.slice(state.offset, state.offset + BATCH);
    const zipFilenames = batch
      .map(item => item.kind === 'upload' ? item.filename : undefined)
      .filter((name): name is string => name != null);
    const zipData = ctx.zipPath != null && zipFilenames.length > 0
      ? await readZipImages(ctx.zipPath, zipFilenames)
      : new Map<string, Buffer>();

    const db = getLocalDb();
    const counts = await runWithDb(db, async () => {
      let acc = emptyCounts();
      for (const item of batch) {
        if (signal?.aborted) break;
        const delta = item.kind === 'upload'
          ? await processUploadItem(item, { source: ctx.source, set: ctx.set, lang: ctx.lang }, item.filename ? zipData.get(item.filename) : Buffer.from(item.dataBase64!, 'base64'), db)
          : await processDownloadItem(db, item, { source: ctx.source, set: ctx.set, lang: ctx.lang });
        acc = addCounts(acc, delta);
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

export const magicManualImageImportTaskDefinition = definition;
