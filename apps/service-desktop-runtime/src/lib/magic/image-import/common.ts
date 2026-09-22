import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

import { and, eq, isNull, ne, notInArray, or, sql, type SQL } from 'drizzle-orm';

import { Print } from '@tcg-cards/db/schema/shared/magic/print';
import { printImageFileName, printImageKey } from '@tcg-cards/shared/magic/print-image';
import type { ImageInfo, ImageInfoMeta } from '#model/magic/schema/print';

import { resolvePath } from '../../game-paths';

/** Canonical webp preset decided in docs/magic experiments (2026-09-05). */
export const WEBP_QUALITY = 50;

/**
 * Image sources written through explicit local uploads (hand-picked files or
 * import archives). Bulk import tasks never overwrite rows carrying one of
 * these sources, so curated localization images survive sweep re-imports.
 * `hunterer` marks images from the defunct legacy source of the same name.
 */
export const uploadImageSources = ['manual', 'mtgch', 'mtgflame', 'hunterer'] as const;

export const qualityGoodThreshold = 0.75;
/** Images with a short edge below this are marked lowres directly without running the detail-loss metric. */
export const smallEdgePx = 370;

const AnyImage = ((globalThis as any).Image ?? (Bun as any).Image) as {
  new (input: string | ArrayBuffer | ArrayBufferView | Blob): BunImageLike;
};
interface BunImageLike {
  width:  number;
  height: number;
  buffer(): Promise<Buffer>;
  png(): Promise<BunImageLike>;
  webp(options?: { quality?: number }): Promise<BunImageLike>;
  resize(width: number, height: number): Promise<BunImageLike>;
}

export function cardImageRoot(): string {
  const root = resolvePath('magic.image.card');
  if (!root) throw new Error('magic.image.card path is not configured');
  return root;
}

