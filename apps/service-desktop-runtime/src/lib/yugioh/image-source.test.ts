import { afterEach, describe, expect, test } from 'bun:test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  ImageSourceError,
  buildYugiohImageR2Key,
  downloadYugiohImage,
  parseWebpMetadata,
  parseYugiohImageMetadata,
  passwordToImageSourceId,
  prepareYugiohImageBucket,
  writeYugiohImageAsset,
} from './image-source';

const tempDirs: string[] = [];

/** Minimal VP8X WebP bytes with one declared canvas size. */
function buildVp8x(width = 421, height = 614) {
  const bytes = new Uint8Array(30);
  const view = new DataView(bytes.buffer);

  bytes.set(Buffer.from('RIFF'), 0);
  view.setUint32(4, 22, true);
  bytes.set(Buffer.from('WEBP'), 8);
  bytes.set(Buffer.from('VP8X'), 12);
  view.setUint32(16, 10, true);
  const encodedWidth = width - 1;
  const encodedHeight = height - 1;

  bytes[24] = encodedWidth & 0xff;
  bytes[25] = (encodedWidth >> 8) & 0xff;
  bytes[26] = (encodedWidth >> 16) & 0xff;
  bytes[27] = encodedHeight & 0xff;
  bytes[28] = (encodedHeight >> 8) & 0xff;
  bytes[29] = (encodedHeight >> 16) & 0xff;
  return bytes;
}

/** Minimal VP8L WebP bytes with one encoded lossless canvas size. */
function buildVp8l(width = 300, height = 400) {
  const bytes = new Uint8Array(26);
  const view = new DataView(bytes.buffer);
  const encodedWidth = width - 1;
  const encodedHeight = height - 1;

  bytes.set(Buffer.from('RIFF'), 0);
  view.setUint32(4, 18, true);
  bytes.set(Buffer.from('WEBP'), 8);
  bytes.set(Buffer.from('VP8L'), 12);
  view.setUint32(16, 5, true);
  bytes[20] = 0x2f;
  bytes[21] = encodedWidth & 0xff;
  bytes[22] = ((encodedWidth >> 8) & 0x3f) | ((encodedHeight & 0x03) << 6);
  bytes[23] = (encodedHeight >> 2) & 0xff;
  bytes[24] = (encodedHeight >> 10) & 0x0f;
  return bytes;
}

/** Minimal VP8 WebP bytes with one lossy frame header canvas size. */
function buildVp8(width = 500, height = 700) {
  const bytes = new Uint8Array(30);
  const view = new DataView(bytes.buffer);

  bytes.set(Buffer.from('RIFF'), 0);
  view.setUint32(4, 22, true);
  bytes.set(Buffer.from('WEBP'), 8);
  bytes.set(Buffer.from('VP8 '), 12);
  view.setUint32(16, 10, true);
  bytes.set([0x9d, 0x01, 0x2a], 23);
  view.setUint16(26, width, true);
  view.setUint16(28, height, true);
  return bytes;
}

/** Lowercase digest constructs source metadata fixtures. */
function digest(algorithm: 'md5' | 'sha256', bytes: Uint8Array) {
  return createHash(algorithm).update(bytes).digest('hex');
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(path => rm(path, { force: true, recursive: true })));
});

