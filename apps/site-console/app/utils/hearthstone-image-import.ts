import encodeWebp, { init as initWebpEncode } from '@jsquash/webp/encode';
import webpEncoderUrl from '@jsquash/webp/codec/enc/webp_enc.wasm?url';
import webpEncoderSimdUrl from '@jsquash/webp/codec/enc/webp_enc_simd.wasm?url';

import {
  imageRequirementFile,
  type CardImageBrowserImportManifest,
  type CardImageImportProblem,
  type ImageRequirementFile,
} from '#model/hearthstone/schema/data/image';

import { normalizeZipEntryNames } from './hearthstone-image-import-zip';

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

interface PreparedImportFile {
  requestId: string;
  file:      File;
}

interface PreparedBrowserImport {
  manifest:            CardImageBrowserImportManifest;
  requirementsContent: string;
  files:               PreparedImportFile[];
}

const cwebpEquivalentOptions = {
  quality:       86,
  method:        4,
  alpha_quality: 100,
} as const;

const pngSignature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const eocdSignature = 0x06054B50;
const centralSignature = 0x02014B50;
const localSignature = 0x04034B50;
let webpEncoderReady: Promise<unknown> | null = null;

function fail(message: string): never {
  throw new Error(message);
}

function decodeText(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes);
}

function cloneBytes(bytes: Uint8Array) {
  return Uint8Array.from(bytes);
}

function isIgnoredZipEntry(entry: string) {
  return entry.split('/').some(part => part === '__MACOSX' || part === '.DS_Store' || part.startsWith('._'));
}

function isPngName(name: string) {
  return name.toLowerCase().endsWith('.png');
}

function isJsonName(name: string) {
  return name.toLowerCase().endsWith('.json');
}

function uint8ArrayFromStream(stream: ReadableStream<Uint8Array>) {
  return new Response(stream).arrayBuffer().then(buffer => new Uint8Array(buffer));
}

async function inflateRaw(bytes: Uint8Array) {
  const stream = new Blob([cloneBytes(bytes)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return await uint8ArrayFromStream(stream);
}

async function unzipEntries(buffer: ArrayBuffer): Promise<ZipEntry[]> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const minOffset = Math.max(0, bytes.length - 0xFFFF - 22);
  let eocdOffset = -1;

  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === eocdSignature) {
      eocdOffset = offset;
      break;
    }
  }

  if (eocdOffset < 0) {
    fail('ZIP end of central directory was not found');
  }

  const centralDirectorySize = view.getUint32(eocdOffset + 12, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;

  while (offset < centralDirectoryOffset + centralDirectorySize) {
    if (view.getUint32(offset, true) !== centralSignature) {
      fail('Invalid ZIP central directory entry');
    }

    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    const name = decodeText(nameBytes);

    if (!name.endsWith('/')) {
      if (view.getUint32(localHeaderOffset, true) !== localSignature) {
        fail(`Invalid ZIP local file header for ${name}`);
      }

      const localNameLength = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
      const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
      const data = compressionMethod === 0
        ? compressed.slice()
        : compressionMethod === 8
          ? await inflateRaw(compressed)
          : fail(`Unsupported ZIP compression method for ${name}: ${compressionMethod}`);

      if (data.byteLength !== uncompressedSize) {
        fail(`ZIP entry size mismatch for ${name}`);
      }

      entries.push({ name, data });
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function parsePngMetadata(bytes: Uint8Array) {
  if (bytes.length < 33) {
    fail('PNG file is too small');
  }

  for (let index = 0; index < pngSignature.length; index += 1) {
    if (bytes[index] !== pngSignature[index]) {
      fail('Invalid PNG signature');
    }
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ihdrLength = view.getUint32(8);
  const ihdrType = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);

  if (ihdrLength !== 13 || ihdrType !== 'IHDR') {
    fail('Invalid PNG IHDR chunk');
  }

  return {
    width:  view.getUint32(16),
    height: view.getUint32(20),
  };
}

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', cloneBytes(bytes));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function decodeImageBitmap(blob: Blob) {
  if (typeof createImageBitmap === 'function') {
    return await createImageBitmap(blob);
  }

  const url = URL.createObjectURL(blob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Failed to decode PNG image'));
      element.src = url;
    });

    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decodePngToImageData(bytes: Uint8Array, width: number, height: number) {
  const blob = new Blob([cloneBytes(bytes)], { type: 'image/png' });
  const bitmap = await decodeImageBitmap(blob);
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement('canvas'), { width, height });
  const context = canvas.getContext('2d');

  if (!context) {
    fail('Canvas 2D context is not available');
  }

  context.clearRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);

  if ('close' in bitmap && typeof bitmap.close === 'function') {
    bitmap.close();
  }

  return context.getImageData(0, 0, width, height);
}

