import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { runWithDb } from '@tcg-cards/db';
import { Print } from '@tcg-cards/db/schema/shared/magic/print';

import type { LocalDb } from '../../hearthstone/hsdata-local-db';

/** One flagged face image: a print whose image is far smaller than the set's healthy norm. */
export const imageQualityProblem = z.strictObject({
  lang:   z.string(),
  number: z.string(),
  width:  z.number(),
  height: z.number(),
});

/** One print of the checked set that carries no face image at all. */
export const imageQualityMissing = z.strictObject({
  lang:   z.string(),
  number: z.string(),
});

export const imageQualityReport = z.strictObject({
  set:      z.string(),
  prints:   z.number(),
  images:   z.number(),
  baseline: z.number().nullable(),
  problems: z.array(imageQualityProblem),
  missing:  z.array(imageQualityMissing),
});

export type ImageQualityProblem = z.infer<typeof imageQualityProblem>;
export type ImageQualityReport = z.infer<typeof imageQualityReport>;

/** A face under half of the set's baseline width is a low-resolution outlier (e.g. a Gatherer-native 265x370 image). */
const smallRatio = 0.5;

/** Collector numbers order by their leading integer first, so "9" < "10" < "10a" < "313". */
function byNumber(a: string, b: string): number {
  const na = Number.parseFloat(a);
  const nb = Number.parseFloat(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  return a.localeCompare(b);
}

/** Orders report entries by language, then by collector number. */
function byPrint(
  a: { lang: string, number: string },
  b: { lang: string, number: string },
): number {
  return a.lang.localeCompare(b.lang) || byNumber(a.number, b.number);
}

/** Median width of one pool of face images. */
function medianWidth(widths: number[]): number {
  return [...widths].sort((a, b) => a - b)[Math.floor(widths.length / 2)]!;
}

/**
 * Baseline width of one set, computed over all languages together. Faces the
 * small rule would flag are iteratively excluded from the pool before the median
 * is taken again: an image considered too small must not set the standard, or a
 * language whose every image is small (one imported wholly at Gatherer
 * resolution) would become its own baseline and pass unnoticed. The pool never
 * empties because the median element always survives its own cut.
 */
function baselineWidth(allWidths: number[]): number | null {
  if (allWidths.length === 0) return null;
  let pool = allWidths;
  for (;;) {
    const base = medianWidth(pool);
    const kept = pool.filter(width => width >= smallRatio * base);
    if (kept.length === pool.length) return base;
    pool = kept;
  }
}

/**
 * Sizes every imported face image of one set against the set-wide baseline width
 * and separately lists prints without local image data. Read-only; the check
 * always covers all languages of the set at once.
 */
export async function checkImageQuality(db: LocalDb, set: string): Promise<ImageQualityReport> {
  const rows = await runWithDb(db, () => db.select({
    number:      Print.number,
    lang:        Print.lang,
    imageStatus: Print.imageStatus,
    imageInfo:   Print.imageInfo,
  }).from(Print).where(and(eq(Print.set, set), isNull(Print.deletedAt))));

  // Several rows can share one printed image (versions/sources), so the
  // have-image bookkeeping and the report work on prints, not on rows.
  const imagePrints = new Set<string>();
  const missingPrints = new Map<string, { lang: string, number: string }>();
  const allWidths: number[] = [];

  for (const row of rows) {
    const key = `${row.lang}/${row.number}`;
    const faces = (row.imageInfo ?? []).filter(face => face != null);
    if (faces.length === 0) {
      // A placeholder status (the local no-image mark, or scryfall reporting
      // the print that way) is a settled state, not something left to import.
      if (row.imageStatus === 'placeholder') continue;
      if (!imagePrints.has(key)) missingPrints.set(key, { lang: row.lang, number: row.number });
      continue;
    }
    imagePrints.add(key);
    missingPrints.delete(key);
    for (const face of faces) allWidths.push(face.width);
  }

  const baseline = baselineWidth(allWidths);

  const problems = new Map<string, ImageQualityProblem>();
  if (baseline != null) {
    for (const row of rows) {
      for (const face of row.imageInfo ?? []) {
        if (face == null) continue;
        if (face.width >= smallRatio * baseline) continue;
        problems.set(
          `${row.lang}/${row.number}/${face.width}x${face.height}`,
          { lang: row.lang, number: row.number, width: face.width, height: face.height },
        );
      }
    }
  }

  return {
    set,
    prints:   rows.length,
    images:   imagePrints.size,
    baseline,
    problems: [...problems.values()].sort(byPrint),
    missing:  [...missingPrints.values()].sort(byPrint),
  };
}
