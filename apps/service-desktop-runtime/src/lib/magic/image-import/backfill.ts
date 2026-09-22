import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';

import { AssetImage } from '@tcg-cards/db/schema/local/magic';
import { Print } from '@tcg-cards/db/schema/shared/magic/print';
import { printImageKey } from '@tcg-cards/shared/magic/print-image';
import type { ImageInfo } from '#model/magic/schema/print';

import type { LocalDb } from '../../hearthstone/hsdata-local-db';
import { cardImageRoot } from './common';
import { assetImageValues } from './ingest';
import { pushCapped } from './result';
import { runWithDb } from '@tcg-cards/db';
import { upsertBatch } from '../upsert';

export type FaceFileVerdict = 'ok' | 'missing' | 'mismatch';

/** Checks one face's canonical file against its recorded byte size. */
export function checkFaceFile(root: string, key: string, byteSize: number): FaceFileVerdict {
  const file = join(root, key);
  if (!existsSync(file)) return 'missing';
  return statSync(file).size === byteSize ? 'ok' : 'mismatch';
}

/** Print coordinates that address one canonical image file. */
export interface PrintImageCoords {
  set:    string;
  lang:   string;
  number: string;
}

export interface LedgerBackfillPrep {
  rows:          Array<(typeof AssetImage)['$inferInsert']>;
  /** Face slots carrying metadata, whether or not their file verified. */
  faces:         number;
  missing:       number;
  mismatched:    number;
  missingKeys:   string[];
  mismatchKeys:  string[];
}

/**
 * Converts one print's recorded face metadata into ledger rows. The ledger
 * asserts files, so a face joins the batch only when its file verifies at the
 * recorded byte size — missing and resized faces are reported instead of
 * silently converted, and the fact rows stay untouched either way.
 */
export function ledgerRowsForPrint(root: string, coords: PrintImageCoords, imageInfo: ImageInfo, verifiedAt: Date): LedgerBackfillPrep {
  const prep: LedgerBackfillPrep = { rows: [], faces: 0, missing: 0, mismatched: 0, missingKeys: [], mismatchKeys: [] };
  for (let i = 0; i < imageInfo.length; i++) {
    const meta = imageInfo[i];
    if (meta == null) continue;
    prep.faces += 1;
    const key = printImageKey(coords.set, coords.lang, coords.number, i);
    const verdict = checkFaceFile(root, key, meta.byteSize);
    if (verdict === 'missing') {
      prep.missing += 1;
      pushCapped(prep.missingKeys, key);
      continue;
    }
    if (verdict === 'mismatch') {
      prep.mismatched += 1;
      pushCapped(prep.mismatchKeys, key);
      continue;
    }
    prep.rows.push({ ...assetImageValues(key, meta), verifiedAt });
  }
  return prep;
}

export interface AssetLedgerBackfillCounts {
  /** Face slots carrying metadata, whether or not their file verified. */
  faces:        number;
  seeded:       number;
  updated:      number;
  unchanged:    number;
  missing:      number;
  mismatched:   number;
  missingKeys:  string[];
  mismatchKeys: string[];
  /** Placeholder tombstones written for prints already marked as no-image. */
  tombstones:        number;
  /** Prints whose placeholder state is already represented in the ledger. */
  tombstoneUnchanged: number;
}

const CHUNK = 500;

/**
 * Backfills the image asset ledger from the prints' recorded image metadata.
 * Reads only — the fact rows are never touched, and a rerun converges: rows
 * already identical to their metadata are skipped by the change check.
 */
