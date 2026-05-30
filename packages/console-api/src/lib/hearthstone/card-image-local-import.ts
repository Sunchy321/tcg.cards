import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import {
  imageRequirementFile,
  type ImageRequirementRequest,
  type ImageVariant,
} from '@tcg-cards/model/src/hearthstone/schema/data/image';

import {
  buildCardImageR2Key,
  buildCardImagePngFileName,
  buildCardImageRequestId,
  validateRequirementRequest,
} from './card-image';

export const hearthstoneImageSpecVersion = 'v1';

const cwebpPresetArgs = ['-q', '86', '-m', '4', '-alpha_q', '100', '-metadata', 'none'] as const;
const pngSignature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Local bucket import file backed by an existing PNG path or in-memory bytes. */
export interface CardImageLocalImportFile {
  fileName: string;
  path?: string;
  bytes?: Uint8Array;
}

/** Input payload required to validate PNG files and write WebP assets locally. */
export interface CardImageLocalImportInput {
  requirementContent: string;
  requirementName: string;
  files: CardImageLocalImportFile[];
  bucketDir: string;
  force: boolean;
  dryRun: boolean;
}

/** Rejected local import file paired with one readable error message. */
export interface CardImageLocalImportProblem {
  fileName: string;
  message: string;
}

/** Summary returned after one local bucket import finishes. */
export interface CardImageLocalImportSummary {
  requirementName: string;
  expectedCount: number;
  writtenCount: number;
  skippedCount: number;
  missingCount: number;
  rejectedCount: number;
  dryRun: boolean;
}

/** Complete local import result including the summary and every rejected file. */
export interface CardImageLocalImportResult {
  summary: CardImageLocalImportSummary;
  problems: CardImageLocalImportProblem[];
}

/** PNG width and height decoded from the IHDR chunk. */
export interface PngMetadata {
  width: number;
  height: number;
}

/** Decodes one command output buffer into trimmed UTF-8 text. */
function decodeOutput(output: Uint8Array) {
  return new TextDecoder().decode(output).trim();
}

/** Computes one lowercase hexadecimal SHA-256 digest. */
function sha256(value: Uint8Array | string) {
  return createHash('sha256').update(value).digest('hex');
}

/** Raises one import error with a readable message. */
function fail(message: string): never {
  throw new Error(message);
}

/** Returns the existing PNG path when possible, or materializes one temp PNG file. */
async function ensurePngPath(tempDir: string, file: CardImageLocalImportFile) {
  if (file.path) {
    return file.path;
  }

  const bytes = file.bytes;

  if (bytes == null) {
    fail(`PNG file ${file.fileName} is missing both path and bytes`);
  }

  const targetPath = join(tempDir, file.fileName);
  await Bun.write(targetPath, bytes);
  return targetPath;
}

/** Loads PNG bytes from the provided path or in-memory payload. */
async function loadPngBytes(file: CardImageLocalImportFile) {
  if (file.bytes != null) {
    return file.bytes;
  }

  if (file.path == null) {
    fail(`PNG file ${file.fileName} is missing both path and bytes`);
  }

  return await readFile(file.path);
}

