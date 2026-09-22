import { inArray } from 'drizzle-orm';

import { AssetImage } from '@tcg-cards/db/schema/local/magic';
import { Print } from '@tcg-cards/db/schema/shared/magic/print';
import { isTwoImageLayout, printImageKey } from '@tcg-cards/shared/magic/print-image';
import type { ImageInfo } from '#model/magic/schema/print';

type Db = any;
type PrintInsert = (typeof Print)['$inferInsert'];
type LedgerEntry = typeof AssetImage.$inferSelect;

/**
 * Loads the ledger rows addressing the given draft prints' canonical files —
 * face 0 always, face 1 for two-image layouts. One batched query per call.
 */
export async function loadPrintLedgerEntries(database: Db, rows: PrintInsert[]): Promise<Map<string, LedgerEntry>> {
  const keys = new Set<string>();
  for (const row of rows) {
    const faces = isTwoImageLayout(row.layout) ? [0, 1] : [0];
    for (const face of faces) keys.add(printImageKey(row.set!, row.lang as string, row.number!, face));
  }
  if (keys.size === 0) return new Map();
  const entries = await database.select().from(AssetImage).where(inArray(AssetImage.key, [...keys])) as LedgerEntry[];
  return new Map(entries.map(entry => [entry.key, entry]));
}

/**
 * Fills the draft prints' image fields from the ledger — the replacement for
 * reading them off the fact table's own previous state. A real row becomes the
 * face's metadata, a placeholder tombstone pins the blocked state, and an
 * absent key leaves the scryfall source-side status standing. Mutates the
 * draft rows in place.
 */
export function fillPrintImagesFromLedger(ledger: Map<string, LedgerEntry>, rows: PrintImageDraft[]): void {
  for (const row of rows) {
    const faces = isTwoImageLayout(row.layout) ? [0, 1] : [0];
    const infos: ImageInfo = [];
    let sawAny = false;
    let primary: LedgerEntry | null = null;
    for (const face of faces) {
      const entry = ledger.get(printImageKey(row.set, row.lang, row.number, face)) ?? null;
      if (entry == null) {
        infos.push(null);
        continue;
      }
      sawAny = true;
      if (face === 0) primary = entry;
      infos.push(entry.status === 'placeholder'
        ? null
        : {
          status:       entry.status,
          type:         entry.format as NonNullable<ImageInfo[number]>['type'],
          source:       entry.source,
          sha256:       entry.sha256,
          width:        entry.width,
          height:       entry.height,
          byteSize:     entry.byteSize,
          qualityScore: entry.qualityScore,
          verifiedAt:   entry.verifiedAt!.toISOString(),
        });
    }
    if (!sawAny) continue;
    if (primary?.status === 'placeholder') {
      // A tombstone pins the whole print: no image, and no download task may
      // fetch one — it outranks whatever the raw source side reports.
      row.imageStatus = 'placeholder';
      row.imageInfo = null;
      continue;
    }
    row.imageInfo = infos;
    const primaryStatus = primary?.status ?? infos.find(info => info != null)?.status;
    if (primaryStatus != null) row.imageStatus = primaryStatus;
  }
}

/** The slice of a draft print row the image fill reads and writes. */
export interface PrintImageDraft {
  layout:       string;
  set:          string;
  lang:         string;
  number:       string;
  imageStatus?: string | null;
  imageInfo?:   ImageInfo | null;
}
