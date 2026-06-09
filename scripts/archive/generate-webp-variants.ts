#!/usr/bin/env bun
/// <reference types="bun" />

import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { availableParallelism, tmpdir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';

interface Options {
  inputPath:   string;
  outputDir:   string;
  prefix:      string;
  concurrency: number;
}

interface Variant {
  id:          string;
  description: string;
  args:        string[];
}

interface ManifestVariant {
  id:             string;
  sourceId:       string;
  description:    string;
  outputPath:     string;
  sourceByteSize: number;
  byteSize:       number;
  sizeRatio:      number;
  encodeMs:       number;
  command:        string[];
}

interface SourceImage {
  inputPath:     string;
  sourceId:      string;
  label:         string;
  outputPrefix:  string;
  byteSize:      number;
}

interface Task {
  source:  SourceImage;
  variant: Variant;
}

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.tif', '.tiff']);

const lossyQualityLevels = [60, 65, 70, 75, 80, 82, 84, 86, 88, 90, 92, 95];
const fastQualityLevels = [86, 88, 90, 92];

function makeLossyVariant(quality: number): Variant {
  return {
    id:          `q${quality}-m6`,
    description: `Lossy quality ${quality}, default quality sweep candidate`,
    args:        ['-q', String(quality), '-m', '6', '-alpha_q', '100', '-metadata', 'none'],
  };
}

function makeFastLossyVariant(quality: number): Variant {
  return {
    id:          `q${quality}-m4-fast`,
    description: `Lossy quality ${quality}, faster encoder effort production candidate`,
    args:        ['-q', String(quality), '-m', '4', '-alpha_q', '100', '-metadata', 'none'],
  };
}

const variants: Variant[] = [
  ...lossyQualityLevels.map(makeLossyVariant),
  ...fastQualityLevels.map(makeFastLossyVariant),
  {
    id:          'q90-m6-sharp-yuv',
    description: 'Lossy quality 90 with sharp YUV conversion',
    args:        ['-q', '90', '-m', '6', '-sharp_yuv', '-alpha_q', '100', '-metadata', 'none'],
  },
  {
    id:          'q92-m6-sharp-yuv',
    description: 'Lossy quality 92 with sharp YUV conversion',
    args:        ['-q', '92', '-m', '6', '-sharp_yuv', '-alpha_q', '100', '-metadata', 'none'],
  },
  {
    id:          'q92-m4-sharp-yuv',
    description: 'Lossy quality 92 with sharp YUV conversion and faster encoder effort',
    args:        ['-q', '92', '-m', '4', '-sharp_yuv', '-alpha_q', '100', '-metadata', 'none'],
  },
  {
    id:          'near-lossless-80',
    description: 'Near-lossless 80 for artifact comparison',
    args:        ['-lossless', '-near_lossless', '80', '-m', '6', '-alpha_q', '100', '-metadata', 'none'],
  },
  {
    id:          'near-lossless-60',
    description: 'Near-lossless 60 for smaller near-lossless comparison',
    args:        ['-lossless', '-near_lossless', '60', '-m', '6', '-alpha_q', '100', '-metadata', 'none'],
  },
  {
    id:          'lossless-m6',
    description: 'Full lossless reference',
    args:        ['-lossless', '-m', '6', '-alpha_q', '100', '-metadata', 'none'],
  },
];

function printUsage() {
  console.log(`
Generate multiple WebP files from one source image or zip archive for visual comparison.

Requires the libwebp CLI:
  brew install webp
  # zip input also requires unzip, which is available by default on macOS

Usage:
  bun scripts/generate-webp-variants.ts --input <image-or-zip> [--out <dir>] [--prefix <name>]

Options:
  --input <path>       Source image or .zip archive with images
  --out <dir>          Output directory (default: output/webp-variants)
  --prefix <name>      Output file prefix (default: input file basename)
  --concurrency <int>  Parallel cwebp jobs (default: min(cpu, task count))
  --help               Show this message

Examples:
  bun scripts/generate-webp-variants.ts --input ./card.png
  bun scripts/generate-webp-variants.ts --input ./card.png --out ./output/webp-test --prefix mage_spell
  bun scripts/generate-webp-variants.ts --input ./cards.zip --out ./output/webp-batch --concurrency 6
`.trim());
}

function fail(message: string): never {
  throw new Error(message);
}

function takeValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];

  if (!value || value.startsWith('--')) {
    fail(`Missing value for ${flag}`);
  }

  return value;
}

