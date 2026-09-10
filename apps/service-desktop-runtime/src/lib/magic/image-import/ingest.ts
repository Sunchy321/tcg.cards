import { and, eq } from 'drizzle-orm';

import { Print } from '@tcg-cards/db/schema/shared/magic/print';
import { isTwoImageLayout } from '@tcg-cards/shared/magic/print-image';
import type { ImageInfo, ImageInfoMeta, ImageStatus } from '#model/magic/schema/print';

import type { LocalDb } from '../../hearthstone/hsdata-local-db';
import { assessQuality, encodeWebp, mergeImageInfo, removeSameStemJpg, uploadImageSources, writeCanonical, type EncodedImage, type QualityTier } from './common';
import { fetchImageBuffer } from './fetch';
import type { ImageImportDelta } from './result';
import { pushCapped } from './result';
import type { RemoteQueueRow } from './source';

/** Primary key of one print row, as needed by every image write. */
export interface PrintKey {
  cardId:  string;
  version: string;
  set:     string;
  number:  string;
  lang:    string;
  source:  string;
}

/** Encoded image plus its quality tier and the `image_info` payload of one face. */
export interface PreparedFace {
  encoded: EncodedImage;
  tier:    QualityTier;
  meta:    ImageInfoMeta;
}

/** Result of writing one prepared face to the canonical image file. */
export interface FaceWrite {
  result:     'written' | 'unchanged' | 'error';
  cleanedJpg: number;
}

/** Encodes raw image bytes and evaluates quality, producing the `image_info` payload. */
export async function prepareFace(data: Buffer, source: string): Promise<PreparedFace | null> {
  const encoded = await encodeWebp(data);
  if (!encoded) return null;
  const tier = await assessQuality(encoded, data);
  return {
    encoded,
    tier,
    meta: {
      status:       tier.status,
      type:         'webp',
      source,
      sha256:       encoded.sha256,
      width:        encoded.width,
      height:       encoded.height,
      byteSize:     encoded.byteSize,
      qualityScore: tier.score,
      verifiedAt:   new Date().toISOString(),
    },
  };
}

/**
 * Writes one prepared face to its canonical file and, on the primary face,
 * sweeps the legacy jpg variants of the same print.
 */
export function writeFace(set: string, lang: string, number: string, faceIndex: number | undefined, prepared: PreparedFace, cleanupJpg: boolean): FaceWrite {
  const result = writeCanonical(set, lang, number, faceIndex, prepared.encoded);
  if (result === 'error') return { result, cleanedJpg: 0 };
  const cleanedJpg = cleanupJpg && (faceIndex == null || faceIndex === 0)
    ? removeSameStemJpg(set, lang, number)
    : 0;
  return { result, cleanedJpg };
}

function printKeyCondition(key: PrintKey) {
  return and(
    eq(Print.cardId, key.cardId),
    eq(Print.version, key.version),
    eq(Print.set, key.set),
    eq(Print.number, key.number),
    eq(Print.lang, key.lang as typeof Print.$inferSelect.lang),
    eq(Print.source, key.source),
  );
}

/**
 * Persists one face's metadata; the column snapshot tracks the primary face
 * only. The array is cut to `faceCount` so a one-image card cannot keep a stale
 * second face after its front is written.
 */
export async function updateRowFace(db: LocalDb, key: PrintKey, imageInfo: ImageInfo | null, faceIndex: number | undefined, meta: ImageInfoMeta, faceCount: 1 | 2): Promise<void> {
  const patch: Partial<typeof Print.$inferInsert> = { imageInfo: mergeImageInfo(imageInfo, faceIndex, meta).slice(0, faceCount) };
  if (faceIndex == null || faceIndex === 0) patch.imageStatus = meta.status;
  await db.update(Print).set(patch).where(printKeyCondition(key));
}

/** Persists a fully merged `image_info` array produced by a whole-row pass. */
export async function updateRowFaces(db: LocalDb, key: PrintKey, imageInfo: ImageInfo, face0Status: ImageStatus | null): Promise<void> {
  const patch: Partial<typeof Print.$inferInsert> = { imageInfo };
  if (face0Status != null) patch.imageStatus = face0Status;
  await db.update(Print).set(patch).where(printKeyCondition(key));
}

/** Image source of one face slot (null when that face carries no local image). */
export function faceImageSource(imageInfo: ImageInfo | null, faceIndex: number | undefined): string | null {
  return imageInfo?.[faceIndex ?? 0]?.source ?? null;
}

/**
 * Whether the targeted face may be written given the chosen import source and
 * force mode: an empty slot always may, an existing one follows the source and
 * force rules. Per-face rather than per-row, so filling a missing back face
 * works without force.
 */
export function mayOverwrite(imageInfo: ImageInfo | null, faceIndex: number | undefined, source: string, force: boolean): boolean {
  const slotSource = faceImageSource(imageInfo, faceIndex);
  if (slotSource == null) return true;
  if ((uploadImageSources as readonly string[]).includes(slotSource)) {
    return (uploadImageSources as readonly string[]).includes(source) && force;
  }
  return force;
}

