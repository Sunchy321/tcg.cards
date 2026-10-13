import { and, eq, inArray, or } from 'drizzle-orm';

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
 * Fills the draft prints' image fields from the ledger — the top tier of the
 * projection's image sources. A real row becomes the face's metadata, a
 * placeholder tombstone pins the blocked state, and an absent key falls
 * through to the tier beneath: the print's own carried fact row (`carryOverPrintImages`),
 * or the scryfall source-side status when neither layer holds image data.
 * Mutates the draft rows in place.
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

/** The slice of a draft print row that identifies the fact row a carry-over reads. */
export interface PrintImageCarryDraft {
  cardId:       string;
  version?:     string;
  set:          string;
  number:       string;
  lang:         string;
  source?:      string;
  imageStatus?: string | null;
  imageInfo?:   ImageInfo | null;
}

/** Image fields of one stored fact row, as the carry-over hands them to a draft. */
export interface PrintImageCarry {
  imageStatus: string | null;
  imageInfo:   ImageInfo;
}

/** Primary-key identity of one print row, as the carry-over matches drafts to stored rows. */
function printCarryKey(row: { cardId: string, version?: string, set: string, number: string, lang: string, source?: string }): string {
  return [row.cardId, row.version ?? '', row.set, row.number, row.lang, row.source ?? ''].join('\u0000');
}

/**
 * Loads the stored fact rows' image facts for the given draft prints — the
 * fallback tier beneath the ledger. Images imported before the ledger existed
 * (and any fact written without its ledger row) live only in the fact table,
 * and a projection that fell straight through to the source-side status would
 * stamp a raw `placeholder` over such a real local image. Only rows whose
 * stored image_info carries data join the map: rows without image data have
 * nothing to carry, and their status keeps coming from the raw source.
 */
export async function loadExistingPrintImages(database: Db, rows: PrintImageCarryDraft[]): Promise<Map<string, PrintImageCarry>> {
  if (rows.length === 0) return new Map();
  const conditions = rows.map(row => and(
    eq(Print.cardId, row.cardId),
    eq(Print.version, row.version ?? ''),
    eq(Print.set, row.set),
    eq(Print.number, row.number),
    eq(Print.lang, row.lang as typeof Print.$inferSelect.lang),
    eq(Print.source, row.source ?? ''),
  ))!;
  const stored = await database.select({
    cardId:      Print.cardId,
    version:     Print.version,
    set:         Print.set,
    number:      Print.number,
    lang:        Print.lang,
    source:      Print.source,
    imageStatus: Print.imageStatus,
    imageInfo:   Print.imageInfo,
  }).from(Print).where(or(...conditions)) as Array<{
    cardId: string; version: string; set: string; number: string; lang: string; source: string;
    imageStatus: string | null; imageInfo: ImageInfo | null;
  }>;
  const carries = new Map<string, PrintImageCarry>();
  for (const row of stored) {
    if (row.imageInfo == null) continue;
    carries.set(printCarryKey(row), { imageStatus: row.imageStatus, imageInfo: row.imageInfo });
  }
  return carries;
}

/**
 * Carries each stored image fact into its draft, before the ledger fill runs
 * so a ledger row outranks it. The outer status derives from the carried faces
 * (the first non-null face, the same fallback the ledger fill applies) instead
 * of being copied, so a stored outer column that contradicts the stored facts
 * — the mismatch the ledger-less projection once wrote — heals on the next run
 * instead of persisting.
 */
export function carryOverPrintImages(carries: Map<string, PrintImageCarry>, rows: PrintImageCarryDraft[]): void {
  for (const row of rows) {
    const carry = carries.get(printCarryKey(row));
    if (carry == null) continue;
    row.imageInfo = carry.imageInfo;
    row.imageStatus = carry.imageInfo.find(face => face != null)?.status ?? carry.imageStatus;
  }
}