function parsePositiveInteger(value: string, flag: string): number {
  if (!/^\d+$/.test(value)) {
    fail(`${flag} must be a positive integer`);
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    fail(`${flag} must be a positive integer`);
  }

  return parsed;
}

function parseArgs(args: string[]): Options {
  let inputPath = '';
  let outputDir = 'output/webp-variants';
  let prefix = '';
  let concurrency = 0;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;

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
      inputPath = takeValue(args, index, arg);
      index += 1;
      break;
    case '--out':
      outputDir = takeValue(args, index, arg);
      index += 1;
      break;
    case '--prefix':
      prefix = takeValue(args, index, arg);
      index += 1;
      break;
    case '--concurrency':
      concurrency = parsePositiveInteger(takeValue(args, index, arg), arg);
      index += 1;
      break;
    default:
      fail(`Unknown argument: ${arg}`);
    }
  }

  if (inputPath.length === 0) {
    fail('Missing --input <image>');
  }

  const resolvedInput = resolve(inputPath);

  if (!existsSync(resolvedInput)) {
    fail(`Input file does not exist: ${resolvedInput}`);
  }

  const inputExt = extname(resolvedInput);
  const defaultPrefix = basename(resolvedInput, inputExt);

  return {
    inputPath:   resolvedInput,
    outputDir:   resolve(outputDir),
    prefix:      prefix || defaultPrefix,
    concurrency,
  };
}

function decodeOutput(output: Uint8Array): string {
  return new TextDecoder().decode(output).trim();
}

function isZipPath(path: string): boolean {
  return extname(path).toLowerCase() === '.zip';
}

function isSupportedImage(path: string): boolean {
  return imageExtensions.has(extname(path).toLowerCase());
}

function isIgnoredZipEntry(path: string): boolean {
  return path
    .split('/')
    .some(part => part === '__MACOSX' || part.startsWith('._'));
}

function safeName(value: string): string {
  return value
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'image';
}

async function ensureCwebp() {
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

  console.log(`Using cwebp ${decodeOutput(result.stdout)}`);
}

