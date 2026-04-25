#!/usr/bin/env bun

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, isAbsolute, join, resolve } from 'node:path';

import { fileURLToPath } from 'node:url';
import type { ImageRequirementRequest, ImageVariant } from '@tcg-cards/model/src/hearthstone/schema/data/image';
import { imageRequirementFile } from '@tcg-cards/model/src/hearthstone/schema/data/image';

const workspaceRoot = fileURLToPath(new URL('../../..', import.meta.url));
const imageBucketDirConfigKey = 'hearthstone.image-bucket-dir';
const hearthstoneImageSpecVersion = 'v1';
const cwebpPresetArgs = ['-q', '86', '-m', '4', '-alpha_q', '100', '-metadata', 'none'] as const;
const pngSignature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

interface Options {
  inputPath: string;
  bucketDir: string;
  force:     boolean;
  dryRun:    boolean;
}

interface CommandResult {
  exitCode: number;
  stdout:   string;
  stderr:   string;
}

interface LoadedPng {
  fileName: string;
  entry:    string;
  kind:     'path' | 'zip';
  path?:    string;
  zipPath?: string;
}

interface LoadedInput {
  requirementContent: string;
  requirementName:    string;
  pngs:               Map<string, LoadedPng>;
}

interface PngMetadata {
  width:  number;
  height: number;
}

interface ImportProblem {
  fileName: string;
  message:  string;
}

interface ImportSummary {
  requirementName: string;
  expectedCount:   number;
  writtenCount:    number;
  skippedCount:    number;
  missingCount:    number;
  rejectedCount:   number;
  dryRun:          boolean;
}

export type { ImportSummary };

function decodeOutput(output: Uint8Array): string {
  return new TextDecoder().decode(output).trim();
}

function sha256(value: Uint8Array | string) {
  return createHash('sha256').update(value).digest('hex');
}

function fail(message: string): never {
  throw new Error(message);
}

function isIgnoredName(name: string) {
  return name === '.DS_Store' || name.startsWith('._');
}

export function isIgnoredZipEntry(entry: string) {
  return entry.split('/').some(part => part === '__MACOSX' || part === '.DS_Store' || part.startsWith('._'));
}

function isPngName(name: string) {
  return extname(name).toLowerCase() === '.png';
}

function isJsonName(name: string) {
  return extname(name).toLowerCase() === '.json';
}

export function normalizeZipEntryNames(entries: string[]) {
  if (entries.length === 0) {
    return new Map<string, string>();
  }

  const allRootLevel = entries.every(entry => !entry.includes('/'));

  if (allRootLevel) {
    return new Map(entries.map(entry => [entry, entry]));
  }

  const topLevelDirs = new Set(entries.map(entry => entry.split('/')[0] ?? ''));

  if (topLevelDirs.size !== 1) {
    fail('ZIP input must contain root-level files or files inside one top-level folder');
  }

  const [topLevelDir] = [...topLevelDirs];

  if (!topLevelDir) {
    fail('ZIP input contains invalid entry names');
  }

  const normalized = new Map<string, string>();

  for (const entry of entries) {
    const prefix = `${topLevelDir}/`;

    if (!entry.startsWith(prefix)) {
      fail('ZIP input must contain root-level files or files inside one top-level folder');
    }

    const fileName = entry.slice(prefix.length);

    if (fileName.length === 0 || fileName.includes('/')) {
      fail(`ZIP input only supports files directly inside the top-level folder: ${entry}`);
    }

    normalized.set(entry, fileName);
  }

  return normalized;
}

function takeValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];

  if (!value || value.startsWith('--')) {
    fail(`Missing value for ${flag}`);
  }

  return value;
}

function resolvePath(basePath: string, targetPath: string) {
  return isAbsolute(targetPath) ? resolve(targetPath) : resolve(basePath, targetPath);
}

