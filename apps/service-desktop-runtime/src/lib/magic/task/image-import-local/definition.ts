import { and, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { runWithDb } from '@tcg-cards/db';
import { Print } from '@tcg-cards/db/schema/shared/magic/print';
import { locale } from '@tcg-cards/model/magic/schema/basic';

import { createDefinition } from '#task/definition';
import { getLocalDb } from '../../../hearthstone/hsdata-local-db';
import { createImportBatchState, emptyImageImportOutput, runImportBlock, type ImportBatchState } from '../../image-import/batch';
import { uploadImageSources } from '../../image-import/common';
import { applySkipRules, ingestUploadItem, type UploadItem as MatchedUploadItem } from '../../image-import/ingest';
import { addImageImportOutput, imageImportOutput, pushCapped, type ImageImportDelta } from '../../image-import/result';
import { chooseNamingPattern, numberCandidates, parseImageStem, parseTreeLayout, stemOf } from '../../image-import/parse';
import type { ParsedTreeEntry } from '../../image-import/parse';
import { listZipImages, readZipImages } from '../../image-import/zip';
import type { ZipImageInfo } from '../../image-import/zip';

/** Local batch import: one archive of card images matched onto existing prints. */
export const magicImageImportLocalTaskType = 'magic_image_import_local';

type Db = ReturnType<typeof getLocalDb>;

const input = z.strictObject({
  source:     z.enum(uploadImageSources),
  // Storage-tree archives carry set/lang in their paths, so both are optional there.
  set:        z.string().min(1).optional(),
  lang:       z.string().min(1).optional(),
  force:      z.boolean().optional().default(false),
  cleanupJpg: z.boolean().optional().default(false),
  zipPath:    z.string().min(1),
});

const BATCH = 10;

const printColumns = {
  cardId:    Print.cardId,
  version:   Print.version,
  set:       Print.set,
  lang:      Print.lang,
  number:    Print.number,
  source:    Print.source,
  layout:    Print.layout,
  printName: Print.name,
  imageInfo: Print.imageInfo,
};

function queryPrintRows(db: Db, where: SQL | undefined) {
  return db.select(printColumns).from(Print).where(where);
}

type SelectedRow = Awaited<ReturnType<typeof queryPrintRows>>[number];

/** One archive image matched onto the prints it updates. */
interface ZipUploadItem extends MatchedUploadItem {
  /** Zip entry filename. */
  filename: string;
}

interface QueueContext {
  source: string;
  force:  boolean;
  counts: ImageImportDelta;
}

function collectSkip(counts: ImageImportDelta, skipped: number, skippedUpload: number, singleImageFaces: string[] = []): void {
  counts.skipped = (counts.skipped ?? 0) + skipped;
  counts.skippedUpload = (counts.skippedUpload ?? 0) + skippedUpload;
  for (const warning of singleImageFaces) pushCapped(counts.warnings!, warning);
}

async function buildTreeItems(db: Db, ctx: QueueContext, treeEntries: ParsedTreeEntry[], infos: ZipImageInfo[]): Promise<ZipUploadItem[]> {
  const treeFilenames = new Set(treeEntries.map(entry => entry.filename));
  ctx.counts.unrecognized = infos.length - treeEntries.length;
  for (const info of infos) {
    if (!treeFilenames.has(info.filename)) pushCapped(ctx.counts.unrecognizedNames!, info.filename);
  }

  const numbers = [...new Set(treeEntries.flatMap(entry => numberCandidates(entry.number)))];
  const sets = [...new Set(treeEntries.map(entry => entry.set))];
  const langs = [...new Set(treeEntries.map(entry => entry.lang))];
  const rows = await runWithDb(db, () => queryPrintRows(db, and(
    inArray(Print.set, sets),
    inArray(Print.lang, langs as typeof Print.$inferSelect.lang[]),
    isNull(Print.deletedAt),
    inArray(Print.number, numbers),
  )));
  const rowsByPath = new Map<string, SelectedRow[]>();
  for (const row of rows) {
    const key = `${row.set}|${row.lang}|${row.number}`;
    const bucket = rowsByPath.get(key) ?? [];
    bucket.push(row);
    rowsByPath.set(key, bucket);
  }

  const items: ZipUploadItem[] = [];
  for (const entry of treeEntries) {
    const candidates = numberCandidates(entry.number);
    const matched = candidates.flatMap(number => rowsByPath.get(`${entry.set}|${entry.lang}|${number}`) ?? []);
    if (matched.length === 0) {
      ctx.counts.unmatched = (ctx.counts.unmatched ?? 0) + 1;
      pushCapped(ctx.counts.unmatchedNumbers!, `${entry.set}/${entry.lang}/${entry.number}`);
      continue;
    }
    const { kept, skipped, skippedUpload, singleImageFaces } = applySkipRules(matched, ctx.source, ctx.force, entry.faceIndex);
    collectSkip(ctx.counts, skipped, skippedUpload, singleImageFaces);
    if (kept.length === 0) continue;
    items.push({ number: entry.number, faceIndex: entry.faceIndex, filename: entry.filename, rows: kept });
  }
  return items;
}

async function buildUploadZipItems(db: Db, ctx: QueueContext & { set?: string, lang?: string, zipPath: string }): Promise<ZipUploadItem[]> {
  const infos = await listZipImages(ctx.zipPath);
  const localeSet = new Set<string>(locale.options);

  // Storage-tree layouts (mirroring large/{set}/{lang}/{number}.webp) carry
  // set/lang/number in the path and may span many sets and languages.
  const treeEntries = parseTreeLayout(infos, localeSet);
  if (treeEntries != null) return buildTreeItems(db, ctx, treeEntries, infos);

  if (!ctx.set || !ctx.lang) throw new Error('该压缩包为平面文件名布局,需要先选择系列与语言');

  const parsed = infos.flatMap(info => {
    const parsedName = parseImageStem(stemOf(info.filename));
    return parsedName == null ? [] : [{ info, parsedName }];
  });
  const convention = chooseNamingPattern(parsed.map(item => item.parsedName));
  if (convention == null) throw new Error('压缩包内文件命名约定无法识别,请整理文件名后重试');
  const selected = parsed.filter(item => item.parsedName.kind === convention);
  ctx.counts.unrecognized = infos.length - selected.length;
  for (const item of parsed) {
    if (item.parsedName.kind !== convention) pushCapped(ctx.counts.unrecognizedNames!, item.info.filename);
  }

  const numbers = [...new Set(selected.flatMap(item => numberCandidates(item.parsedName.number)))];
  const rows = numbers.length === 0
    ? []
    : await runWithDb(db, () => queryPrintRows(db, and(
      eq(Print.set, ctx.set!),
      eq(Print.lang, ctx.lang! as typeof Print.$inferSelect.lang),
      isNull(Print.deletedAt),
      inArray(Print.number, numbers),
    )));
  const rowsByNumber = new Map<string, SelectedRow[]>();
  for (const row of rows) {
    const bucket = rowsByNumber.get(row.number) ?? [];
    bucket.push(row);
    rowsByNumber.set(row.number, bucket);
  }

  const items: ZipUploadItem[] = [];
  for (const { info, parsedName } of selected) {
    const candidates = numberCandidates(parsedName.number);
    const matched = candidates.flatMap(number => rowsByNumber.get(number) ?? []);
    if (matched.length === 0) {
      ctx.counts.unmatched = (ctx.counts.unmatched ?? 0) + 1;
      pushCapped(ctx.counts.unmatchedNumbers!, parsedName.number);
      continue;
    }
    const { kept, skipped, skippedUpload, singleImageFaces } = applySkipRules(matched, ctx.source, ctx.force, parsedName.faceIndex);
    collectSkip(ctx.counts, skipped, skippedUpload, singleImageFaces);
    if (kept.length === 0) continue;
    items.push({
      number:    parsedName.number,
      faceIndex: parsedName.faceIndex,
      name:      parsedName.name,
      filename:  info.filename,
      rows:      kept,
    });
  }
  return items;
}

const definition = createDefinition(magicImageImportLocalTaskType, {
  version:     '2026-09-09:v1',
  effectModel: 'reconcilable',
})
  .scope(z.object({}), {
    type:    magicImageImportLocalTaskType,
    resolve: () => ({ key: 'global', snapshot: {} }),
  })
  .input(input)
  .output(imageImportOutput)
  .context({ init: values => values })
  .stage('import', { label: '卡图压缩包导入', progressMode: 'bounded', resumeMode: 'durable' })
  .entry(async ({ ctx, checkpoint }) => {
    const restored = checkpoint?.blockInput as ImportBatchState<ZipUploadItem> | undefined;
    if (restored) return { total: restored.items.length, blockInput: restored };

    const db = getLocalDb();
    const counts: ImageImportDelta = emptyImageImportOutput();
    const items = await buildUploadZipItems(db, {
      source:  ctx.source,
      force:   !!ctx.force,
      set:     ctx.set,
      lang:    ctx.lang,
      zipPath: ctx.zipPath,
      counts,
    });
    const state = createImportBatchState(items, addImageImportOutput(emptyImageImportOutput(), counts), {
      cleanupJpg: !!ctx.cleanupJpg,
      force:      !!ctx.force,
    });
    return { total: items.length, blockInput: state };
  })
  .block(async ({ ctx, blockInput, checkpoint, progress, done, signal }) => {
    return runImportBlock({
      state:     blockInput as ImportBatchState<ZipUploadItem>,
      batchSize: BATCH,
      run:       async (batch, sig) => {
        const db = getLocalDb();
        const zipData = await readZipImages(ctx.zipPath, batch.map(item => item.filename));
        let acc = emptyImageImportOutput();
        for (const item of batch) {
          if (sig?.aborted) break;
          acc = addImageImportOutput(acc, await ingestUploadItem(db, item, zipData.get(item.filename), { imageSource: ctx.source, cleanupJpg: !!ctx.cleanupJpg }));
        }
        return acc;
      },
      progress,
      checkpoint,
      done,
      signal,
    });
  })
  .exit(({ blockInput }) => (blockInput as ImportBatchState<ZipUploadItem>).counts)
  .build();

export const magicImageImportLocalTaskDefinition = definition;