async function ensureUnzip() {
  const result = Bun.spawnSync(['unzip', '-v'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (result.exitCode !== 0) {
    fail([
      'unzip was not found or failed to run.',
      'Install unzip first, or pass a single image file instead of a zip archive.',
      decodeOutput(result.stderr),
    ].filter(Boolean).join('\n'));
  }
}

function listZipEntries(zipPath: string): string[] {
  const result = Bun.spawnSync(['unzip', '-Z1', zipPath], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (result.exitCode !== 0) {
    fail(`Failed to list zip entries:\n${decodeOutput(result.stderr)}`);
  }

  return decodeOutput(result.stdout)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(entry => !entry.endsWith('/'))
    .filter(entry => !isIgnoredZipEntry(entry))
    .filter(isSupportedImage)
    .sort((left, right) => left.localeCompare(right));
}

async function extractZipEntry(zipPath: string, entry: string, tempDir: string): Promise<SourceImage> {
  const result = Bun.spawnSync(['unzip', '-p', zipPath, entry], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (result.exitCode !== 0) {
    fail(`Failed to extract ${entry}:\n${decodeOutput(result.stderr)}`);
  }

  const ext = extname(entry).toLowerCase();
  const sourceId = safeName(entry);
  const inputPath = join(tempDir, `${sourceId}${ext}`);
  const bytes = result.stdout;

  await Bun.write(inputPath, bytes);

  return {
    inputPath,
    sourceId,
    label:        entry,
    outputPrefix: sourceId,
    byteSize:     bytes.byteLength,
  };
}

async function loadSources(options: Options): Promise<{ sources: SourceImage[], cleanup: () => Promise<void> }> {
  if (!isZipPath(options.inputPath)) {
    if (!isSupportedImage(options.inputPath)) {
      fail(`Unsupported input image type: ${extname(options.inputPath) || '(none)'}`);
    }

    return {
      sources: [{
        inputPath:    options.inputPath,
        sourceId:     safeName(options.prefix),
        label:        options.inputPath,
        outputPrefix: options.prefix,
        byteSize:     (await stat(options.inputPath)).size,
      }],
      cleanup: async () => {},
    };
  }

  await ensureUnzip();

  const entries = listZipEntries(options.inputPath);

  if (entries.length === 0) {
    fail('Zip archive does not contain supported image files.');
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'webp-variants-'));
  const sources = await Promise.all(entries.map(entry => extractZipEntry(options.inputPath, entry, tempDir)));

  return {
    sources: sources.map(source => ({
      ...source,
      outputPrefix: `${options.prefix}__${source.sourceId}`,
    })),
    cleanup: async () => {
      await rm(tempDir, { force: true, recursive: true });
    },
  };
}

async function runVariant(options: Options, source: SourceImage, variant: Variant): Promise<ManifestVariant> {
  const outputName = `${source.outputPrefix}__${variant.id}.webp`;
  const outputPath = join(options.outputDir, outputName);
  const command = [
    'cwebp',
    ...variant.args,
    source.inputPath,
    '-o',
    outputPath,
  ];

  const startedAt = Date.now();
  const result = Bun.spawnSync(command, {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const encodeMs = Date.now() - startedAt;

  if (result.exitCode !== 0) {
    const stderr = decodeOutput(result.stderr);
    fail(`Failed to generate ${variant.id}\n${stderr}`);
  }

  const outputStat = await stat(outputPath);

  return {
    id:             variant.id,
    sourceId:       source.sourceId,
    description:    variant.description,
    outputPath,
    sourceByteSize: source.byteSize,
    byteSize:       outputStat.size,
    sizeRatio:      round(outputStat.size / source.byteSize),
    encodeMs,
    command,
  };
}

async function runTasks(options: Options, sources: SourceImage[]): Promise<ManifestVariant[]> {
  const tasks = sources.flatMap(source => variants.map(variant => ({ source, variant })));
  const concurrency = Math.min(
    options.concurrency || availableParallelism(),
    tasks.length,
  );
  const generated: ManifestVariant[] = [];
  let nextIndex = 0;
  let finished = 0;

  console.log(`Running ${tasks.length} cwebp jobs with concurrency ${concurrency}.`);

  async function worker() {
    while (true) {
      const taskIndex = nextIndex;
      nextIndex += 1;

      const task = tasks[taskIndex];

      if (!task) {
        return;
      }

      const item = await runVariant(options, task.source, task.variant);
      generated.push(item);
      finished += 1;

      console.log(
        `[${finished}/${tasks.length}] ${task.source.sourceId} / ${task.variant.id}: ${formatBytes(item.byteSize)}, ${item.encodeMs} ms`,
      );
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return generated;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function round(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}

async function writeManifest(options: Options, sources: SourceImage[], generated: ManifestVariant[]) {
  const manifest = {
    generatedAt: new Date().toISOString(),
    source:      options.inputPath,
    outputDir:   options.outputDir,
    sources:     sources.map(source => ({
      sourceId:     source.sourceId,
      label:        source.label,
      outputPrefix: source.outputPrefix,
    })),
    variants:    generated,
  };

  const manifestPath = join(options.outputDir, `${options.prefix}__manifest.json`);
  const summaryPath = join(options.outputDir, `${options.prefix}__summary.md`);

  const rows = generated
    .slice()
    .sort((left, right) =>
      left.sourceId.localeCompare(right.sourceId)
      || left.byteSize - right.byteSize,
    )
    .map(item => [
      `| \`${item.sourceId}\``,
      `\`${item.id}\``,
      formatBytes(item.byteSize),
      item.sizeRatio.toFixed(3),
      `${item.encodeMs} ms`,
      item.description,
      `\`${item.outputPath}\` |`,
    ].join(' | '));

  const summary = [
    `# WebP Variant Summary`,
    '',
    `Source: \`${options.inputPath}\``,
    '',
    '| Source | Variant | Size | Ratio | Encode | Notes | File |',
    '|---|---|---:|---:|---:|---|---|',
    ...rows,
    '',
  ].join('\n');

  await Bun.write(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  await Bun.write(summaryPath, summary);

  return { manifestPath, summaryPath };
}

async function main() {
  const options = parseArgs(Bun.argv.slice(2));

  await ensureCwebp();
  await mkdir(options.outputDir, { recursive: true });

  const { sources, cleanup } = await loadSources(options);
  let generated: ManifestVariant[] = [];

  try {
    console.log(`Found ${sources.length} source image${sources.length === 1 ? '' : 's'}.`);
    for (const source of sources) {
      console.log(`- ${source.sourceId}: ${source.label}`);
    }

    generated = await runTasks(options, sources);
  } finally {
    await cleanup();
  }

  const { manifestPath, summaryPath } = await writeManifest(options, sources, generated);

  console.log('\nGenerated files:');
  for (const item of generated) {
    console.log(`- ${item.sourceId} / ${item.id}: ${item.outputPath} (${formatBytes(item.byteSize)}, ${item.encodeMs} ms)`);
  }

  console.log(`\nManifest: ${manifestPath}`);
  console.log(`Summary:  ${summaryPath}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