function runCommandResult(cmd: string[], cwd?: string): CommandResult {
  const result = Bun.spawnSync({
    cmd,
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  return {
    exitCode: result.exitCode,
    stdout:   decodeOutput(result.stdout),
    stderr:   decodeOutput(result.stderr),
  };
}

function tryRunCommand(cmd: string[], cwd?: string) {
  const result = runCommandResult(cmd, cwd);
  return result.exitCode === 0 ? result.stdout : null;
}

function runCommand(cmd: string[], cwd?: string) {
  const result = runCommandResult(cmd, cwd);

  if (result.exitCode !== 0) {
    fail(`Command failed: ${cmd.join(' ')}\n${result.stderr || result.stdout}`);
  }

  return result.stdout;
}

function loadConfiguredBucketDir() {
  const configuredPath = tryRunCommand([
    'git',
    '-C',
    workspaceRoot,
    'config',
    '--local',
    '--get',
    imageBucketDirConfigKey,
  ]);

  if (!configuredPath) {
    return null;
  }

  return resolvePath(workspaceRoot, configuredPath);
}

function printUsage() {
  console.log(`
Import Hearthstone card image PNG results into a local bucket directory.

Usage:
  bun run hsimg:import -- --input <dir-or-zip>

Options:
  --input <path>       Directory or .zip file with root files or one top-level folder containing one requirements JSON and PNG files
  --bucket-dir <path>  Local bucket root directory, overrides .git/config
  --force              Overwrite existing output when content differs
  --dry-run            Validate inputs and print targets without writing files
  --help               Show this message

Examples:
  git config --local ${imageBucketDirConfigKey} /absolute/path/to/asset-bucket
  bun run hsimg:import -- --input ./results
  bun run hsimg:import -- --input ./results.zip --dry-run
  bun run hsimg:import -- --input ./results.zip --bucket-dir /tmp/asset-bucket --force
`.trim());
}

function parseArgs(argv: string[]): Options {
  let inputPath = '';
  let bucketDir = '';
  let force = false;
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (!arg.startsWith('--') && inputPath.length === 0) {
      inputPath = arg;
      continue;
    }

    switch (arg) {
    case '--input':
      inputPath = takeValue(argv, index, arg);
      index += 1;
      break;
    case '--bucket-dir':
      bucketDir = takeValue(argv, index, arg);
      index += 1;
      break;
    case '--force':
      force = true;
      break;
    case '--dry-run':
      dryRun = true;
      break;
    default:
      fail(`Unknown argument: ${arg}`);
    }
  }

  if (inputPath.length === 0) {
    fail('Missing input path. Pass --input <dir-or-zip>.');
  }

  const resolvedBucketDir = bucketDir.length > 0
    ? resolvePath(process.cwd(), bucketDir)
    : loadConfiguredBucketDir();

  if (!resolvedBucketDir) {
    fail(`Missing bucket directory. Pass --bucket-dir <path> or set git config --local ${imageBucketDirConfigKey} /path/to/bucket.`);
  }

  return {
    inputPath: resolvePath(process.cwd(), inputPath),
    bucketDir: resolvedBucketDir,
    force,
    dryRun,
  };
}

export function buildCardImageRequestId(renderHash: string, variant: ImageVariant) {
  const digest = sha256([
    hearthstoneImageSpecVersion,
    renderHash,
    variant.zone,
    variant.template,
    variant.premium,
  ].join('\n'));

  return `sha256:${digest}`;
}

export function buildCardImagePngFileName(requestId: string) {
  return `${requestId.replace(/^sha256:/, '')}.png`;
}

export function buildCardImageR2Key(renderHash: string, variant: ImageVariant) {
  return [
    'hearthstone',
    'card',
    hearthstoneImageSpecVersion,
    variant.zone,
    variant.template,
    variant.premium,
    renderHash.slice(0, 2),
    `${renderHash}.webp`,
  ].join('/');
}

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

export function validateRequirementRequest(request: ImageRequirementRequest) {
  const expectedRequestId = buildCardImageRequestId(request.card.renderHash, request.variant);
  const expectedFileName = buildCardImagePngFileName(expectedRequestId);
  const expectedR2Key = buildCardImageR2Key(request.card.renderHash, request.variant);

  if (request.requestId !== expectedRequestId) {
    fail(`Request ${request.card.cardId} has mismatched requestId`);
  }

  if (request.output.fileName !== expectedFileName) {
    fail(`Request ${request.card.cardId} has mismatched output.fileName`);
  }

  if (request.target.r2Key !== expectedR2Key) {
    fail(`Request ${request.card.cardId} has mismatched target.r2Key`);
  }

  if (request.output.width !== request.style.width || request.output.height !== request.style.height) {
    fail(`Request ${request.card.cardId} has mismatched output and style dimensions`);
  }

  if (request.output.transparentBackground !== request.style.transparentBackground) {
    fail(`Request ${request.card.cardId} has mismatched transparency settings`);
  }
}

function ensureCwebp() {
  const result = runCommandResult(['cwebp', '-version']);

  if (result.exitCode !== 0) {
    fail([
      'cwebp was not found or failed to run.',
      'Install libwebp first, for example: brew install webp',
      result.stderr,
    ].filter(Boolean).join('\n'));
  }
}

function ensureUnzip() {
  const result = runCommandResult(['unzip', '-v']);

  if (result.exitCode !== 0) {
    fail([
      'unzip was not found or failed to run.',
      'Install unzip first, or pass a directory instead of a zip archive.',
      result.stderr,
    ].filter(Boolean).join('\n'));
  }
}

function listZipEntries(zipPath: string) {
  return runCommand(['unzip', '-Z1', zipPath])
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(entry => !entry.endsWith('/'));
}

function readZipEntry(zipPath: string, entry: string) {
  const result = Bun.spawnSync(['unzip', '-p', zipPath, entry], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (result.exitCode !== 0) {
    fail(`Failed to extract ${entry} from zip:\n${decodeOutput(result.stderr)}`);
  }

  return result.stdout;
}

async function loadDirectoryInput(inputPath: string): Promise<LoadedInput> {
  const entries = await readdir(inputPath, { withFileTypes: true });
  const files = entries.filter(entry => !isIgnoredName(entry.name));

  for (const entry of files) {
    if (!entry.isFile()) {
      fail(`Directory input only supports root-level files: ${entry.name}`);
    }
  }

  const jsonFiles = files.filter(entry => isJsonName(entry.name));
  const pngFiles = files.filter(entry => isPngName(entry.name));
  const unknownFiles = files.filter(entry => !isJsonName(entry.name) && !isPngName(entry.name));

  if (jsonFiles.length !== 1) {
    fail(`Directory input must contain exactly one JSON requirements file, found ${jsonFiles.length}`);
  }

  if (unknownFiles.length > 0) {
    fail(`Directory input contains unsupported files: ${unknownFiles.map(entry => entry.name).join(', ')}`);
  }

  const requirementName = jsonFiles[0]!.name;
  const requirementContent = await readFile(join(inputPath, requirementName), 'utf8');
  const pngs = new Map<string, LoadedPng>();

  for (const file of pngFiles) {
    if (pngs.has(file.name)) {
      fail(`Duplicate PNG file name: ${file.name}`);
    }

    pngs.set(file.name, {
      fileName: file.name,
      entry:    file.name,
      kind:     'path',
      path:     join(inputPath, file.name),
    });
  }

  return {
    requirementContent,
    requirementName,
    pngs,
  };
}

async function loadZipInput(inputPath: string): Promise<LoadedInput> {
  ensureUnzip();

  const entries = listZipEntries(inputPath);
  const filteredEntries = entries.filter(entry => !isIgnoredZipEntry(entry));
  const normalizedNames = normalizeZipEntryNames(filteredEntries);
  const files = filteredEntries.map(entry => ({
    entry,
    fileName: normalizedNames.get(entry) ?? entry,
  }));

  const jsonFiles = files.filter(file => isJsonName(file.fileName));
  const pngFiles = files.filter(file => isPngName(file.fileName));
  const unknownFiles = files.filter(file => !isJsonName(file.fileName) && !isPngName(file.fileName));

  if (jsonFiles.length !== 1) {
    fail(`ZIP input must contain exactly one JSON requirements file, found ${jsonFiles.length}`);
  }

  if (unknownFiles.length > 0) {
    fail(`ZIP input contains unsupported files: ${unknownFiles.map(file => file.entry).join(', ')}`);
  }

  const requirementName = jsonFiles[0]!.fileName;
  const requirementContent = decodeOutput(readZipEntry(inputPath, jsonFiles[0]!.entry));
  const pngs = new Map<string, LoadedPng>();

  for (const file of pngFiles) {
    if (pngs.has(file.fileName)) {
      fail(`Duplicate PNG file name in zip: ${file.fileName}`);
    }

    pngs.set(file.fileName, {
      fileName: file.fileName,
      entry:    file.entry,
      kind:     'zip',
      zipPath:  inputPath,
    });
  }

  return {
    requirementContent,
    requirementName,
    pngs,
  };
}

async function loadInput(inputPath: string) {
  const fileStat = await stat(inputPath).catch(() => null);

  if (!fileStat) {
    fail(`Input path does not exist: ${inputPath}`);
  }

  if (fileStat.isDirectory()) {
    return await loadDirectoryInput(inputPath);
  }

  if (!fileStat.isFile()) {
    fail(`Input path must be a directory or zip file: ${inputPath}`);
  }

  if (extname(inputPath).toLowerCase() !== '.zip') {
    fail(`Unsupported input file type: ${extname(inputPath) || '(none)'}`);
  }

  return await loadZipInput(inputPath);
}

async function loadPngBytes(source: LoadedPng) {
  if (source.kind === 'path') {
    return await readFile(source.path!);
  }

  return readZipEntry(source.zipPath!, source.entry);
}

async function writeTempPng(tempDir: string, source: LoadedPng) {
  const targetPath = join(tempDir, source.fileName);
  await Bun.write(targetPath, await loadPngBytes(source));
  return targetPath;
}

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

async function importToLocalBucket(options: Options): Promise<ImportSummary> {
  ensureCwebp();

  const loadedInput = await loadInput(options.inputPath);
  const parsedRequirement = imageRequirementFile.parse(JSON.parse(loadedInput.requirementContent));
  const tempDir = await mkdtemp(join(tmpdir(), 'hearthstone-image-import-'));
  const requestByFileName = new Map<string, ImageRequirementRequest>();
  const problems: ImportProblem[] = [];
  let writtenCount = 0;
  let skippedCount = 0;
  let missingCount = 0;

  try {
    if (parsedRequirement.requests.length !== parsedRequirement.limits.requestCount) {
      fail('Requirements JSON has mismatched request count');
    }

    for (const request of parsedRequirement.requests) {
      validateRequirementRequest(request);

      if (requestByFileName.has(request.output.fileName)) {
        fail(`Duplicate request output file name: ${request.output.fileName}`);
      }

      requestByFileName.set(request.output.fileName, request);
    }

    for (const fileName of loadedInput.pngs.keys()) {
      if (!requestByFileName.has(fileName)) {
        problems.push({
          fileName,
          message: 'PNG file is not declared in the requirements JSON',
        });
      }
    }

    for (const request of parsedRequirement.requests) {
      const source = loadedInput.pngs.get(request.output.fileName);

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
            message:  `PNG dimensions ${pngMeta.width}x${pngMeta.height} do not match expected ${request.output.width}x${request.output.height}`,
          });
          continue;
        }

        const inputPngPath = source.kind === 'path'
          ? source.path!
          : await writeTempPng(tempDir, source);
        const tempWebpPath = join(tempDir, `${request.requestId.replace(':', '_')}.webp`);

        await convertPngToWebp(inputPngPath, tempWebpPath);

        const webpBytes = await readFile(tempWebpPath);
        const outputPath = join(options.bucketDir, buildCardImageR2Key(request.card.renderHash, request.variant));

        if (existsSync(outputPath)) {
          const existingBytes = await readFile(outputPath);

          if (sha256(existingBytes) === sha256(webpBytes)) {
            skippedCount += 1;
            continue;
          }

          if (!options.force) {
            problems.push({
              fileName: request.output.fileName,
              message:  `Output already exists with different content: ${outputPath}`,
            });
            continue;
          }
        }

        if (!options.dryRun) {
          await mkdir(dirname(outputPath), { recursive: true });
          await Bun.write(outputPath, webpBytes);
        }

        writtenCount += 1;
      } catch (error) {
        problems.push({
          fileName: request.output.fileName,
          message:  error instanceof Error ? error.message : 'Unexpected import error',
        });
      }
    }

    return {
      requirementName: loadedInput.requirementName,
      expectedCount:   parsedRequirement.requests.length,
      writtenCount,
      skippedCount,
      missingCount,
      rejectedCount:   problems.length,
      dryRun:          options.dryRun,
    };
  } finally {
    await rm(tempDir, { force: true, recursive: true });

    if (problems.length > 0) {
      console.error('\nProblems:');
      for (const problem of problems) {
        console.error(`- ${problem.fileName}: ${problem.message}`);
      }
    }
  }
}

function printSummary(summary: ImportSummary, bucketDir: string) {
  console.log('\nHearthstone image import summary');
  console.log(`- requirements: ${summary.requirementName}`);
  console.log(`- bucket dir: ${bucketDir}`);
  console.log(`- expected: ${summary.expectedCount}`);
  console.log(`- written: ${summary.writtenCount}`);
  console.log(`- skipped: ${summary.skippedCount}`);
  console.log(`- missing: ${summary.missingCount}`);
  console.log(`- rejected: ${summary.rejectedCount}`);
  console.log(`- mode: ${summary.dryRun ? 'dry-run' : 'write'}`);
}

export function shouldFailImport(summary: ImportSummary) {
  return summary.rejectedCount > 0;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const summary = await importToLocalBucket(options);

  printSummary(summary, options.bucketDir);

  if (shouldFailImport(summary)) {
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
