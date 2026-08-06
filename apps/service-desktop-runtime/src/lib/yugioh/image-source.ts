import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

export const yugiohImageSource = 'ygocdb_ygopro';
export const yugiohImageMetadataUrl = 'https://cdn.233.momobako.com/ygoimg/ygopro/metadata';
export const yugiohImageBaseUrl = 'https://cdn.233.momobako.com/ygoimg/ygopro/';
export const yugiohImageR2Bucket = 'asset';

const maxMetadataBytes = 8 * 1024 * 1024;
const maxImageBytes = 10 * 1024 * 1024;
const maxImageDimension = 16_384;

/** One normalized image entry from the provider metadata snapshot. */
export interface YugiohImageMetadataRecord {
  sourceRecordId: string;
  fileName: string;
  sourceUrl: string;
  byteSize: number;
  modifiedAt: Date;
  modifiedUnixSeconds: number;
  md5: string;
}

/** Complete normalized provider metadata snapshot with stable aggregate values. */
export interface YugiohImageMetadataSnapshot {
  records: YugiohImageMetadataRecord[];
  metadataHash: string;
  totalByteCount: number;
}

/** Downloaded and cryptographically verified WebP ready for local bucket storage. */
export interface VerifiedYugiohImage {
  record: YugiohImageMetadataRecord;
  bytes: Uint8Array;
  byteSize: number;
  width: number;
  height: number;
  md5: string;
  sha256: string;
  r2Key: string;
}

/** Provider fetch result plus HTTP metadata retained by import state. */
export interface DownloadedYugiohImageMetadata extends YugiohImageMetadataSnapshot {
  etag: string | null;
  lastModified: string | null;
}

/** Minimal fetch interface accepted by source functions and deterministic tests. */
export type ImageFetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** Structured image-source failure with one stable diagnostic code. */
export class ImageSourceError extends Error {
  /** Builds one image-source error without retaining response bytes. */
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ImageSourceError';
  }
}

/** Lowercase hexadecimal digest for one byte sequence or UTF-8 string. */
function digest(algorithm: 'md5' | 'sha256', value: Uint8Array | string) {
  return createHash(algorithm).update(value).digest('hex');
}

/** Canonical CDN source id derived only from one normalized eight-digit password. */
export function passwordToImageSourceId(password: string | null) {
  if (password == null) {
    return null;
  }

  if (!/^[0-9]{8}$/.test(password)) {
    throw new ImageSourceError('INVALID_PASSWORD', `Card password ${password} is not eight decimal digits.`);
  }

  const sourceRecordId = password.replace(/^0+/, '');
  return sourceRecordId.length > 0 ? sourceRecordId : null;
}

/** Stable content-addressed object key shared by the local bucket and R2. */
export function buildYugiohImageR2Key(sha256: string) {
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new ImageSourceError('INVALID_SHA256', 'Image SHA-256 must be 64 lowercase hexadecimal characters.');
  }

  return `yugioh/card/v1/primary/${sha256.slice(0, 2)}/${sha256}.webp`;
}

/** Provider metadata text parsed completely before any card image writes begin. */
export function parseYugiohImageMetadata(text: string): YugiohImageMetadataSnapshot {
  if (Buffer.byteLength(text, 'utf8') > maxMetadataBytes) {
    throw new ImageSourceError('METADATA_SIZE_LIMIT', 'Image metadata exceeds the size limit.');
  }

  const lines = text.split(/\r?\n/);

  if (lines.at(-1) === '') {
    lines.pop();
  }

  if (lines.length === 0) {
    throw new ImageSourceError('EMPTY_METADATA', 'Image metadata contains no records.');
  }

  const records: YugiohImageMetadataRecord[] = [];
  const sourceIds = new Set<string>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const match = /^([0-9]+)\.webp:([1-9][0-9]*),([0-9]+),([a-f0-9]{32})$/.exec(line);

    if (match == null) {
      throw new ImageSourceError('INVALID_METADATA_LINE', `Image metadata line ${index + 1} is invalid.`);
    }

    const rawId = match[1]!;
    const sourceRecordId = rawId.replace(/^0+(?=[0-9])/, '');
    const byteSize = Number(match[2]);
    const modifiedUnixSeconds = Number(match[3]);
    const md5 = match[4]!.toLowerCase();

    if (sourceIds.has(sourceRecordId)) {
      throw new ImageSourceError('DUPLICATE_SOURCE_ID', `Duplicate image source id ${sourceRecordId}.`);
    }

    if (!Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > maxImageBytes) {
      throw new ImageSourceError('INVALID_IMAGE_SIZE', `Image ${sourceRecordId} has an invalid byte size.`);
    }

    if (!Number.isSafeInteger(modifiedUnixSeconds) || modifiedUnixSeconds < 0) {
      throw new ImageSourceError('INVALID_MODIFIED_TIME', `Image ${sourceRecordId} has an invalid modified time.`);
    }

    const modifiedAt = new Date(modifiedUnixSeconds * 1000);

    if (Number.isNaN(modifiedAt.getTime())) {
      throw new ImageSourceError('INVALID_MODIFIED_TIME', `Image ${sourceRecordId} has an invalid modified time.`);
    }

    sourceIds.add(sourceRecordId);
    records.push({
      sourceRecordId,
      fileName: `${rawId}.webp`,
      sourceUrl: new URL(`${rawId}.webp`, yugiohImageBaseUrl).toString(),
      byteSize,
      modifiedAt,
      modifiedUnixSeconds,
      md5,
    });
  }

  records.sort((left, right) => Number(left.sourceRecordId) - Number(right.sourceRecordId));
  const canonical = records.map(record => [
    record.sourceRecordId,
    record.byteSize,
    record.modifiedUnixSeconds,
    record.md5,
  ]);

  return {
    records,
    metadataHash: digest('sha256', JSON.stringify(canonical)),
    totalByteCount: records.reduce((total, record) => total + record.byteSize, 0),
  };
}