describe('parseYugiohImageMetadata', () => {
  test('parses CRLF records, normalizes numeric file names, and hashes stable order', () => {
    const result = parseYugiohImageMetadata([
      '89631139.webp:30,1766989278,0123456789abcdef0123456789abcdef',
      '08124921.webp:40,1766989279,abcdef0123456789abcdef0123456789',
      '0.webp:50,1766989280,11111111111111111111111111111111',
      '',
    ].join('\r\n'));

    expect(result.records.map(record => record.sourceRecordId)).toEqual(['0', '8124921', '89631139']);
    expect(result.records[1]?.fileName).toBe('08124921.webp');
    expect(result.records[1]?.sourceUrl).toEndWith('/08124921.webp');
    expect(result.totalByteCount).toBe(120);
    expect(result.metadataHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test('rejects malformed lines and duplicate normalized source ids', () => {
    expect(() => parseYugiohImageMetadata('')).toThrow('Image metadata contains no records');
    expect(() => parseYugiohImageMetadata('bad')).toThrow(ImageSourceError);
    expect(() => parseYugiohImageMetadata([
      '1.webp:30,1766989278,0123456789abcdef0123456789abcdef',
      '',
      '2.webp:30,1766989278,abcdef0123456789abcdef0123456789',
    ].join('\n'))).toThrow('Image metadata line 2 is invalid');
    expect(() => parseYugiohImageMetadata(
      '1.webp:30,1766989278,ABCDEF0123456789ABCDEF0123456789',
    )).toThrow('Image metadata line 1 is invalid');
    expect(() => parseYugiohImageMetadata([
      '1.webp:30,1766989278,0123456789abcdef0123456789abcdef',
      '0001.webp:30,1766989278,0123456789abcdef0123456789abcdef',
    ].join('\n'))).toThrow('Duplicate image source id 1');
  });
});

describe('WebP source validation', () => {
  test('parses VP8X dimensions and maps padded passwords to CDN ids', () => {
    expect(parseWebpMetadata(buildVp8x())).toEqual({ width: 421, height: 614 });
    expect(parseWebpMetadata(buildVp8l())).toEqual({ width: 300, height: 400 });
    expect(parseWebpMetadata(buildVp8())).toEqual({ width: 500, height: 700 });
    expect(passwordToImageSourceId('08124921')).toBe('8124921');
    expect(passwordToImageSourceId(null)).toBeNull();
  });

  test('downloads one octet-stream WebP and verifies metadata hashes', async () => {
    const bytes = buildVp8x();
    const md5 = digest('md5', bytes);
    const record = parseYugiohImageMetadata(`89631139.webp:${bytes.length},1766989278,${md5}`).records[0]!;
    const image = await downloadYugiohImage(record, async () => new Response(bytes, {
      headers: { 'content-type': 'application/octet-stream' },
    }));

    expect(image).toMatchObject({ width: 421, height: 614, byteSize: bytes.length, md5 });
    expect(image.sha256).toBe(digest('sha256', bytes));
    expect(image.r2Key).toBe(buildYugiohImageR2Key(image.sha256));
  });

  test('rejects HTML and source MD5 mismatches', async () => {
    const bytes = buildVp8x();
    const record = parseYugiohImageMetadata(
      `89631139.webp:${bytes.length},1766989278,0123456789abcdef0123456789abcdef`,
    ).records[0]!;

    await expect(downloadYugiohImage(record, async () => new Response('<html></html>', {
      headers: { 'content-type': 'text/html' },
    }))).rejects.toThrow('returned HTML');
    await expect(downloadYugiohImage(record, async () => new Response(bytes))).rejects.toThrow('MD5');
  });
});

describe('writeYugiohImageAsset', () => {
  test('prepares one configured bucket before provider downloads begin', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), `yugioh-image-${randomUUID()}-`));
    const bucketDir = join(rootDir, 'nested', 'asset');
    tempDirs.push(rootDir);

    expect(await prepareYugiohImageBucket(bucketDir)).toBe(resolve(bucketDir));
    expect(await stat(bucketDir).then(value => value.isDirectory())).toBe(true);
  });

  test('writes content-addressed bytes once and skips an identical retry', async () => {
    const bucketDir = await mkdtemp(join(tmpdir(), `yugioh-image-${randomUUID()}-`));
    const bytes = buildVp8x();
    const sha256 = digest('sha256', bytes);

    tempDirs.push(bucketDir);
    const first = await writeYugiohImageAsset(bucketDir, { bytes, sha256, r2Key: buildYugiohImageR2Key(sha256) });
    const second = await writeYugiohImageAsset(bucketDir, { bytes, sha256, r2Key: buildYugiohImageR2Key(sha256) });

    expect(first.status).toBe('written');
    expect(second.status).toBe('skipped');
    expect(new Uint8Array(await readFile(first.path))).toEqual(bytes);
  });
});