export async function backfillAssetLedger(db: LocalDb, scope: { set?: string; langs?: string[] } = {}): Promise<AssetLedgerBackfillCounts> {
  const root = cardImageRoot();
  const verifiedAt = new Date();
  const counts: AssetLedgerBackfillCounts = {
    faces: 0, seeded: 0, updated: 0, unchanged: 0, missing: 0, mismatched: 0, missingKeys: [], mismatchKeys: [],
    tombstones: 0, tombstoneUnchanged: 0,
  };

  const conditions = [
    isNull(Print.deletedAt),
    isNotNull(Print.imageInfo),
    ...(scope.set != null ? [eq(Print.set, scope.set)] : []),
    ...(scope.langs?.length ? [inArray(Print.lang, scope.langs as typeof Print.$inferSelect.lang[])] : []),
  ];
  const where = and(...conditions);
  const done = new Set<string>();

  for (let offset = 0; ; offset += CHUNK) {
    const rows = await runWithDb(db, () => db.select({
      set:       Print.set,
      lang:      Print.lang,
      number:    Print.number,
      imageInfo: Print.imageInfo,
    }).from(Print).where(where)
      .orderBy(Print.cardId, Print.version, Print.set, Print.number, Print.lang, Print.source)
      .limit(CHUNK)
      .offset(offset));
    if (rows.length === 0) break;

    // Source variants of one printing share their file, so the first non-null
    // metadata wins and no face is converted twice across chunks.
    const prints = new Map<string, { lang: string; number: string; set: string; imageInfo: ImageInfo }>();
    for (const r of rows) {
      if (r.imageInfo == null) continue;
      const printKey = `${r.lang}/${r.number}`;
      if (!done.has(printKey) && !prints.has(printKey)) {
        prints.set(printKey, { lang: r.lang, number: r.number, set: r.set, imageInfo: r.imageInfo });
      }
    }

    const batch: Array<(typeof AssetImage)['$inferInsert']> = [];
    for (const print of prints.values()) {
      const prep = ledgerRowsForPrint(root, { set: print.set, lang: print.lang, number: print.number }, print.imageInfo, verifiedAt);
      counts.faces += prep.faces;
      counts.missing += prep.missing;
      counts.mismatched += prep.mismatched;
      counts.missingKeys.push(...prep.missingKeys);
      counts.mismatchKeys.push(...prep.mismatchKeys);
      batch.push(...prep.rows);
    }
    if (batch.length > 0) {
      // A row whose metadata already matches is left untouched — the only
      // difference a rerun would stamp is a fresh verified_at, and churning
      // every row on every pass would make the counts lie.
      const existing = await runWithDb(db, () => db.select().from(AssetImage).where(inArray(AssetImage.key, batch.map(row => row.key))));
      const byKey = new Map(existing.map(row => [row.key, row]));
      const identical = (row: (typeof AssetImage)['$inferInsert'], cur: typeof AssetImage.$inferSelect) =>
        cur.format === row.format && cur.source === row.source && cur.sha256 === row.sha256
        && cur.width === row.width && cur.height === row.height && cur.byteSize === row.byteSize
        && cur.status === row.status && cur.qualityScore === row.qualityScore;
      const toWrite = batch.filter(row => {
        const cur = byKey.get(row.key);
        if (cur != null && identical(row, cur)) {
          counts.unchanged += 1;
          return false;
        }
        return true;
      });
      if (toWrite.length > 0) {
        const result = await runWithDb(db, () => upsertBatch(db, AssetImage, toWrite, [AssetImage.key], ['key']));
        counts.seeded += result.inserted;
        counts.updated += result.updated;
      }
    }
    for (const printKey of prints.keys()) done.add(printKey);
    if (rows.length < CHUNK) break;
  }

  // Second pass: prints already marked placeholder carry the reset memory —
  // "no image here, never fetch one" — as tombstone rows. The fact rows stay
  // untouched, and a key that already has a ledger row is never demoted.
  const placeholderWhere = and(
    isNull(Print.deletedAt),
    eq(Print.imageStatus, 'placeholder'),
    isNull(Print.imageInfo),
    ...(scope.set != null ? [eq(Print.set, scope.set)] : []),
    ...(scope.langs?.length ? [inArray(Print.lang, scope.langs as typeof Print.$inferSelect.lang[])] : []),
  );
  for (let offset = 0; ; offset += CHUNK) {
    const rows = await runWithDb(db, () => db.select({
      set:    Print.set,
      lang:   Print.lang,
      number: Print.number,
    }).from(Print).where(placeholderWhere)
      .orderBy(Print.cardId, Print.version, Print.set, Print.number, Print.lang, Print.source)
      .limit(CHUNK)
      .offset(offset));
    if (rows.length === 0) break;

    const batch: Array<(typeof AssetImage)['$inferInsert']> = [];
    for (const r of rows) {
      const printKey = `${r.lang}/${r.number}`;
      if (done.has(printKey)) continue;
      batch.push({
        key:          printImageKey(r.set, r.lang, r.number),
        format:       '',
        source:       '',
        sha256:       '',
        width:        0,
        height:       0,
        byteSize:     0,
        status:       'placeholder',
        qualityScore: null,
        verifiedAt,
      });
    }
    if (batch.length > 0) {
      const existing = await runWithDb(db, () => db.select({ key: AssetImage.key }).from(AssetImage).where(inArray(AssetImage.key, batch.map(row => row.key))));
      const occupied = new Set(existing.map(row => row.key));
      const toWrite = batch.filter(row => {
        if (occupied.has(row.key)) {
          counts.tombstoneUnchanged += 1;
          return false;
        }
        return true;
      });
      if (toWrite.length > 0) {
        const result = await runWithDb(db, () => upsertBatch(db, AssetImage, toWrite, [AssetImage.key], ['key']));
        counts.tombstones += result.inserted + result.updated;
      }
    }
    for (const r of rows) done.add(`${r.lang}/${r.number}`);
    if (rows.length < CHUNK) break;
  }
  return counts;
}