async function convertPngToWebp(bytes: Uint8Array, width: number, height: number) {
  if (webpEncoderReady == null) {
    webpEncoderReady = initWebpEncode({
      locateFile: (path: string) => path === 'webp_enc_simd.wasm' ? webpEncoderSimdUrl : webpEncoderUrl,
    });
  }

  try {
    await webpEncoderReady;
  } catch (error) {
    webpEncoderReady = null;
    throw error;
  }

  const imageData = await decodePngToImageData(bytes, width, height);
  return new Uint8Array(await encodeWebp(imageData, cwebpEquivalentOptions));
}

function validateRequirementFile(content: string) {
  return imageRequirementFile.parse(JSON.parse(content));
}

export function canUseBrowserImageImport() {
  return typeof window !== 'undefined'
    && typeof DecompressionStream !== 'undefined'
    && typeof crypto?.subtle?.digest === 'function'
    && typeof File !== 'undefined'
    && (typeof createImageBitmap === 'function' || typeof Image !== 'undefined');
}

export async function prepareBrowserImageImport(archiveFile: File): Promise<PreparedBrowserImport> {
  const entries = (await unzipEntries(await archiveFile.arrayBuffer()))
    .filter(entry => !isIgnoredZipEntry(entry.name));
  const normalizedNames = normalizeZipEntryNames(entries.map(entry => entry.name));
  const files = entries.map(entry => ({
    ...entry,
    name: normalizedNames.get(entry.name) ?? entry.name,
  }));
  const jsonEntries = files.filter(entry => isJsonName(entry.name));

  if (jsonEntries.length !== 1) {
    fail(`ZIP input must contain exactly one JSON requirements file, found ${jsonEntries.length}`);
  }

  const requirementEntry = jsonEntries[0]!;
  const requirementContent = decodeText(requirementEntry.data);
  const requirementFile = validateRequirementFile(requirementContent);
  const requestByFileName = new Map(requirementFile.requests.map(request => [request.output.fileName, request]));
  const problems: CardImageImportProblem[] = [];
  const preparedFiles: PreparedImportFile[] = [];
  const manifestFiles: CardImageBrowserImportManifest['files'] = [];
  const pngEntries = new Map<string, Uint8Array>();

  for (const entry of files) {
    if (entry.name === requirementEntry.name) {
      continue;
    }

    if (!isPngName(entry.name)) {
      problems.push({
        fileName: entry.name,
        message:  'Archive contains unsupported file type',
      });
      continue;
    }

    if (pngEntries.has(entry.name)) {
      problems.push({
        fileName: entry.name,
        message:  'Archive contains duplicate PNG file name',
      });
      continue;
    }

    pngEntries.set(entry.name, entry.data);

    if (!requestByFileName.has(entry.name)) {
      problems.push({
        fileName: entry.name,
        message:  'PNG file is not declared in the requirements JSON',
      });
    }
  }

  for (const request of requirementFile.requests) {
    const pngBytes = pngEntries.get(request.output.fileName);

    if (!pngBytes) {
      continue;
    }

    try {
      const metadata = parsePngMetadata(pngBytes);

      if (metadata.width !== request.output.width || metadata.height !== request.output.height) {
        problems.push({
          fileName: request.output.fileName,
          message:  `PNG dimensions ${metadata.width}x${metadata.height} do not match expected ${request.output.width}x${request.output.height}`,
        });
        continue;
      }

      const webpBytes = await convertPngToWebp(pngBytes, request.output.width, request.output.height);
      const uploadFile = new File(
        [cloneBytes(webpBytes)],
        `${request.requestId.replace(/^sha256:/, '')}.webp`,
        { type: 'image/webp' },
      );

      manifestFiles.push({
        requestId: request.requestId,
        sha256:    await sha256(webpBytes),
        byteSize:  webpBytes.byteLength,
      });
      preparedFiles.push({
        requestId: request.requestId,
        file:      uploadFile,
      });
    } catch (error) {
      problems.push({
        fileName: request.output.fileName,
        message:  error instanceof Error ? error.message : 'Failed to convert PNG image',
      });
    }
  }

  return {
    manifest: {
      archiveFileName: archiveFile.name,
      files:           manifestFiles,
      rejected:        problems,
    },
    requirementsContent: requirementContent,
    files:               preparedFiles,
  };
}

export type { ImageRequirementFile, PreparedBrowserImport };
