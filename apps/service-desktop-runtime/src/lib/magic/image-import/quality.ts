import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { runWithDb } from '@tcg-cards/db';
import { Print } from '@tcg-cards/db/schema/shared/magic/print';

import type { LocalDb } from '../../hearthstone/hsdata-local-db';

/** One flagged face image: a print whose image is far smaller than its language's norm. */
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
  medians:  z.array(z.strictObject({ lang: z.string(), width: z.number() })),
  problems: z.array(imageQualityProblem),
  missing:  z.array(imageQualityMissing),
});

export type ImageQualityProblem = z.infer<typeof imageQualityProblem>;
export type ImageQualityReport = z.infer<typeof imageQualityReport>;

/** A face under half of its language's median width is a low-resolution outlier (e.g. a Gatherer-native 265x370 image). */
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

/** Median width of one language's face images — the baseline every face of that language is measured against. */
function medianWidth(widths: number[]): number {
  return [...widths].sort((a, b) => a - b)[Math.floor(widths.length / 2)]!;
}

/**
 * Sizes every imported face image of one set against its language's median width
 * and separately lists prints without local image data. Read-only. The baseline is
 * per language, so the check always covers all languages of the set at once.
 */
export async function checkImageQuality(db: LocalDb, set: string): Promise<ImageQualityReport> {
  const rows = await runWithDb(db, () => db.select({
    number:    Print.number,
    lang:      Print.lang,
    imageInfo: Print.imageInfo,
  }).from(Print).where(and(eq(Print.set, set), isNull(Print.deletedAt))));

  // Several rows can share one printed image (versions/sources), so the
  // have-image bookkeeping and the report work on prints, not on rows.
  const faceWidths = new Map<string, number[]>();
  const imagePrints = new Set<string>();
  const missingPrints = new Map<string, { lang: string, number: string }>();

  for (const row of rows) {
    const key = `${row.lang}/${row.number}`;
    const faces = (row.imageInfo ?? []).filter(face => face != null);
    if (faces.length === 0) {
      if (!imagePrints.has(key)) missingPrints.set(key, { lang: row.lang, number: row.number });
      continue;
    }
    imagePrints.add(key);
    missingPrints.delete(key);
    const widths = faceWidths.get(row.lang) ?? [];
    for (const face of faces) widths.push(face.width);
    faceWidths.set(row.lang, widths);
  }

  const medians = new Map<string, number>();
  for (const [lang, widths] of faceWidths) medians.set(lang, medianWidth(widths));

  const problems = new Map<string, ImageQualityProblem>();
  for (const row of rows) {
    const med = medians.get(row.lang);
    if (med == null) continue;
    for (const face of row.imageInfo ?? []) {
      if (face == null) continue;
      if (face.width >= smallRatio * med) continue;
      problems.set(
        `${row.lang}/${row.number}/${face.width}x${face.height}`,
        { lang: row.lang, number: row.number, width: face.width, height: face.height },
      );
    }
  }

  return {
    set,
    prints:  rows.length,
    images:  imagePrints.size,
    medians: [...medians.entries()]
      .map(([lang, width]) => ({ lang, width }))
      .sort((a, b) => a.lang.localeCompare(b.lang)),
    problems: [...problems.values()].sort(byPrint),
    missing:  [...missingPrints.values()].sort(byPrint),
  };
}