/** RIFF chunk four-character code decoded from one validated byte offset. */
function fourCc(bytes: Uint8Array, offset: number) {
  return String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!);
}

/** Unsigned little-endian 24-bit integer decoded from WebP feature bytes. */
function uint24(bytes: Uint8Array, offset: number) {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);
}

/** Positive WebP canvas dimensions decoded from VP8, VP8L, or VP8X. */
export function parseWebpMetadata(bytes: Uint8Array) {
  if (bytes.length < 20 || fourCc(bytes, 0) !== 'RIFF' || fourCc(bytes, 8) !== 'WEBP') {
    throw new ImageSourceError('INVALID_WEBP', 'Image is not a RIFF WebP container.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const declaredLength = view.getUint32(4, true) + 8;

  if (declaredLength !== bytes.length) {
    throw new ImageSourceError('INVALID_WEBP', 'WebP RIFF size does not match the downloaded bytes.');
  }

  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const kind = fourCc(bytes, offset);
    const size = view.getUint32(offset + 4, true);
    const dataOffset = offset + 8;
    const endOffset = dataOffset + size;

    if (endOffset > bytes.length) {
      throw new ImageSourceError('INVALID_WEBP', `WebP ${kind} chunk exceeds the container.`);
    }

    let width: number | null = null;
    let height: number | null = null;

    if (kind === 'VP8X' && size >= 10) {
      width = uint24(bytes, dataOffset + 4) + 1;
      height = uint24(bytes, dataOffset + 7) + 1;
    } else if (kind === 'VP8L' && size >= 5 && bytes[dataOffset] === 0x2f) {
      const b1 = bytes[dataOffset + 1]!;
      const b2 = bytes[dataOffset + 2]!;
      const b3 = bytes[dataOffset + 3]!;
      const b4 = bytes[dataOffset + 4]!;

      width = 1 + b1 + ((b2 & 0x3f) << 8);
      height = 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10);
    } else if (kind === 'VP8 ' && size >= 10
      && bytes[dataOffset + 3] === 0x9d
      && bytes[dataOffset + 4] === 0x01
      && bytes[dataOffset + 5] === 0x2a) {
      width = view.getUint16(dataOffset + 6, true) & 0x3fff;
      height = view.getUint16(dataOffset + 8, true) & 0x3fff;
    }

    if (width != null && height != null) {
      if (width <= 0 || height <= 0 || width > maxImageDimension || height > maxImageDimension) {
        throw new ImageSourceError('INVALID_WEBP_DIMENSIONS', `WebP dimensions ${width}x${height} are invalid.`);
      }

      return { width, height };
    }

    offset = endOffset + (size % 2);
  }

  throw new ImageSourceError('INVALID_WEBP', 'WebP does not contain a supported image chunk.');
}

