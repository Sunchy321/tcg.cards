#!/usr/bin/env bun

import { extname, isAbsolute, join, resolve } from 'node:path';
import { stat, readdir, readFile } from 'node:fs/promises';

import { fileURLToPath } from 'node:url';
import {
  buildCardImageLocalPngFileName,
  buildCardImageLocalR2Key,
  buildCardImageLocalRequestId,
  importCardImageFilesToLocalBucket,
  parsePngMetadata,
  shouldFailCardImageLocalImport,
  validateCardImageLocalRequirementRequest,
  type CardImageLocalImportFile,
  type CardImageLocalImportSummary,
} from '@tcg-cards/console-api/lib/hearthstone/card-image-local-import';

const workspaceRoot = fileURLToPath(new URL('../../..', import.meta.url));
const imageBucketDirConfigKey = 'hearthstone.image-bucket-dir';

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

interface LoadedInput {
  requirementContent: string;
  requirementName:    string;
  pngs:               Map<string, CardImageLocalImportFile>;
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

function decodeOutput(output: Uint8Array): string {
  return new TextDecoder().decode(output).trim();
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
  const pngs = new Map<string, CardImageLocalImportFile>();

  for (const file of pngFiles) {
    if (pngs.has(file.name)) {
      fail(`Duplicate PNG file name: ${file.name}`);
    }

    pngs.set(file.name, {
      fileName: file.name,
      bytes:    await readFile(join(inputPath, file.name)),
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
  const pngs = new Map<string, CardImageLocalImportFile>();

  for (const file of pngFiles) {
    if (pngs.has(file.fileName)) {
      fail(`Duplicate PNG file name in zip: ${file.fileName}`);
    }

    pngs.set(file.fileName, {
      fileName: file.fileName,
      bytes:    readZipEntry(inputPath, file.entry),
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
async function importToLocalBucket(options: Options) {
  const loadedInput = await loadInput(options.inputPath);
  return await importCardImageFilesToLocalBucket({
    requirementContent: loadedInput.requirementContent,
    requirementName:    loadedInput.requirementName,
    files:              [...loadedInput.pngs.values()],
    bucketDir:          options.bucketDir,
    force:              options.force,
    dryRun:             options.dryRun,
  });
}

function printSummary(summary: CardImageLocalImportSummary, bucketDir: string) {
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

export function shouldFailImport(summary: CardImageLocalImportSummary) {
  return shouldFailCardImageLocalImport(summary);
}

export const buildCardImageRequestId = buildCardImageLocalRequestId;
export const buildCardImagePngFileName = buildCardImageLocalPngFileName;
export const buildCardImageR2Key = buildCardImageLocalR2Key;
export { parsePngMetadata };
export const validateRequirementRequest = validateCardImageLocalRequirementRequest;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await importToLocalBucket(options);
  const summary = result.summary;

  if (result.problems.length > 0) {
    console.error('\nProblems:');
    for (const problem of result.problems) {
      console.error(`- ${problem.fileName}: ${problem.message}`);
    }
  }

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
