import { and, eq, or } from 'drizzle-orm';

import { Print } from '@tcg-cards/db/schema/shared/magic/print';

type Db = any;
type PrintInsert = (typeof Print)['$inferInsert'];

const IMAGE_COLS = ['imageStatus', 'imageInfo'] as const;

function key(r: { cardId: string, version: string, set: string, number: string, lang: string, source: string }) {
  return [r.cardId, r.version, r.set, r.number, r.lang, r.source].join('\u0000');
}

/**
 * Preserve locally imported image fields across re-projection: when a prints
 * row already exists and its image_info is not null (a local image was written
 * by any of the scryfall/gatherer/manual modules), carry image_status and
 * image_info into the pending insert so the scryfall draft cannot clear them.
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
    cardId:      Print.cardId, version:     Print.version, set:         Print.set, number:      Print.number,
    lang:        Print.lang, source:      Print.source,
    imageStatus: Print.imageStatus, imageInfo:   Print.imageInfo,
  }).from(Print).where(or(...conditions)) as Array<{
    cardId: string; version: string; set: string; number: string; lang: string; source: string;
    [k: string]: unknown;
  }>;

  const byKey = new Map(existing.map(r => [key(r), r]));
  for (const row of rows) {
    const cur = byKey.get(key(row as { cardId: string, version: string, set: string, number: string, lang: string, source: string }));
    if (cur == null || cur.imageInfo == null) continue;
    for (const col of IMAGE_COLS) {
      (row as Record<string, unknown>)[col] = cur[col];
    }
  }
}
