import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { resolvePath } from '../../game-paths';

/** Canonical webp preset decided in docs/magic experiments (2026-09-05). */
export const WEBP_ARGS = ['-quiet', '-q', '50', '-m', '4'];

export const qualityGoodThreshold = 0.75;
/** Images with a short edge below this are marked lowres directly without running the detail-loss metric. */
export const smallEdgePx = 370;

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

/** File name for one print/face, mirroring the {number} / {number}-{face} convention. */
export function imageFileName(number: string, faceIndex?: number): string {
  const safe = number.replaceAll('/', '_');
  return faceIndex == null ? `${safe}.webp` : `${safe}-${faceIndex}.webp`;
}

export function sha256Hex(data: Uint8Array | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function webpDims(data: Uint8Array): { width: number, height: number } | null {
  if (data.length < 30 || data[0] !== 0x52 || data[1] !== 0x49 || data[2] !== 0x46 || data[3] !== 0x46) return null; // RIFF
  if (data[8] !== 0x57 || data[9] !== 0x45 || data[10] !== 0x42 || data[11] !== 0x50) return null; // WEBP
  const four = String.fromCharCode(data[12], data[13], data[14], data[15]);
  const u16 = (o: number) => data[o] | (data[o + 1] << 8);
  const u24 = (o: number) => data[o] | (data[o + 1] << 8) | (data[o + 2] << 16);
  if (four === 'VP8 ') return { width: u16(26) & 0x3fff, height: u16(28) & 0x3fff };
  if (four === 'VP8L') {
    const bits = u24(21) | (data[24] << 24);
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

/** cwebp q50-m4. Returns null when cwebp is unavailable or fails. */
export function encodeWebp(inputPath: string): EncodedImage | null {
  const out = join(tmpdir(), `magic-img-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.webp`);
  const r = spawnSync('cwebp', [...WEBP_ARGS, inputPath, '-o', out], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 || !existsSync(out)) {
    if (existsSync(out)) rmSync(out);
    return null;
  }
  const data = readFileSync(out);
  rmSync(out);
  const dims = webpDims(data);
  if (!dims) return null;
  return { data, sha256: sha256Hex(data), width: dims.width, height: dims.height, byteSize: data.length };
}

/**
 * Write canonical file with sha dedupe.
 * Returns 'written' | 'unchanged' | 'error'.
 */
export function writeCanonical(set: string, lang: string, number: string, faceIndex: number | undefined, image: EncodedImage): 'written' | 'unchanged' | 'error' {
  try {
    const dir = printImageDir(set, lang);
    const file = join(dir, imageFileName(number, faceIndex));
    if (existsSync(file) && sha256Hex(readFileSync(file)) === image.sha256) return 'unchanged';
    writeFileSync(file, image.data);
    return 'written';
  } catch {
    return 'error';
  }
}

/** Detail-loss ratio; returns null when ffmpeg is unavailable (caller falls back to the size tier). */
export function detailLossScore(inputPath: string): number | null {
  const probeW = 336, probeH = 468;
  const raw1 = join(tmpdir(), `dl1-${process.pid}.raw`);
  const raw2 = join(tmpdir(), `dl2-${process.pid}.raw`);
  const run = (args: string[]) => spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', inputPath, ...args], { stdio: 'ignore' });
  try {
    if (run(['-vf', `scale=${probeW}:${probeH},format=gray`, '-f', 'rawvideo', '-pix_fmt', 'gray', raw1]).status !== 0) return null;
    if (run(['-vf', `scale=${probeW / 2}:${probeH / 2},scale=${probeW}:${probeH},format=gray`, '-f', 'rawvideo', '-pix_fmt', 'gray', raw2]).status !== 0) return null;
    const e1 = lapvar(readFileSync(raw1), probeW, probeH);
    const e2 = lapvar(readFileSync(raw2), probeW, probeH);
    return e1 > 0 ? 1 - e2 / e1 : null;
  } finally {
    for (const f of [raw1, raw2]) if (existsSync(f)) rmSync(f);
  }
}

function lapvar(buf: Buffer, w: number, h: number): number {
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      const c = buf[i];
      // 4-neighbour laplacian with border replication
      const l = 4 * c
        - (x > 0 ? buf[i - 1] : c) - (x < w - 1 ? buf[i + 1] : c)
        - (y > 0 ? buf[i - w] : c) - (y < h - 1 ? buf[i + w] : c);
      sum += l;
      sum2 += l * l;
      n++;
    }
  }
  const mean = sum / n;
  return sum2 / n - mean * mean;
}

export type QualityTier = { status: 'highres_scan' | 'lowres', score: number | null };

/** Combine the size tier with the detail-loss ratio (when ffmpeg is available) into a local quality tier. */
export function assessQuality(encoded: EncodedImage, inputPath: string): QualityTier {
  const shortEdge = Math.min(encoded.width, encoded.height);
  if (shortEdge < smallEdgePx) return { status: 'lowres', score: null };
  const score = detailLossScore(inputPath);
  if (score == null) return { status: 'highres_scan', score: null };
  return { status: score >= qualityGoodThreshold ? 'highres_scan' : 'lowres', score };
}

/**
 * For multi-face prints, the face file index of this (single-face) print row:
 * front/top/left -> 0, back/bottom/right -> 1; single-face rows (scryfallFace=null) get no face suffix.
 */
export function faceIndexOf(scryfallFace: string | null): number | undefined {
  if (scryfallFace == null) return undefined;
  if (scryfallFace === 'front' || scryfallFace === 'top' || scryfallFace === 'left') return 0;
  if (scryfallFace === 'back' || scryfallFace === 'bottom' || scryfallFace === 'right') return 1;
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
