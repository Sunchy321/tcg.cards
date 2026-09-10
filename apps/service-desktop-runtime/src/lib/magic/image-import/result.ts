import { z } from 'zod';

/**
 * Unified import report shared by the three image import task types. Fields a
 * given task never produces stay at 0 or empty, so the console renders one
 * report card for every source instead of three different shapes.
 */
export const imageImportOutput = z.strictObject({
  processed:    z.number(),
  written:      z.number(),
  unchanged:    z.number(),
  failed:       z.number(),
  skipped:      z.number(),
  lowQuality:   z.number(),
  cleanedJpg:   z.number(),
  // Remote batch only: rows/faces the data source could not supply.
  missingUrl:   z.number(),
  missingId:    z.number(),
  placeholder:  z.number(),
  // Local batch and single only: archive matching outcomes.
  skippedUpload: z.number(),
  unmatched:     z.number(),
  unrecognized:  z.number(),
  unmatchedNumbers:  z.array(z.string()),
  unrecognizedNames: z.array(z.string()),
  warnings:          z.array(z.string()),
});

export type ImageImportOutput = z.infer<typeof imageImportOutput>;
export type ImageImportDelta = Partial<ImageImportOutput>;

/** Upper bound per output list so huge archives cannot flood the task result. */
export const maxListEntries = 50;

const numericKeys = [
  'processed', 'written', 'unchanged', 'failed', 'skipped', 'lowQuality', 'cleanedJpg',
  'missingUrl', 'missingId', 'placeholder', 'skippedUpload', 'unmatched', 'unrecognized',
] as const;
const listKeys = ['unmatchedNumbers', 'unrecognizedNames', 'warnings'] as const;

export function emptyImageImportOutput(): ImageImportOutput {
  return {
    processed:         0,
    written:           0,
    unchanged:         0,
    failed:            0,
    skipped:           0,
    lowQuality:        0,
    cleanedJpg:        0,
    missingUrl:        0,
    missingId:         0,
    placeholder:       0,
    skippedUpload:     0,
    unmatched:         0,
    unrecognized:      0,
    unmatchedNumbers:  [],
    unrecognizedNames: [],
    warnings:          [],
  };
}

/** Adds a partial delta onto an accumulator; lists are concatenated and capped. */
export function addImageImportOutput(a: ImageImportOutput, b: ImageImportDelta): ImageImportOutput {
  const merged: ImageImportOutput = { ...a };
  for (const key of numericKeys) {
    merged[key] = a[key] + (b[key] ?? 0);
  }
  for (const key of listKeys) {
    merged[key] = [...a[key], ...(b[key] ?? [])].slice(0, maxListEntries);
  }
  return merged;
}

/** Appends one value to a capped output list. */
export function pushCapped(list: string[], value: string): void {
  if (list.length < maxListEntries) list.push(value);
}
