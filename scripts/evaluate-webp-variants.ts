#!/usr/bin/env bun
/// <reference types="bun" />

import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { availableParallelism, tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';

interface Options {
  manifestPath:     string;
  outputPath:       string;
  concurrency:      number;
  changedThreshold: number;
}

interface ManifestVariant {
  id:             string;
  sourceId:       string;
  description:    string;
  outputPath:     string;
  sourceByteSize: number | null;
  byteSize:       number | null;
  sizeRatio:      number | null;
  encodeMs:       number | null;
  command:        string[] | null;
}

interface ManifestSource {
  sourceId:     string;
  label:        string | null;
  outputPrefix: string | null;
}

interface Manifest {
  generatedAt: string | null;
  source:      string;
  outputDir:   string | null;
  sources:     ManifestSource[];
  variants:    ManifestVariant[];
}

interface SourceFile {
  sourceId:         string;
  label:            string;
  inputPath:        string;
  originalByteSize: number;
  zipEntry:         string | null;
}

interface PamImage {
  width:  number;
  height: number;
  depth:  3 | 4;
  data:   Uint8Array;
}

interface ReferenceImage {
  source: SourceFile;
  image:  PamImage;
}

interface MetricStats {
  count: number;
  sumX:  number;
  sumY:  number;
  sumXX: number;
  sumYY: number;
  sumXY: number;
}

type Rating = 'excellent' | 'good' | 'review';

interface ImageMetrics {
  rgbExact:                  boolean;
  alphaExact:                boolean;
  mseRgb:                    number;
  rmseRgb:                   number;
  maeRgb:                    number;
  maxDiffRgb:                number;
  psnrRgb:                   number | null;
  mseCompositeRgb:           number;
  rmseCompositeRgb:          number;
  maeCompositeRgb:           number;
  maxDiffCompositeRgb:       number;
  psnrCompositeRgb:          number | null;
  ssimGlobalLuma:            number;
  ssimCompositeLuma:         number;
  changedPixelRatio:         number;
  changedCompositePixelRatio:number;
  visiblePixelRatio:         number;
  visibleChangedPixelRatio:  number;
  alpha: {
    hasAlpha:           boolean;
    mae:                number;
    maxDiff:            number;
    changedPixelRatio:  number;
  };
}

interface VariantReport {
  sourceId:         string;
  variantId:        string;
  description:      string;
  outputPath:       string;
  sourceByteSize:   number;
  byteSize:         number;
  manifestByteSize: number | null;
  sizeRatio:        number;
  manifestSizeRatio:number | null;
  encodeMs:         number | null;
  width:            number;
  height:           number;
  rating:           Rating;
  qualityScore:     number;
  metrics:          ImageMetrics;
}

interface VariantError {
  sourceId:  string;
  variantId: string;
  outputPath:string;
  error:     string;
}

interface SourceReport {
  sourceId:         string;
  label:            string;
  sourcePath:       string;
  zipEntry:         string | null;
  sourceByteSize:   number;
  width:            number;
  height:           number;
  variants:         VariantReport[];
  errors:           VariantError[];
  bestCandidate:    CandidateSummary | null;
}

interface CandidateSummary {
  variantId:    string;
  rating:       Rating;
  byteSize:     number;
  sizeRatio:    number;
  encodeMs:     number | null;
  qualityScore: number;
}

interface VariantAggregate {
  variantId:                     string;
  description:                   string;
  sourceCount:                   number;
  encodedCount:                  number;
  errorCount:                    number;
  excellentCount:                number;
  goodCount:                     number;
  reviewCount:                   number;
  acceptableCount:               number;
  acceptableRate:                number;
  averageByteSize:               number;
  medianByteSize:                number;
  averageSizeRatio:              number;
  medianSizeRatio:               number;
  averageEncodeMs:               number | null;
  medianEncodeMs:                number | null;
  maxEncodeMs:                   number | null;
  averageQualityScore:           number;
  minQualityScore:               number;
  averagePsnrCompositeRgb:       number | null;
  minPsnrCompositeRgb:           number | null;
  averageSsimCompositeLuma:      number;
  minSsimCompositeLuma:          number;
  averageVisibleChangedPixelRatio:number;
  productionCostScore:           number | null;
  uniformDefaultEligible:        boolean;
}

interface UniformRecommendation {
  variantId:             string;
  reason:                string;
  productionCostScore:   number | null;
  acceptableRate:        number;
  averageByteSize:       number;
  averageSizeRatio:      number;
  averageEncodeMs:       number | null;
  averageQualityScore:   number;
}

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.tif', '.tiff']);

const ratingThresholds = {
  excellent: {
    ssimCompositeLuma: 0.99,
    psnrCompositeRgb:  42,
  },
  good: {
    ssimCompositeLuma: 0.985,
    psnrCompositeRgb:  40,
  },
};

const productionSelection = {
  minAcceptableRate: 0.95,
  sizeWeight:        0.6,
  encodeTimeWeight:  0.3,
  qualityWeight:     0.1,
};

function printUsage() {
  console.log(`
Evaluate generated WebP variants against their source images and write a JSON report.

Requires the libwebp CLI:
  brew install webp
  # zip manifests also require unzip, which is available by default on macOS

Usage:
  bun scripts/evaluate-webp-variants.ts --manifest <manifest.json> [--out <report.json>]

Options:
  --manifest <path>             Manifest generated by generate-webp-variants.ts
  --out <path>                  Output JSON path (default: <prefix>__quality.json next to manifest)
  --concurrency <int>           Parallel dwebp jobs (default: min(cpu, task count))
  --changed-threshold <0-255>   Per-channel diff threshold for changed-pixel ratios (default: 8)
  --help                        Show this message

Examples:
  bun scripts/evaluate-webp-variants.ts --manifest ./output/webp-variants/card__manifest.json
  bun scripts/evaluate-webp-variants.ts ./output/webp-variants/card__manifest.json --out ./quality.json
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

function parseIntegerInRange(value: string, flag: string, min: number, max: number): number {
  if (!/^\d+$/.test(value)) {
    fail(`${flag} must be an integer from ${min} to ${max}`);
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    fail(`${flag} must be an integer from ${min} to ${max}`);
  }

  return parsed;
}

function defaultOutputPath(manifestPath: string): string {
  const ext = extname(manifestPath);
  const name = basename(manifestPath, ext);
  const prefix = name.endsWith('__manifest')
    ? name.slice(0, -'__manifest'.length)
    : name;

  return join(dirname(manifestPath), `${prefix}__quality.json`);
}

function parseArgs(args: string[]): Options {
  let manifestPath = '';
  let outputPath = '';
  let concurrency = 0;
  let changedThreshold = 8;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (!arg.startsWith('--') && manifestPath.length === 0) {
      manifestPath = arg;
      continue;
    }

    switch (arg) {
    case '--manifest':
      manifestPath = takeValue(args, index, arg);
      index += 1;
      break;
    case '--out':
      outputPath = takeValue(args, index, arg);
      index += 1;
      break;
    case '--concurrency':
      concurrency = parseIntegerInRange(takeValue(args, index, arg), arg, 1, 256);
      index += 1;
      break;
    case '--changed-threshold':
      changedThreshold = parseIntegerInRange(takeValue(args, index, arg), arg, 0, 255);
      index += 1;
      break;
    default:
      fail(`Unknown argument: ${arg}`);
    }
  }

  if (manifestPath.length === 0) {
    fail('Missing --manifest <path>');
  }

  const resolvedManifest = resolve(manifestPath);

  if (!existsSync(resolvedManifest)) {
    fail(`Manifest file does not exist: ${resolvedManifest}`);
  }

  return {
    manifestPath:     resolvedManifest,
    outputPath:       outputPath ? resolve(outputPath) : defaultOutputPath(resolvedManifest),
    concurrency,
    changedThreshold,
  };
}

function decodeOutput(output: Uint8Array): string {
  return new TextDecoder().decode(output).trim();
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`Invalid manifest field: ${field}`);
  }

  return value;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readOptionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readOptionalStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.every(item => typeof item === 'string')
    ? value.slice()
    : null;
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`Invalid manifest field: ${field}`);
  }

  return value as Record<string, unknown>;
}

async function readManifest(manifestPath: string): Promise<Manifest> {
  const baseDir = dirname(manifestPath);
  const raw = await Bun.file(manifestPath).text();
  const data = asRecord(JSON.parse(raw) as unknown, 'root');
  const rawVariants = data.variants;

  if (!Array.isArray(rawVariants) || rawVariants.length === 0) {
    fail('Manifest must contain a non-empty variants array.');
  }

  const rawSources = Array.isArray(data.sources) ? data.sources : [];

  return {
    generatedAt: readOptionalString(data.generatedAt),
    source:      resolve(baseDir, readString(data.source, 'source')),
    outputDir:   readOptionalString(data.outputDir),
    sources:     rawSources.map((item, index) => {
      const source = asRecord(item, `sources[${index}]`);

      return {
        sourceId:     readString(source.sourceId, `sources[${index}].sourceId`),
        label:        readOptionalString(source.label),
        outputPrefix: readOptionalString(source.outputPrefix),
      };
    }),
    variants: rawVariants.map((item, index) => {
      const variant = asRecord(item, `variants[${index}]`);

      return {
        id:             readString(variant.id, `variants[${index}].id`),
        sourceId:       readString(variant.sourceId, `variants[${index}].sourceId`),
        description:    readOptionalString(variant.description) ?? '',
        outputPath:     resolve(baseDir, readString(variant.outputPath, `variants[${index}].outputPath`)),
        sourceByteSize: readOptionalNumber(variant.sourceByteSize),
        byteSize:       readOptionalNumber(variant.byteSize),
        sizeRatio:      readOptionalNumber(variant.sizeRatio),
        encodeMs:       readOptionalNumber(variant.encodeMs),
        command:        readOptionalStringArray(variant.command),
      };
    }),
  };
}

function ensureTool(command: string, installHint: string): string {
  const result = Bun.spawnSync([command, '-version'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const output = [decodeOutput(result.stdout), decodeOutput(result.stderr)]
    .filter(Boolean)
    .join('\n');

  if (result.exitCode !== 0) {
    fail([
      `${command} was not found or failed to run.`,
      installHint,
      output,
    ].filter(Boolean).join('\n'));
  }

  return output;
}

function ensureUnzip() {
  const result = Bun.spawnSync(['unzip', '-v'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (result.exitCode !== 0) {
    fail([
      'unzip was not found or failed to run.',
      'Install unzip first, or evaluate a manifest generated from a single image.',
      decodeOutput(result.stderr),
    ].filter(Boolean).join('\n'));
  }
}

function runCommand(command: string[], message: string) {
  const result = Bun.spawnSync(command, {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (result.exitCode !== 0) {
    fail([
      message,
      decodeOutput(result.stderr),
      decodeOutput(result.stdout),
    ].filter(Boolean).join('\n'));
  }
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

async function extractZipEntry(zipPath: string, entry: string, tempDir: string, sourceId: string): Promise<string> {
  const result = Bun.spawnSync(['unzip', '-p', zipPath, entry], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (result.exitCode !== 0) {
    fail(`Failed to extract ${entry}:\n${decodeOutput(result.stderr)}`);
  }

  const outputPath = join(tempDir, `${sourceId}${extname(entry).toLowerCase()}`);

  await Bun.write(outputPath, result.stdout);

  return outputPath;
}

function uniqueSourceIds(manifest: Manifest): string[] {
  return Array.from(new Set(manifest.variants.map(variant => variant.sourceId)))
    .sort((left, right) => left.localeCompare(right));
}

function sourceLabelFromManifest(manifest: Manifest, sourceId: string): string | null {
  return manifest.sources.find(source => source.sourceId === sourceId)?.label ?? null;
}

async function loadSourceFiles(manifest: Manifest, tempDir: string): Promise<Map<string, SourceFile>> {
  if (!existsSync(manifest.source)) {
    fail(`Source file does not exist: ${manifest.source}`);
  }

  const sourceIds = uniqueSourceIds(manifest);
  const sourceFiles = new Map<string, SourceFile>();

  if (!isZipPath(manifest.source)) {
    if (!isSupportedImage(manifest.source)) {
      fail(`Unsupported source image type: ${extname(manifest.source) || '(none)'}`);
    }

    const sourceStat = await stat(manifest.source);

    for (const sourceId of sourceIds) {
      sourceFiles.set(sourceId, {
        sourceId,
        label:            sourceLabelFromManifest(manifest, sourceId) ?? manifest.source,
        inputPath:        manifest.source,
        originalByteSize: sourceStat.size,
        zipEntry:         null,
      });
    }

    return sourceFiles;
  }

  ensureUnzip();

  const entries = listZipEntries(manifest.source);
  const entriesBySourceId = new Map<string, string[]>();

  for (const entry of entries) {
    const sourceId = safeName(entry);
    const existing = entriesBySourceId.get(sourceId) ?? [];

    existing.push(entry);
    entriesBySourceId.set(sourceId, existing);
  }

  for (const sourceId of sourceIds) {
    const label = sourceLabelFromManifest(manifest, sourceId);
    const entryCandidates = label && entries.includes(label)
      ? [label]
      : entriesBySourceId.get(sourceId) ?? [];

    if (entryCandidates.length === 0) {
      fail(`Cannot find zip entry for sourceId: ${sourceId}`);
    }

    if (entryCandidates.length > 1) {
      fail(`Multiple zip entries map to sourceId ${sourceId}: ${entryCandidates.join(', ')}`);
    }

    const entry = entryCandidates[0]!;
    const inputPath = await extractZipEntry(manifest.source, entry, tempDir, sourceId);
    const sourceStat = await stat(inputPath);

    sourceFiles.set(sourceId, {
      sourceId,
      label:            entry,
      inputPath,
      originalByteSize: sourceStat.size,
      zipEntry:         entry,
    });
  }

  return sourceFiles;
}

function readPamInteger(fields: Map<string, string>, field: string): number {
  const value = fields.get(field);

  if (!value || !/^\d+$/.test(value)) {
    fail(`Invalid PAM field: ${field}`);
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    fail(`Invalid PAM field: ${field}`);
  }

  return parsed;
}

async function readPam(path: string): Promise<PamImage> {
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
  const decoder = new TextDecoder();
  let offset = 0;

  function readLine(): string {
    let end = offset;

    while (end < bytes.length && bytes[end] !== 10) {
      end += 1;
    }

    if (end >= bytes.length) {
      fail(`Invalid PAM header in ${path}`);
    }

    const lineBytes = bytes.subarray(offset, bytes[end - 1] === 13 ? end - 1 : end);

    offset = end + 1;

    return decoder.decode(lineBytes);
  }

  if (readLine() !== 'P7') {
    fail(`Unsupported PAM file: ${path}`);
  }

  const fields = new Map<string, string>();

  while (true) {
    const line = readLine();

    if (line === 'ENDHDR') {
      break;
    }

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf(' ');

    if (separator <= 0) {
      fail(`Invalid PAM header line in ${path}: ${line}`);
    }

    fields.set(line.slice(0, separator), line.slice(separator + 1).trim());
  }

  const width = readPamInteger(fields, 'WIDTH');
  const height = readPamInteger(fields, 'HEIGHT');
  const depthValue = readPamInteger(fields, 'DEPTH');
  const maxValue = readPamInteger(fields, 'MAXVAL');

  if (depthValue !== 3 && depthValue !== 4) {
    fail(`Unsupported PAM depth ${depthValue} in ${path}`);
  }

  if (maxValue !== 255) {
    fail(`Unsupported PAM MAXVAL ${maxValue} in ${path}`);
  }

  const depth = depthValue as 3 | 4;
  const expectedLength = width * height * depth;

  if (bytes.length - offset < expectedLength) {
    fail(`PAM pixel data is truncated in ${path}`);
  }

  return {
    width,
    height,
    depth,
    data: bytes.slice(offset, offset + expectedLength),
  };
}

async function decodeWebpToPam(inputPath: string, outputPath: string): Promise<PamImage> {
  runCommand(
    ['dwebp', inputPath, '-pam', '-o', outputPath],
    `Failed to decode WebP: ${inputPath}`,
  );

  return readPam(outputPath);
}

async function createReferenceImage(source: SourceFile, tempDir: string): Promise<ReferenceImage> {
  const refWebpPath = join(tempDir, `${source.sourceId}__reference.webp`);
  const refPamPath = join(tempDir, `${source.sourceId}__reference.pam`);

  runCommand(
    ['cwebp', '-quiet', '-lossless', '-exact', '-m', '6', '-metadata', 'none', source.inputPath, '-o', refWebpPath],
    `Failed to create lossless reference for ${source.sourceId}`,
  );

  return {
    source,
    image: await decodeWebpToPam(refWebpPath, refPamPath),
  };
}

function newMetricStats(): MetricStats {
  return {
    count: 0,
    sumX:  0,
    sumY:  0,
    sumXX: 0,
    sumYY: 0,
    sumXY: 0,
  };
}

function addMetricSample(stats: MetricStats, left: number, right: number) {
  stats.count += 1;
  stats.sumX += left;
  stats.sumY += right;
  stats.sumXX += left * left;
  stats.sumYY += right * right;
  stats.sumXY += left * right;
}

function finishSsim(stats: MetricStats): number {
  if (stats.count === 0) {
    return 1;
  }

  const meanX = stats.sumX / stats.count;
  const meanY = stats.sumY / stats.count;
  const varianceX = Math.max(0, stats.sumXX / stats.count - meanX * meanX);
  const varianceY = Math.max(0, stats.sumYY / stats.count - meanY * meanY);
  const covariance = stats.sumXY / stats.count - meanX * meanY;
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  const denominator = (meanX * meanX + meanY * meanY + c1) * (varianceX + varianceY + c2);

  if (denominator === 0) {
    return 1;
  }

  return Math.max(-1, Math.min(1, ((2 * meanX * meanY + c1) * (2 * covariance + c2)) / denominator));
}

function round(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}

function psnr(mse: number): number | null {
  return mse === 0 ? null : round(10 * Math.log10((255 * 255) / mse));
}

function luma(red: number, green: number, blue: number): number {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function compositeChannel(value: number, alpha: number): number {
  return (value * alpha + 128 * (255 - alpha)) / 255;
}

function scoreQuality(metrics: ImageMetrics): number {
  const psnrValue = metrics.psnrCompositeRgb ?? 60;
  const ssimPart = Math.max(0, Math.min(1, (metrics.ssimCompositeLuma - 0.95) / 0.05));
  const psnrPart = Math.max(0, Math.min(1, (psnrValue - 34) / 14));
  const alphaPenalty = Math.min(20, metrics.alpha.mae * 4 + metrics.alpha.changedPixelRatio * 20);

  return round(Math.max(0, (ssimPart * 65 + psnrPart * 35) - alphaPenalty), 3);
}

function rateVariant(metrics: ImageMetrics): Rating {
  const psnrValue = metrics.psnrCompositeRgb ?? 99;

  if (metrics.alpha.maxDiff > 8 || metrics.alpha.mae > 0.1) {
    return 'review';
  }

  if (
    metrics.ssimCompositeLuma >= ratingThresholds.excellent.ssimCompositeLuma
    && psnrValue >= ratingThresholds.excellent.psnrCompositeRgb
  ) {
    return 'excellent';
  }

  if (
    metrics.ssimCompositeLuma >= ratingThresholds.good.ssimCompositeLuma
    && psnrValue >= ratingThresholds.good.psnrCompositeRgb
  ) {
    return 'good';
  }

  return 'review';
}

function compareImages(reference: PamImage, candidate: PamImage, changedThreshold: number): ImageMetrics {
  if (reference.width !== candidate.width || reference.height !== candidate.height) {
    fail(`Image dimensions differ: reference ${reference.width}x${reference.height}, candidate ${candidate.width}x${candidate.height}`);
  }

  const pixelCount = reference.width * reference.height;
  const sampleCount = pixelCount * 3;
  const rawSsim = newMetricStats();
  const compositeSsim = newMetricStats();
  let sumSqRgb = 0;
  let sumAbsRgb = 0;
  let maxDiffRgb = 0;
  let changedPixels = 0;
  let sumSqCompositeRgb = 0;
  let sumAbsCompositeRgb = 0;
  let maxDiffCompositeRgb = 0;
  let changedCompositePixels = 0;
  let visiblePixels = 0;
  let visibleChangedPixels = 0;
  let sumAbsAlpha = 0;
  let maxDiffAlpha = 0;
  let changedAlphaPixels = 0;
  let rgbExact = true;
  let alphaExact = true;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const refOffset = pixel * reference.depth;
    const candidateOffset = pixel * candidate.depth;
    const refRed = reference.data[refOffset]!;
    const refGreen = reference.data[refOffset + 1]!;
    const refBlue = reference.data[refOffset + 2]!;
    const candidateRed = candidate.data[candidateOffset]!;
    const candidateGreen = candidate.data[candidateOffset + 1]!;
    const candidateBlue = candidate.data[candidateOffset + 2]!;
    const refAlpha = reference.depth === 4 ? reference.data[refOffset + 3]! : 255;
    const candidateAlpha = candidate.depth === 4 ? candidate.data[candidateOffset + 3]! : 255;
    const rawRefLuma = luma(refRed, refGreen, refBlue);
    const rawCandidateLuma = luma(candidateRed, candidateGreen, candidateBlue);
    const compositeRefRed = compositeChannel(refRed, refAlpha);
    const compositeRefGreen = compositeChannel(refGreen, refAlpha);
    const compositeRefBlue = compositeChannel(refBlue, refAlpha);
    const compositeCandidateRed = compositeChannel(candidateRed, candidateAlpha);
    const compositeCandidateGreen = compositeChannel(candidateGreen, candidateAlpha);
    const compositeCandidateBlue = compositeChannel(candidateBlue, candidateAlpha);
    const rawDiffs = [
      candidateRed - refRed,
      candidateGreen - refGreen,
      candidateBlue - refBlue,
    ];
    const compositeDiffs = [
      compositeCandidateRed - compositeRefRed,
      compositeCandidateGreen - compositeRefGreen,
      compositeCandidateBlue - compositeRefBlue,
    ];
    let pixelMaxDiff = 0;
    let pixelMaxCompositeDiff = 0;

    for (const diff of rawDiffs) {
      const absDiff = Math.abs(diff);

      sumSqRgb += diff * diff;
      sumAbsRgb += absDiff;
      maxDiffRgb = Math.max(maxDiffRgb, absDiff);
      pixelMaxDiff = Math.max(pixelMaxDiff, absDiff);
      rgbExact = rgbExact && absDiff === 0;
    }

    for (const diff of compositeDiffs) {
      const absDiff = Math.abs(diff);

      sumSqCompositeRgb += diff * diff;
      sumAbsCompositeRgb += absDiff;
      maxDiffCompositeRgb = Math.max(maxDiffCompositeRgb, absDiff);
      pixelMaxCompositeDiff = Math.max(pixelMaxCompositeDiff, absDiff);
    }

    if (pixelMaxDiff > changedThreshold) {
      changedPixels += 1;
    }

    if (pixelMaxCompositeDiff > changedThreshold) {
      changedCompositePixels += 1;
    }

    if (Math.max(refAlpha, candidateAlpha) > 16) {
      visiblePixels += 1;

      if (pixelMaxCompositeDiff > changedThreshold) {
        visibleChangedPixels += 1;
      }
    }

    const alphaDiff = candidateAlpha - refAlpha;
    const absAlphaDiff = Math.abs(alphaDiff);

    sumAbsAlpha += absAlphaDiff;
    maxDiffAlpha = Math.max(maxDiffAlpha, absAlphaDiff);
    alphaExact = alphaExact && absAlphaDiff === 0;

    if (absAlphaDiff > changedThreshold) {
      changedAlphaPixels += 1;
    }

    addMetricSample(rawSsim, rawRefLuma, rawCandidateLuma);
    addMetricSample(
      compositeSsim,
      luma(compositeRefRed, compositeRefGreen, compositeRefBlue),
      luma(compositeCandidateRed, compositeCandidateGreen, compositeCandidateBlue),
    );
  }

  const mseRgb = sumSqRgb / sampleCount;
  const mseCompositeRgb = sumSqCompositeRgb / sampleCount;

  return {
    rgbExact,
    alphaExact,
    mseRgb:                     round(mseRgb),
    rmseRgb:                    round(Math.sqrt(mseRgb)),
    maeRgb:                     round(sumAbsRgb / sampleCount),
    maxDiffRgb:                 round(maxDiffRgb),
    psnrRgb:                    psnr(mseRgb),
    mseCompositeRgb:            round(mseCompositeRgb),
    rmseCompositeRgb:           round(Math.sqrt(mseCompositeRgb)),
    maeCompositeRgb:            round(sumAbsCompositeRgb / sampleCount),
    maxDiffCompositeRgb:        round(maxDiffCompositeRgb),
    psnrCompositeRgb:           psnr(mseCompositeRgb),
    ssimGlobalLuma:             round(finishSsim(rawSsim)),
    ssimCompositeLuma:          round(finishSsim(compositeSsim)),
    changedPixelRatio:          round(changedPixels / pixelCount),
    changedCompositePixelRatio: round(changedCompositePixels / pixelCount),
    visiblePixelRatio:          round(visiblePixels / pixelCount),
    visibleChangedPixelRatio:   round(visiblePixels === 0 ? 0 : visibleChangedPixels / visiblePixels),
    alpha: {
      hasAlpha:          reference.depth === 4 || candidate.depth === 4,
      mae:               round(sumAbsAlpha / pixelCount),
      maxDiff:           round(maxDiffAlpha),
      changedPixelRatio: round(changedAlphaPixels / pixelCount),
    },
  };
}

async function evaluateVariant(
  variant: ManifestVariant,
  reference: ReferenceImage,
  tempDir: string,
  changedThreshold: number,
): Promise<VariantReport> {
  if (!existsSync(variant.outputPath)) {
    fail(`Generated WebP file does not exist: ${variant.outputPath}`);
  }

  const outputStat = await stat(variant.outputPath);
  const pamPath = join(tempDir, `${safeName(variant.sourceId)}__${safeName(variant.id)}.pam`);
  const candidate = await decodeWebpToPam(variant.outputPath, pamPath);
  const metrics = compareImages(reference.image, candidate, changedThreshold);
  const rating = rateVariant(metrics);

  return {
    sourceId:         variant.sourceId,
    variantId:        variant.id,
    description:      variant.description,
    outputPath:       variant.outputPath,
    sourceByteSize:   reference.source.originalByteSize,
    byteSize:         outputStat.size,
    manifestByteSize: variant.byteSize,
    sizeRatio:        round(outputStat.size / reference.source.originalByteSize),
    manifestSizeRatio:variant.sizeRatio,
    encodeMs:         variant.encodeMs,
    width:            candidate.width,
    height:           candidate.height,
    rating,
    qualityScore:     scoreQuality(metrics),
    metrics,
  };
}

async function runParallel<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex;

      nextIndex += 1;

      const item = items[index];

      if (!item) {
        return;
      }

      results[index] = await worker(item, index);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => runWorker()));

  return results;
}

function chooseBestCandidate(variants: VariantReport[]): SourceReport['bestCandidate'] {
  const candidates = variants
    .filter(variant => variant.rating === 'excellent' || variant.rating === 'good')
    .sort((left, right) =>
      left.byteSize - right.byteSize
      || right.qualityScore - left.qualityScore,
    );
  const fallback = variants
    .slice()
    .sort((left, right) =>
      right.qualityScore - left.qualityScore
      || left.byteSize - right.byteSize,
    );
  const selected = candidates[0] ?? fallback[0];

  if (!selected) {
    return null;
  }

  return {
    variantId:    selected.variantId,
    rating:       selected.rating,
    byteSize:     selected.byteSize,
    sizeRatio:    selected.sizeRatio,
    encodeMs:     selected.encodeMs,
    qualityScore: selected.qualityScore,
  };
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle]!;
  }

  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function minValue(values: number[]): number | null {
  return values.length === 0 ? null : Math.min(...values);
}

function roundRequired(value: number | null): number {
  return round(value ?? 0);
}

function normalize(value: number, min: number, max: number): number {
  if (max <= min) {
    return 0;
  }

  return (value - min) / (max - min);
}

function buildVariantAggregates(
  variants: VariantReport[],
  errors: VariantError[],
  sourceCount: number,
): VariantAggregate[] {
  const variantIds = Array.from(new Set([
    ...variants.map(variant => variant.variantId),
    ...errors.map(error => error.variantId),
  ])).sort((left, right) => left.localeCompare(right));
  const rawAggregates = variantIds.map(variantId => {
    const items = variants.filter(variant => variant.variantId === variantId);
    const itemErrors = errors.filter(error => error.variantId === variantId);
    const excellentCount = items.filter(item => item.rating === 'excellent').length;
    const goodCount = items.filter(item => item.rating === 'good').length;
    const reviewCount = items.filter(item => item.rating === 'review').length;
    const acceptableCount = excellentCount + goodCount;
    const psnrValues = items
      .map(item => item.metrics.psnrCompositeRgb)
      .filter((value): value is number => value !== null);
    const ssimValues = items.map(item => item.metrics.ssimCompositeLuma);
    const encodeValues = items
      .map(item => item.encodeMs)
      .filter((value): value is number => value !== null);

    return {
      variantId,
      description:                    items[0]?.description ?? '',
      sourceCount,
      encodedCount:                   items.length,
      errorCount:                     itemErrors.length,
      excellentCount,
      goodCount,
      reviewCount,
      acceptableCount,
      acceptableRate:                 round(sourceCount === 0 ? 0 : acceptableCount / sourceCount),
      averageByteSize:                roundRequired(average(items.map(item => item.byteSize))),
      medianByteSize:                 roundRequired(median(items.map(item => item.byteSize))),
      averageSizeRatio:               roundRequired(average(items.map(item => item.sizeRatio))),
      medianSizeRatio:                roundRequired(median(items.map(item => item.sizeRatio))),
      averageEncodeMs:                average(encodeValues),
      medianEncodeMs:                 median(encodeValues),
      maxEncodeMs:                    minValue(encodeValues.map(value => -value)) === null ? null : Math.max(...encodeValues),
      averageQualityScore:            roundRequired(average(items.map(item => item.qualityScore))),
      minQualityScore:                roundRequired(minValue(items.map(item => item.qualityScore))),
      averagePsnrCompositeRgb:        average(psnrValues),
      minPsnrCompositeRgb:            minValue(psnrValues),
      averageSsimCompositeLuma:       roundRequired(average(ssimValues)),
      minSsimCompositeLuma:           roundRequired(minValue(ssimValues)),
      averageVisibleChangedPixelRatio:roundRequired(average(items.map(item => item.metrics.visibleChangedPixelRatio))),
      productionCostScore:            null,
      uniformDefaultEligible:         false,
    } satisfies VariantAggregate;
  });
  const sizeRatios = rawAggregates.map(item => item.averageSizeRatio);
  const encodeTimes = rawAggregates
    .map(item => item.averageEncodeMs)
    .filter((value): value is number => value !== null);
  const minSizeRatio = Math.min(...sizeRatios);
  const maxSizeRatio = Math.max(...sizeRatios);
  const minEncodeMs = encodeTimes.length === 0 ? null : Math.min(...encodeTimes);
  const maxEncodeMs = encodeTimes.length === 0 ? null : Math.max(...encodeTimes);

  return rawAggregates.map(aggregate => {
    const sizePart = normalize(aggregate.averageSizeRatio, minSizeRatio, maxSizeRatio);
    const encodePart = aggregate.averageEncodeMs === null || minEncodeMs === null || maxEncodeMs === null
      ? null
      : normalize(aggregate.averageEncodeMs, minEncodeMs, maxEncodeMs);
    const qualityPenalty = 1 - Math.max(0, Math.min(1, aggregate.averageQualityScore / 100));
    const productionCostScore = encodePart === null
      ? null
      : round(
        sizePart * productionSelection.sizeWeight * 100
        + encodePart * productionSelection.encodeTimeWeight * 100
        + qualityPenalty * productionSelection.qualityWeight * 100,
        3,
      );

    return {
      ...aggregate,
      averageEncodeMs:        aggregate.averageEncodeMs === null ? null : round(aggregate.averageEncodeMs, 3),
      medianEncodeMs:         aggregate.medianEncodeMs === null ? null : round(aggregate.medianEncodeMs, 3),
      maxEncodeMs:            aggregate.maxEncodeMs === null ? null : round(aggregate.maxEncodeMs, 3),
      averagePsnrCompositeRgb:aggregate.averagePsnrCompositeRgb === null ? null : round(aggregate.averagePsnrCompositeRgb),
      minPsnrCompositeRgb:    aggregate.minPsnrCompositeRgb === null ? null : round(aggregate.minPsnrCompositeRgb),
      productionCostScore,
      uniformDefaultEligible: aggregate.errorCount === 0
        && aggregate.acceptableRate >= productionSelection.minAcceptableRate,
    };
  });
}

function compareProductionCost(left: VariantAggregate, right: VariantAggregate): number {
  const leftScore = left.productionCostScore ?? Number.POSITIVE_INFINITY;
  const rightScore = right.productionCostScore ?? Number.POSITIVE_INFINITY;

  return leftScore - rightScore
    || left.averageSizeRatio - right.averageSizeRatio
    || (left.averageEncodeMs ?? Number.POSITIVE_INFINITY) - (right.averageEncodeMs ?? Number.POSITIVE_INFINITY)
    || right.averageQualityScore - left.averageQualityScore;
}

function toUniformRecommendation(aggregate: VariantAggregate, reason: string): UniformRecommendation {
  return {
    variantId:           aggregate.variantId,
    reason,
    productionCostScore: aggregate.productionCostScore,
    acceptableRate:      aggregate.acceptableRate,
    averageByteSize:     aggregate.averageByteSize,
    averageSizeRatio:    aggregate.averageSizeRatio,
    averageEncodeMs:     aggregate.averageEncodeMs,
    averageQualityScore: aggregate.averageQualityScore,
  };
}

function chooseUniformRecommendation(aggregates: VariantAggregate[]): UniformRecommendation | null {
  const eligible = aggregates
    .filter(aggregate => aggregate.uniformDefaultEligible)
    .sort(compareProductionCost);
  const selected = eligible[0];

  if (selected) {
    return toUniformRecommendation(
      selected,
      `Selected from variants with at least ${productionSelection.minAcceptableRate * 100}% good/excellent results by lowest production cost score.`,
    );
  }

  const fallback = aggregates
    .slice()
    .sort((left, right) =>
      right.acceptableRate - left.acceptableRate
      || compareProductionCost(left, right),
    )[0];

  if (!fallback) {
    return null;
  }

  return toUniformRecommendation(
    fallback,
    'No variant meets the uniform default pass-rate gate; selected the highest pass-rate fallback.',
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main() {
  const options = parseArgs(Bun.argv.slice(2));
  const cwebpVersion = ensureTool('cwebp', 'Install libwebp first, for example: brew install webp');
  const dwebpVersion = ensureTool('dwebp', 'Install libwebp first, for example: brew install webp');
  const manifest = await readManifest(options.manifestPath);
  const tempDir = await mkdtemp(join(tmpdir(), 'webp-quality-'));

  try {
    const sourceFiles = await loadSourceFiles(manifest, tempDir);
    const sources = Array.from(sourceFiles.values());
    const referenceConcurrency = Math.min(options.concurrency || availableParallelism(), sources.length);
    const references = await runParallel(
      sources,
      referenceConcurrency,
      source => createReferenceImage(source, tempDir),
    );
    const referenceBySourceId = new Map(references.map(reference => [reference.source.sourceId, reference]));
    const variantConcurrency = Math.min(options.concurrency || availableParallelism(), manifest.variants.length);
    const evaluated = await runParallel(
      manifest.variants,
      variantConcurrency,
      async variant => {
        const reference = referenceBySourceId.get(variant.sourceId);

        if (!reference) {
          return {
            sourceId:  variant.sourceId,
            variantId: variant.id,
            outputPath:variant.outputPath,
            error:     `Missing reference image for sourceId: ${variant.sourceId}`,
          } satisfies VariantError;
        }

        try {
          return await evaluateVariant(variant, reference, tempDir, options.changedThreshold);
        } catch (error) {
          return {
            sourceId:  variant.sourceId,
            variantId: variant.id,
            outputPath:variant.outputPath,
            error:     errorMessage(error),
          } satisfies VariantError;
        }
      },
    );
    const sourceReports: SourceReport[] = sources.map(source => {
      const reference = referenceBySourceId.get(source.sourceId);
      const variants = evaluated
        .filter((item): item is VariantReport => !('error' in item))
        .filter(item => item.sourceId === source.sourceId)
        .sort((left, right) => left.byteSize - right.byteSize || left.variantId.localeCompare(right.variantId));
      const errors = evaluated
        .filter((item): item is VariantError => 'error' in item)
        .filter(item => item.sourceId === source.sourceId)
        .sort((left, right) => left.variantId.localeCompare(right.variantId));

      return {
        sourceId:       source.sourceId,
        label:          source.label,
        sourcePath:     manifest.source,
        zipEntry:       source.zipEntry,
        sourceByteSize: source.originalByteSize,
        width:          reference?.image.width ?? 0,
        height:         reference?.image.height ?? 0,
        variants,
        errors,
        bestCandidate:  chooseBestCandidate(variants),
      };
    });
    const allVariants = sourceReports.flatMap(source => source.variants);
    const allErrors = sourceReports.flatMap(source => source.errors);
    const variantAggregates = buildVariantAggregates(allVariants, allErrors, sourceReports.length);
    const uniformRecommendation = chooseUniformRecommendation(variantAggregates);
    const report = {
      schemaVersion:       1,
      generatedAt:         new Date().toISOString(),
      manifestPath:        options.manifestPath,
      manifestGeneratedAt: manifest.generatedAt,
      source:              manifest.source,
      outputDir:           manifest.outputDir,
      tools: {
        cwebp: cwebpVersion,
        dwebp: dwebpVersion,
      },
      thresholds: {
        changedChannelThreshold: options.changedThreshold,
        rating:                  ratingThresholds,
        productionSelection,
      },
      summary: {
        sourceCount:           sourceReports.length,
        variantCount:          allVariants.length,
        errorCount:            allErrors.length,
        excellentCount:        allVariants.filter(variant => variant.rating === 'excellent').length,
        goodCount:             allVariants.filter(variant => variant.rating === 'good').length,
        reviewCount:           allVariants.filter(variant => variant.rating === 'review').length,
        uniformRecommendation,
        perSourceBestCandidates:sourceReports.map(source => ({
          sourceId:      source.sourceId,
          bestCandidate: source.bestCandidate,
        })),
      },
      variantAggregates,
      sources: sourceReports,
      errors:  allErrors,
    };

    await mkdir(dirname(options.outputPath), { recursive: true });
    await Bun.write(options.outputPath, JSON.stringify(report, null, 2) + '\n');

    console.log(`Quality report: ${options.outputPath}`);
    console.log(`Sources: ${sourceReports.length}, variants: ${allVariants.length}, errors: ${allErrors.length}`);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

main().catch(error => {
  console.error(errorMessage(error));
  process.exit(1);
});
