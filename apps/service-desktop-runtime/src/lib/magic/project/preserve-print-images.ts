import { and, eq, or } from 'drizzle-orm';

import { Print } from '@tcg-cards/db/schema/shared/magic/print';

type Db = any;
type PrintInsert = (typeof Print)['$inferInsert'];

const IMAGE_COLS = [
  'imageStatus', 'imageSha256', 'imageWidth', 'imageHeight',
  'imageByteSize', 'imageSource', 'imageQualityScore', 'imageVerifiedAt',
] as const;

function key(r: { cardId: string, version: string, set: string, number: string, lang: string, source: string }) {
  return [r.cardId, r.version, r.set, r.number, r.lang, r.source].join('\u0000');
}

/**
 * Preserve locally imported image fields across re-projection: when a prints row
 * already exists and its imageSource is not null (written by any of the
 * scryfall/gatherer/manual modules), carry the existing image_* values into the
 * pending insert so the scryfall draft cannot clear them. Manual replacements
 * (imageSource=manual) are therefore never overwritten by projection.
 */
export async function preserveExistingPrintImages(database: Db, rows: PrintInsert[]): Promise<void> {
  if (rows.length === 0) return;
  const conditions = rows.map(r => and(
    eq(Print.cardId, r.cardId!),
    eq(Print.version, r.version ?? ''),
    eq(Print.set, r.set!),
    eq(Print.number, r.number!),
    eq(Print.lang, r.lang as never),
    eq(Print.source, r.source ?? ''),
  ));
  const existing = await database.select({
    cardId:            Print.cardId, version:           Print.version, set:               Print.set, number:            Print.number,
    lang:              Print.lang, source:            Print.source,
    imageStatus:       Print.imageStatus, imageSha256:       Print.imageSha256, imageWidth:        Print.imageWidth,
    imageHeight:       Print.imageHeight, imageByteSize:     Print.imageByteSize, imageSource:       Print.imageSource,
    imageQualityScore: Print.imageQualityScore, imageVerifiedAt:   Print.imageVerifiedAt,
  }).from(Print).where(or(...conditions)) as Array<{
    cardId: string; version: string; set: string; number: string; lang: string; source: string;
    [k: string]: unknown;
  }>;

  const byKey = new Map(existing.map(r => [key(r), r]));
  for (const row of rows) {
    const cur = byKey.get(key(row as { cardId: string, version: string, set: string, number: string, lang: string, source: string }));
    if (cur == null || cur.imageSource == null) continue;
    for (const col of IMAGE_COLS) {
      (row as Record<string, unknown>)[col] = cur[col];
    }
  }
}