export function printImageDir(set: string, lang: string): string {
  const dir = join(cardImageRoot(), 'large', set, lang);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Reads the stored image of one print face and returns it as a data URL, for
 * review surfaces that show the printed card beside its data.
 *
 * Deliberately the stored bytes, unresized and un-re-encoded: a reviewer reads
 * the printed reading off the card, and every downscale or re-encode loses
 * exactly the detail that check depends on. The stored files are already
 * webp in the tens of kilobytes, so handing them over whole is cheap.
 *
 * Returns null when the image root is unconfigured or the face has no file —
 * a missing image is a normal state, never an error.
 */
export async function storedFacePreview(
  set: string,
  lang: string,
  number: string,
  faceIndex: number,
): Promise<string | null> {
  let root: string;
  try {
    root = cardImageRoot();
  } catch {
    return null;
  }
  const file = join(root, printImageKey(set, lang, number, faceIndex));
  if (!existsSync(file)) return null;
  return `data:image/webp;base64,${readFileSync(file).toString('base64')}`;
}

/**
 * Merges one face's metadata into the image_info array (index = face index),
 * preserving the other slots; un-imported faces stay as explicit nulls.
 */
export function mergeImageInfo(existing: ImageInfo | null, faceIndex: number | undefined, meta: ImageInfoMeta): ImageInfo {
  const index = faceIndex ?? 0;
  const length = Math.max(existing?.length ?? 0, index + 1);
  const merged = Array.from({ length }, (_, i) => existing?.[i] ?? null);
  merged[index] = meta;
  return merged;
}

/** Rows whose primary face is not an upload-sourced image: sweep imports never overwrite those. */
function uploadProtectedExclusion(): SQL {
  const primarySource = sql`coalesce(${Print.imageInfo}->0->>'source', '')`;
  return or(isNull(Print.imageInfo), notInArray(primarySource, [...uploadImageSources]))!;
}

/**
 * Rows still missing at least one face out of `expectedFaces`: no image_info at
 * all, a shorter array, or an explicit null slot. Face-level rather than
 * row-level, so a partially imported double-faced card is still selectable.
 */
function missingFaceCondition(expectedFaces: SQL): SQL {
  return sql`(
    ${Print.imageInfo} is null
    or jsonb_array_length(${Print.imageInfo}) < ${expectedFaces}
    or exists (select 1 from jsonb_array_elements(${Print.imageInfo}) as e where jsonb_typeof(e) = 'null')
  )`;
}

/**
 * Import selection for sweep tasks: upload-protected rows are always skipped;
 * with force=false only rows still missing a face are kept. `expectedFaces` is
 * the per-row face count SQL expression of the task's data source. Rows in the
 * placeholder state (see `placeholderMarkExclusion`) are never selected.
 */
export function importablePrintCondition(force: boolean, expectedFaces: SQL): SQL {
  return force
    ? and(uploadProtectedExclusion(), placeholderMarkExclusion())!
    : and(uploadProtectedExclusion(), placeholderMarkExclusion(), missingFaceCondition(expectedFaces))!;
}

/**
 * Rows whose image status is placeholder: scryfall has no real image for them
 * (its placeholder status projects into the column), so any remote image would
 * be a stand-in. Never remote-imported, whatever the force mode. Prints that
 * do carry a local image hold that image's quality tier instead, so they stay
 * importable and the clear action is what flips them into the blocked state.
 */
function placeholderMarkExclusion(): SQL {
  return ne(Print.imageStatus, 'placeholder')!;
}

/** Primary-key condition of one print row, as needed by every image write. */
export function printKeyCondition(key: { cardId: string, version: string, set: string, number: string, lang: string, source: string }) {
  return and(
    eq(Print.cardId, key.cardId),
    eq(Print.version, key.version),
    eq(Print.set, key.set),
    eq(Print.number, key.number),
    eq(Print.lang, key.lang as typeof Print.$inferSelect.lang),
    eq(Print.source, key.source),
  );
}

/** Files removed from disk by one sweep: how many, and how many bytes they held. */
export interface RemovedFiles {
  files: number;
  bytes: number;
}

/** Removes the canonical webp files of one print (front and ⁑ back face) plus its legacy jpg variants. */
export function removePrintImageFiles(set: string, lang: string, number: string): RemovedFiles {
  const safe = number.replaceAll('/', '_');
  const dir = printImageDir(set, lang);
  let files = 0;
  let bytes = 0;
  for (const name of [`${safe}.webp`, `${safe}⁑.webp`]) {
    const file = join(dir, name);
    if (!existsSync(file)) continue;
    bytes += statSync(file).size;
    rmSync(file);
    files += 1;
  }
  const jpg = removeSameStemJpg(set, lang, number);
  return { files: files + jpg.files, bytes: bytes + jpg.bytes };
}

export function sha256Hex(data: Uint8Array | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function webpDims(data: Uint8Array): { width: number, height: number } | null {
  if (data.length < 30 || data[0] !== 0x52 || data[1] !== 0x49 || data[2] !== 0x46 || data[3] !== 0x46) return null; // RIFF
  if (data[8] !== 0x57 || data[9] !== 0x45 || data[10] !== 0x42 || data[11] !== 0x50) return null; // WEBP
  const four = String.fromCharCode(data[12]!, data[13]!, data[14]!, data[15]!);
  const u16 = (o: number) => data[o]! | (data[o + 1]! << 8);
  const u24 = (o: number) => data[o]! | (data[o + 1]! << 8) | (data[o + 2]! << 16);
  if (four === 'VP8 ') return { width: u16(26) & 0x3fff, height: u16(28) & 0x3fff };
  if (four === 'VP8L') {
    const bits = u24(21) | (data[24]! << 24);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  if (four === 'VP8X') return { width: 1 + u24(24), height: 1 + u24(27) };
  return null;
}

export interface EncodedImage {
  data:     Buffer;
  sha256:   string;
  width:    number;
  height:   number;
  byteSize: number;
}

/** Outcome of one image processing step: the value, or why it failed. */
export type StepResult<T> = { ok: true, value: T } | { ok: false, error: string };

/** Encode any decodable image (png/jpg/webp/...) to webp via the Bun built-in Image (byte-identical to `cwebp -q 50 -m 4`). */
export async function encodeWebp(input: Buffer): Promise<StepResult<EncodedImage>> {
  try {
    const img = new AnyImage(input);
    await img.buffer();
    const encoded = await img.webp({ quality: WEBP_QUALITY });
    const data = await encoded.buffer();
    const dims = webpDims(data);
    if (!dims) return { ok: false, error: '编码结果无效' };
    return { ok: true, value: { data, sha256: sha256Hex(data), width: dims.width, height: dims.height, byteSize: data.length } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Outcome of one canonical write; `previousBytes` is the size the path held before, null when it held nothing. */
export interface CanonicalWrite {
  result:        'written' | 'unchanged';
  previousBytes: number | null;
}

/**
 * Write canonical file with sha dedupe. Returns the write outcome plus the
 * size the path held before the write, so the import report can account a
 * replacement against the file it displaced.
 */
export function writeCanonical(set: string, lang: string, number: string, faceIndex: number | undefined, image: EncodedImage): StepResult<CanonicalWrite> {
  try {
    const dir = printImageDir(set, lang);
    const file = join(dir, printImageFileName(number, faceIndex));
    const previousBytes = existsSync(file) ? statSync(file).size : null;
    if (previousBytes != null && sha256Hex(readFileSync(file)) === image.sha256) return { ok: true, value: { result: 'unchanged', previousBytes } };
    writeFileSync(file, image.data);
    return { ok: true, value: { result: 'written', previousBytes } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Minimal PNG decoder that also converts to 8-bit grayscale in one pass.
 *
 * Scope: only what Bun.Image.png() emits - 8-bit depth, color type 2 (RGB) or
 * 6 (RGBA), non-interlaced. Anything else (palettes, 16-bit, interlace) is
 * rejected by the depth/color check below.
 *
 * PNG structure: a series of chunks `<u32be length><4cc type><payload><crc32>`;
 * IHDR carries width/height/depth/color, IDAT chunks hold one zlib stream of
 * filtered scanlines, IEND ends the file. Each scanline is prefixed with one
 * filter-type byte, and the decompressed stream is
 * height * (1 + width * channels) bytes.
 *
 * Filter reconstruction (per PNG spec; 'a' = left, 'b' = up, 'c' = up-left):
 *   0 None   1 Sub (add a)   2 Up (add b)   3 Average (add (a+b)/2)
 *   4 Paeth (add whichever of a/b/c is closest to a+b-c)
 * All additions wrap mod 256 (the & 0xff). After reconstruction each RGB triple
 * is reduced to luma with the BT.601 weights 299/587/114 (/1000).
 */
function pngToGray(input: Buffer | Uint8Array): Uint8Array | null {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  let off = 8, w = 0, h = 0, depth = 0, color = 0;
  const idat: Buffer[] = [];
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8]!;
      color = data[9]!;
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || (color !== 2 && color !== 6) || w === 0 || h === 0) return null;
  const ch = color === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  // Reconstruct into FULL channel-strided rows first: PNG filters operate on
  // encoded bytes, so neighbours a/b/c sit ch bytes apart. Grayscale reduction
  // happens only after a row is fully reconstructed.
  const rows = new Uint8Array(w * h * ch);
  const out = new Uint8Array(w * h);
  let pos = 0;
  const prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[pos++]!;
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = rows.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch]! : 0;
      const b = prev[x]!;
      const c = x >= ch ? prev[x - ch]! : 0;
      let v = line[x]!;
      switch (filter) {
      case 1:
        v = (v + a) & 0xff;
        break;
      case 2:
        v = (v + b) & 0xff;
        break;
      case 3:
        v = (v + ((a + b) >> 1)) & 0xff;
        break;
      case 4: {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
        break;
      }
      default: break;
      }
      cur[x] = v;
    }
    // BT.601 luma: Y = 0.299R + 0.587G + 0.114B, integer math (/1000)
    for (let x = 0; x < w; x++) {
      const o = x * ch;
      out[y * w + x] = (cur[o]! * 299 + cur[o + 1]! * 587 + cur[o + 2]! * 114) / 1000;
    }
    prev.set(cur);
  }
  return out;
}

/** Decode + resize to (w, h) and return 8-bit grayscale pixels. */
async function probeGray(input: Buffer, w: number, h: number): Promise<Uint8Array | null> {
  try {
    const img = new AnyImage(input);
    await img.buffer();
    const resized = await img.resize(w, h);
    return pngToGray(await (await resized.png()).buffer());
  } catch {
    return null;
  }
}

/**
 * Variance of the 4-neighbour Laplacian response over a grayscale image.
 *
 * The Laplacian L = 4*c - left - right - up - down approximates the second
 * derivative, so its variance is high when the image has strong small-scale
 * edges (sharp detail) and near zero on smooth/stretched content. Border
 * pixels replicate their nearest in-bounds neighbour (constant border).
 * Computed in a single pass as E[L^2] - E[L]^2.
 */
function lapvar(px: Uint8Array, w: number, h: number): number {
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      const c = px[i]!;
      // 4-neighbour laplacian with border replication
      const l = 4 * c
        - (x > 0 ? px[i - 1]! : c) - (x < w - 1 ? px[i + 1]! : c)
        - (y > 0 ? px[i - w]! : c) - (y < h - 1 ? px[i + w]! : c);
      sum += l;
      sum2 += l * l;
      n++;
    }
  }
  const mean = sum / n;
  return sum2 / n - mean * mean;
}

const probeW = 336, probeH = 468;

/**
 * Detail-loss ratio: how much Laplacian energy a half-resolution roundtrip destroys.
 *
 * Pipeline (all in-memory via Bun.Image):
 *   A = grayscale at the fixed probe size, of the original
 *   B = grayscale at the probe size, of [ original -> downscale 1/2 -> upscale back ]
 *   score = 1 - E(B) / E(A)      (E = Laplacian variance, see lapvar)
 *
 * A genuinely sharp image loses most of its fine detail in the roundtrip, so
 * E(B) << E(A) and the score approaches 1 (calibrated sharp samples: 0.87-0.93).
 * An image that was itself upscaled from something small has no fine detail to
 * lose, E(B) ~= E(A), and the score stays low (calibrated blurry samples: 0.52-0.64).
 * Both probes use the same fixed 336x468 probe size so scores are comparable
 * across source resolutions, and being a within-image ratio it is largely
 * insensitive to art style. Threshold 0.75 sits in the calibrated gap between
 * the groups; see docs/magic/card-image-experiments.zh-CN.md.
 * Returns null when the image cannot be decoded or has no measurable energy.
 */
export async function detailLossScore(input: Buffer): Promise<number | null> {
  const a = await probeGray(input, probeW, probeH);
  if (!a) return null;
  try {
    const img = new AnyImage(input);
    await img.buffer();
    const small = await img.resize(probeW >> 1, probeH >> 1);
    const smallPng = await (await small.png()).buffer();
    const up = new AnyImage(smallPng);
    await up.buffer();
    const upResized = await up.resize(probeW, probeH);
    const b = pngToGray(await (await upResized.png()).buffer());
    if (!b) return null;
    const e1 = lapvar(a, probeW, probeH);
    const e2 = lapvar(b, probeW, probeH);
    return e1 > 0 ? 1 - e2 / e1 : null;
  } catch {
    return null;
  }
}

export type QualityTier = { status: 'highres_scan' | 'lowres', score: number | null };

/** Combine the size tier with the detail-loss ratio into a local quality tier. */
export async function assessQuality(encoded: EncodedImage, input: Buffer): Promise<QualityTier> {
  const shortEdge = Math.min(encoded.width, encoded.height);
  if (shortEdge < smallEdgePx) return { status: 'lowres', score: null };
  const score = await detailLossScore(input);
  if (score == null) return { status: 'highres_scan', score: null };
  return { status: score >= qualityGoodThreshold ? 'highres_scan' : 'lowres', score };
}

/**
 * Multi-face prints: the face file index of this (single-face) print row.
 * front/top -> 0, back/bottom -> 1; single-face rows (scryfallFace=null) get no face suffix.
 * combined prints (B.F.M. halves) also get no suffix: their left/right mark is
 * the half of a spread, not a face — each half is a standalone single-face print.
 */
export function faceIndexOf(scryfallFace: string | null): number | undefined {
  if (scryfallFace == null) return undefined;
  if (scryfallFace === 'front' || scryfallFace === 'top') return 0;
  if (scryfallFace === 'back' || scryfallFace === 'bottom') return 1;
  return undefined;
}

/** Bounded-concurrency map so network waits overlap instead of serializing whole batches. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
  shouldStop?: () => boolean,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      if (shouldStop?.()) return;
      const index = cursor++;
      results[index] = await worker(items[index]!);
    }
  });
  await Promise.all(lanes);
  return results;
}

/**
 * Remove the legacy image files of one print after its webp replacement was
 * written: the bare jpg plus the `-0`/`-1` face variants the old library used
 * for a double-faced card, so one pass sweeps the whole print. The canonical
 * webp names (bare stem, `⁑` back face) are never touched. Returns how many
 * files were removed and how many bytes they held.
 *
 * The face variants are swept only while both faces are on disk: a lone
 * `{number}-1.webp` is the canonical image of a print whose collector number
 * literally ends in `-1` (e.g. `2025-1`), not a face of this print, and with a
 * single face present nothing on disk tells the two apart.
 */
export function removeSameStemJpg(set: string, lang: string, number: string): RemovedFiles {
  const safe = number.replaceAll('/', '_');
  const dir = printImageDir(set, lang);
  const present = (stem: string) => [`${stem}.jpg`, `${stem}.webp`].filter(name => existsSync(join(dir, name)));

  const front = present(`${safe}-0`);
  const back = present(`${safe}-1`);
  const faces = front.length > 0 && back.length > 0 ? [...front, ...back] : [];
  const stale = [`${safe}.jpg`, ...faces].filter(name => existsSync(join(dir, name)));

  let files = 0;
  let bytes = 0;
  for (const name of stale) {
    try {
      const size = statSync(join(dir, name)).size;
      rmSync(join(dir, name));
      files += 1;
      bytes += size;
    } catch {
      // removal is best-effort
    }
  }
  return { files, bytes };
}