/** Verifies that `cwebp` is installed before conversion starts. */
function ensureCwebp() {
  const result = Bun.spawnSync(['cwebp', '-version'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (result.exitCode !== 0) {
    fail([
      'cwebp was not found or failed to run.',
      'Install libwebp first, for example: brew install webp',
      decodeOutput(result.stderr),
    ].filter(Boolean).join('\n'));
  }
}

/** Converts one PNG file into one temporary WebP file with the shared preset. */
async function convertPngToWebp(inputPath: string, outputPath: string) {
  const result = Bun.spawnSync([
    'cwebp',
    '-quiet',
    ...cwebpPresetArgs,
    inputPath,
    '-o',
    outputPath,
  ], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (result.exitCode !== 0) {
    fail(`cwebp failed for ${inputPath}:\n${decodeOutput(result.stderr)}`);
  }
}

/** Builds one file-name map and rejects duplicate local PNG names up front. */
function buildFileMap(files: CardImageLocalImportFile[]) {
  const fileMap = new Map<string, CardImageLocalImportFile>();

  for (const file of files) {
    if (fileMap.has(file.fileName)) {
      fail(`Duplicate PNG file name: ${file.fileName}`);
    }

    fileMap.set(file.fileName, file);
  }

  return fileMap;
}

/** Parses PNG dimensions from the IHDR chunk and rejects malformed files. */
export function parsePngMetadata(bytes: Uint8Array): PngMetadata {
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

  const width = view.getUint32(16);
  const height = view.getUint32(20);

  if (width <= 0 || height <= 0) {
    fail('Invalid PNG dimensions');
  }

  return { width, height };
}

/** Builds one requirement request id from the render hash and image variant. */
export function buildCardImageLocalRequestId(renderHash: string, variant: ImageVariant) {
  return buildCardImageRequestId(renderHash, variant);
}

/** Builds one PNG file name from the request id used by the shared import flow. */
export function buildCardImageLocalPngFileName(requestId: string) {
  return buildCardImagePngFileName(requestId);
}

/** Builds one local asset key from the render hash and image variant. */
export function buildCardImageLocalR2Key(renderHash: string, variant: ImageVariant) {
  return buildCardImageR2Key(renderHash, variant);
}

/** Validates one image requirement request against the shared local import rules. */
export function validateCardImageLocalRequirementRequest(
  request: Parameters<typeof validateRequirementRequest>[0],
) {
  validateRequirementRequest(request);
}

/** Returns whether the final import should be treated as failed by CLI callers. */
export function shouldFailCardImageLocalImport(summary: CardImageLocalImportSummary) {
  return summary.rejectedCount > 0;
}

/** Imports one requirement batch into a local bucket directory using shared validation rules. */
export async function importCardImageFilesToLocalBucket(
  input: CardImageLocalImportInput,
): Promise<CardImageLocalImportResult> {
  ensureCwebp();

  const requirementFile = imageRequirementFile.parse(JSON.parse(input.requirementContent));
  const tempDir = await mkdtemp(join(tmpdir(), 'hearthstone-image-import-'));
  const requestByFileName = new Map<string, ImageRequirementRequest>();
  const problems: CardImageLocalImportProblem[] = [];
  const fileMap = buildFileMap(input.files);
  let writtenCount = 0;
  let skippedCount = 0;
  let missingCount = 0;

  try {
    if (requirementFile.requests.length !== requirementFile.limits.requestCount) {
      fail('Requirements JSON has mismatched request count');
    }

    for (const request of requirementFile.requests) {
      validateRequirementRequest(request);

      if (requestByFileName.has(request.output.fileName)) {
        fail(`Duplicate request output file name: ${request.output.fileName}`);
      }

      requestByFileName.set(request.output.fileName, request);
    }

    for (const fileName of fileMap.keys()) {
      if (!requestByFileName.has(fileName)) {
        problems.push({
          fileName,
          message: 'PNG file is not declared in the requirements JSON',
        });
      }
    }

    for (const request of requirementFile.requests) {
      const source = fileMap.get(request.output.fileName);

      if (!source) {
        missingCount += 1;
        continue;
      }

      try {
        const pngBytes = await loadPngBytes(source);
        const pngMeta = parsePngMetadata(pngBytes);

        if (pngMeta.width !== request.output.width || pngMeta.height !== request.output.height) {
          problems.push({
            fileName: request.output.fileName,
            message: `PNG dimensions ${pngMeta.width}x${pngMeta.height} do not match expected ${request.output.width}x${request.output.height}`,
          });
          continue;
        }

        const inputPngPath = await ensurePngPath(tempDir, source);
        const tempWebpPath = join(tempDir, `${request.requestId.replace(':', '_')}.webp`);

        await convertPngToWebp(inputPngPath, tempWebpPath);

        const webpBytes = await readFile(tempWebpPath);
        const outputPath = join(input.bucketDir, buildCardImageR2Key(request.card.renderHash, request.variant));

        if (existsSync(outputPath)) {
          const existingBytes = await readFile(outputPath);

          if (sha256(existingBytes) === sha256(webpBytes)) {
            skippedCount += 1;
            continue;
          }

          if (!input.force) {
            problems.push({
              fileName: request.output.fileName,
              message: `Output already exists with different content: ${outputPath}`,
            });
            continue;
          }
        }

        if (!input.dryRun) {
          await mkdir(dirname(outputPath), { recursive: true });
          await Bun.write(outputPath, webpBytes);
        }

        writtenCount += 1;
      } catch (error) {
        problems.push({
          fileName: request.output.fileName,
          message: error instanceof Error ? error.message : 'Unexpected import error',
        });
      }
    }

    return {
      summary: {
        requirementName: input.requirementName,
        expectedCount: requirementFile.requests.length,
        writtenCount,
        skippedCount,
        missingCount,
        rejectedCount: problems.length,
        dryRun: input.dryRun,
      },
      problems,
    };
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}