/** Splits matched rows into writable rows and skip counters per the face force rules. */
export function applySkipRules<T extends { layout: string, number: string, imageInfo: ImageInfo | null }>(
  rows: T[],
  source: string,
  force: boolean,
  faceIndex: number | undefined,
): { kept: T[], skipped: number, skippedUpload: number, singleImageFaces: string[] } {
  const kept: T[] = [];
  const singleImageFaces: string[] = [];
  let skipped = 0;
  let skippedUpload = 0;
  for (const row of rows) {
    // A card whose parts share one printed image (adventure, split, flip, …) has
    // no second face to write, whatever the caller asks for.
    if (faceIndex != null && faceIndex >= 1 && !isTwoImageLayout(row.layout)) {
      skipped += 1;
      pushCapped(singleImageFaces, `${row.number}⁑: 该牌只有一张卡图,已忽略背面`);
      continue;
    }
    if (mayOverwrite(row.imageInfo, faceIndex, source, force)) {
      kept.push(row);
    } else if ((uploadImageSources as readonly string[]).includes(faceImageSource(row.imageInfo, faceIndex) ?? '')) {
      skippedUpload += 1;
    } else {
      skipped += 1;
    }
  }
  return { kept, skipped, skippedUpload, singleImageFaces };
}

/** How one remote row pass should treat already-imported faces. */
export interface RemoteRowOptions {
  imageSource: string;
  cleanupJpg:  boolean;
  force:       boolean;
}

/**
 * Downloads and persists every face of one queued remote row. The row update
 * happens once with the merged `image_info` array, and the column snapshot
 * tracks the primary (face 0).
 */
export async function ingestRemoteRow(db: LocalDb, row: RemoteQueueRow, options: RemoteRowOptions): Promise<ImageImportDelta> {
  // Rebuild the array at the row's printed-image count: a stale second face on a
  // one-image card (adventure, split, …) is dropped even when this pass writes
  // nothing, so a re-import converges the row without force.
  const infos: ImageInfo = Array.from({ length: row.faceCount }, (_, i) => row.imageInfo?.[i] ?? null);
  const trimmed = (row.imageInfo?.length ?? 0) > row.faceCount;
  let written = 0;
  let unchanged = 0;
  let failed = 0;
  let skipped = 0;
  let lowQuality = 0;
  let cleanedJpg = 0;
  let face0Status: ImageStatus | null = null;
  let face0Imported = false;

  for (const face of row.faces) {
    const i = face.faceIndex;
    // Without force an already imported face is left untouched, so a row with a
    // front-only image still gets its missing back filled.
    if (!options.force && row.imageInfo?.[i] != null) {
      skipped += 1;
      continue;
    }
    const bytes = await fetchImageBuffer(face.url);
    if (!bytes) {
      failed += 1;
      continue;
    }
    const prepared = await prepareFace(bytes, options.imageSource);
    if (!prepared) {
      failed += 1;
      continue;
    }
    const write = writeFace(row.set, row.lang, row.number, i, prepared, options.cleanupJpg);
    if (write.result === 'error') {
      failed += 1;
      continue;
    }
    if (write.result === 'written') written += 1;
    else unchanged += 1;
    cleanedJpg += write.cleanedJpg;
    if (prepared.tier.score != null && prepared.tier.status === 'lowres') lowQuality += 1;

    infos[i] = prepared.meta;
    if (i === 0) {
      face0Status = prepared.tier.status;
      face0Imported = true;
    }
  }

  if (written + unchanged > 0 || trimmed) {
    await updateRowFaces(db, row, infos, face0Imported ? face0Status : null);
  }

  return { processed: 1, written, unchanged, failed, skipped, lowQuality, cleanedJpg };
}

/** One matched print row that an uploaded image writes into. */
export interface UploadRow extends PrintKey {
  layout:    string;
  printName: string;
  imageInfo: ImageInfo | null;
}

/** One uploaded image matched onto the prints it updates. */
export interface UploadItem {
  /** Collector number as written in the archive name (or the form input). */
  number:     string;
  faceIndex?: number;
  /** Archive card name, kept for the print-name mismatch warning. */
  name?:      string;
  rows:       UploadRow[];
}

export interface UploadOptions {
  imageSource: string;
  cleanupJpg:  boolean;
}

/** Writes one uploaded image onto every print it matched. */
export async function ingestUploadItem(db: LocalDb, item: UploadItem, data: Buffer | undefined, options: UploadOptions): Promise<ImageImportDelta> {
  if (data == null) return { processed: 1, failed: 1 };

  const prepared = await prepareFace(data, options.imageSource);
  if (!prepared) return { processed: 1, failed: 1 };

  const warnings: string[] = [];
  // One canonical file per distinct print; set/lang/number all come from the
  // matched print row (tree archives span many sets and languages).
  const writtenRows = new Set<string>();
  let written = 0;
  let unchanged = 0;
  let cleanedJpg = 0;

  for (const row of item.rows) {
    const rowKey = `${row.set}|${row.lang}|${row.number}|${item.faceIndex ?? ''}`;
    if (!writtenRows.has(rowKey)) {
      writtenRows.add(rowKey);
      const write = writeFace(row.set, row.lang, row.number, item.faceIndex, prepared, options.cleanupJpg);
      if (write.result === 'error') return { processed: 1, failed: 1 };
      if (write.result === 'written') written += 1;
      else unchanged += 1;
      cleanedJpg += write.cleanedJpg;
    }
    if (item.name && row.printName && item.name !== row.printName.trim()) {
      pushCapped(warnings, `${item.number}: 名称「${item.name}」与印刷名「${row.printName}」不一致`);
    }
    await updateRowFace(db, row, row.imageInfo, item.faceIndex, prepared.meta, isTwoImageLayout(row.layout) ? 2 : 1);
  }

  return {
    processed:  1,
    written,
    unchanged,
    cleanedJpg,
    lowQuality: prepared.tier.score != null && prepared.tier.status === 'lowres' ? 1 : 0,
    warnings,
  };
}