/** One provider WebP downloaded and verified against its metadata record. */
export async function downloadYugiohImage(
  record: YugiohImageMetadataRecord,
  fetcher: ImageFetcher = fetch,
): Promise<VerifiedYugiohImage> {
  const response = await fetcher(record.sourceUrl, {
    headers: { accept: 'image/webp, application/octet-stream;q=0.9' },
  });

  if (!response.ok) {
    throw new ImageSourceError('IMAGE_HTTP_ERROR', `Image ${record.sourceRecordId} download failed with HTTP ${response.status}.`);
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

  if (contentType.includes('text/html')) {
    throw new ImageSourceError('IMAGE_HTML_RESPONSE', `Image ${record.sourceRecordId} returned HTML.`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());

  if (bytes.length !== record.byteSize) {
    throw new ImageSourceError(
      'IMAGE_SIZE_MISMATCH',
      `Image ${record.sourceRecordId} byte size ${bytes.length} does not match metadata ${record.byteSize}.`,
    );
  }

  const md5 = digest('md5', bytes);

  if (md5 !== record.md5) {
    throw new ImageSourceError('IMAGE_MD5_MISMATCH', `Image ${record.sourceRecordId} MD5 does not match metadata.`);
  }

  const { width, height } = parseWebpMetadata(bytes);
  const sha256 = digest('sha256', bytes);

  return {
    record,
    bytes,
    byteSize: bytes.length,
    width,
    height,
    md5,
    sha256,
    r2Key: buildYugiohImageR2Key(sha256),
  };
}

/** Fixed metadata endpoint downloaded and parsed without creating a cache file. */
export async function downloadYugiohImageMetadata(
  fetcher: ImageFetcher = fetch,
): Promise<DownloadedYugiohImageMetadata> {
  const response = await fetcher(yugiohImageMetadataUrl, {
    headers: { accept: 'application/octet-stream, text/plain;q=0.9' },
  });

  if (!response.ok) {
    throw new ImageSourceError('METADATA_HTTP_ERROR', `Image metadata download failed with HTTP ${response.status}.`);
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

  if (contentType.includes('text/html')) {
    throw new ImageSourceError('METADATA_HTML_RESPONSE', 'Image metadata endpoint returned HTML.');
  }

  const text = await response.text();

  return {
    ...parseYugiohImageMetadata(text),
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
  };
}

/** Existing regular file reported without following provider-controlled paths. */
async function fileExists(path: string) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** Configured local bucket root created and checked before any provider download begins. */
export async function prepareYugiohImageBucket(bucketDir: string) {
  const bucketRoot = resolve(bucketDir);

  await mkdir(bucketRoot, { recursive: true });
  const bucketStat = await stat(bucketRoot);

  if (!bucketStat.isDirectory()) {
    throw new ImageSourceError('INVALID_BUCKET', 'Configured image bucket path is not a directory.');
  }

  await access(bucketRoot, constants.R_OK | constants.W_OK);

  return bucketRoot;
}

/** Generated R2 key resolved safely inside the configured local bucket root. */
function resolveAssetPath(bucketDir: string, r2Key: string) {
  const bucketRoot = resolve(bucketDir);
  const targetPath = resolve(bucketRoot, ...r2Key.split('/'));
  const targetRelative = relative(bucketRoot, targetPath);

  if (targetRelative.startsWith('..') || targetRelative === '') {
    throw new ImageSourceError('INVALID_BUCKET_PATH', 'Generated image path leaves the configured bucket directory.');
  }

  return targetPath;
}

/** Existing local object checked against its expected content-addressed digest. */
export async function isYugiohImageAssetValid(bucketDir: string, r2Key: string, sha256: string) {
  if (buildYugiohImageR2Key(sha256) !== r2Key) {
    return false;
  }

  const targetPath = resolveAssetPath(bucketDir, r2Key);

  if (!await fileExists(targetPath)) {
    return false;
  }

  return digest('sha256', new Uint8Array(await readFile(targetPath))) === sha256;
}

/** Verified WebP atomically written under one generated local R2-layout key. */
export async function writeYugiohImageAsset(
  bucketDir: string,
  asset: Pick<VerifiedYugiohImage, 'bytes' | 'sha256' | 'r2Key'>,
) {
  if (buildYugiohImageR2Key(asset.sha256) !== asset.r2Key) {
    throw new ImageSourceError('R2_KEY_MISMATCH', 'Image R2 key does not match its SHA-256.');
  }

  const targetPath = resolveAssetPath(bucketDir, asset.r2Key);

  if (await fileExists(targetPath)) {
    const existing = new Uint8Array(await readFile(targetPath));

    if (digest('sha256', existing) === asset.sha256) {
      return { status: 'skipped' as const, path: targetPath };
    }

    throw new ImageSourceError('ASSET_CONFLICT', `Local bucket object ${asset.r2Key} has unexpected content.`);
  }

  await mkdir(dirname(targetPath), { recursive: true });
  const tempPath = join(dirname(targetPath), `.${asset.sha256}.${randomUUID()}.tmp`);

  try {
    const writtenByteCount = await Bun.write(tempPath, asset.bytes);

    if (writtenByteCount !== asset.bytes.length) {
      throw new ImageSourceError('ASSET_WRITE_MISMATCH', 'Local bucket write did not persist every image byte.');
    }

    await rename(tempPath, targetPath);
  } finally {
    await rm(tempPath, { force: true });
  }

  return { status: 'written' as const, path: targetPath };
}
