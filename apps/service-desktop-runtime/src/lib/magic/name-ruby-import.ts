import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { and, eq, isNull, sql } from 'drizzle-orm';
import { Database } from 'bun:sqlite';

import type { createDb } from '@tcg-cards/db';
import { NameRuby } from '@tcg-cards/db/schema/local/magic';
import { PrintPart } from '@tcg-cards/db/schema/shared/magic/print';
import {
  normalizeRubyParens,
  stripNameRuby,
  validateNameRuby,
} from '@tcg-cards/model/magic/name-ruby';

/** Database client shape used by the import (created by the caller). */
export type NameRubyImportDb = ReturnType<typeof createDb>;

export interface NameRubyImportCounts {
  /** MTGA card rows scanned. */
  cards:      number;
  /** Titles carrying an inline reading (`漢字（かな）`) — the candidates. */
  glossed:    number;
  /** Unique names written as draft rows. */
  anchored:   number;
  /** Candidates whose cleaned title is not an anchored surface name. */
  mismatched: number;
  /** Candidates with no (set, number) anchor in the local prints. */
  unanchored: number;
  /** Candidates whose reading failed validation. */
  invalid:    number;
}

export const emptyNameRubyImportCounts: NameRubyImportCounts = {
  cards:      0,
  glossed:    0,
  anchored:   0,
  mismatched: 0,
  unanchored: 0,
  invalid:    0,
};

/**
 * Resolves the MTGA card database file inside `dir`. The canonical file is
 * `Raw_CardDatabase.mtga`; when the MTGA `Manifest.mtga` sits beside it, the
 * `Raw_CardDatabase_*` asset entry pins the expected sha256, and a present
 * file failing that hash is an error rather than a warning — the mapping is
 * only as trustworthy as its source file.
 */
export function resolveCardDatabasePath(dir: string): string {
  const direct = join(dir, 'Raw_CardDatabase.mtga');
  const manifestPath = join(dir, 'Manifest.mtga');
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { Assets?: Array<{ Name: string, sha256?: string }> };
    const entry = manifest.Assets?.find(a => a.Name.startsWith('Raw_CardDatabase'));
    if (entry != null) {
      const named = join(dir, entry.Name);
      const file = existsSync(named) ? named : direct;
      if (!existsSync(file)) {
        throw new Error(`MTGA card database asset missing in ${dir}: ${entry.Name}`);
      }
      const hash = createHash('sha256').update(readFileSync(file)).digest('base64');
      if (entry.sha256 != null && hash !== entry.sha256) {
        throw new Error(`MTGA card database sha256 mismatch in ${dir}: expected ${entry.sha256}, got ${hash}`);
      }
      return file;
    }
  }
  if (!existsSync(direct)) {
    // The deferred form is the canonical input: the manifest's Length and
    // sha256 describe the decompressed file, and the archive is transport
    // compression only.
    const gz = join(dir, 'Raw_CardDatabase.mtga.gz');
    throw new Error(existsSync(gz)
      ? `Raw_CardDatabase.mtga is missing in ${dir} (found the .gz archive; the manifest verifies the decompressed file, so gunzip it first)`
      : `Raw_CardDatabase.mtga not found in ${dir}`);
  }
  return direct;
}

/**
 * Anchors for card-level import: `(set:number)` (set lowercased, number
 * trimmed) → the cleaned surface names currently in use. Names still carrying
 * un-cleaned glosses are keyed by their cleaned form, so the import works
 * before or after the projection repair.
 */
export async function loadNameRubyAnchors(database: NameRubyImportDb): Promise<Map<string, Set<string>>> {
  const rows = await database.select({
    set:    PrintPart.set,
    number: PrintPart.number,
    name:   PrintPart.name,
  })
    .from(PrintPart)
    .where(and(eq(PrintPart.lang, 'ja'), isNull(PrintPart.deletedAt)));

  const anchors = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = `${row.set.toLowerCase()}:${row.number.trim()}`;
    let names = anchors.get(key);
    if (names == null) { names = new Set(); anchors.set(key, names); }
    names.add(stripNameRuby(row.name));
  }
  return anchors;
}

export interface NameRubyImportRow {
  lang:     'ja';
  kind:     'name';
  name:     string;
  rubyName: string;
  source:   'mtga_loc';
  status:   'draft';
}

const CONTROL_CHARS_RE = /[\u200E\u200F\u200B]/g;
const GLOSS_RE = /[（(][ぁ-んァ-ヶーー]*[）)]/;

/**
 * Extract draft mapping rows from an MTGA card database (the `Raw_CardDatabase`
 * SQLite file). Localization strings resolve per LocId preferring the lowest
 * `Formatted` variant (the template); `Cards` anchors each title to a printing
 * via `(ExpansionCode, CollectorNumber)`, and only titles whose cleaned form
 * matches an anchored surface name become rows — ability/enum strings never
 * enter the mapping because only card titles are read.
 */
export function extractNameRubyRows(
  cardDatabase: Database,
  anchors: Map<string, Set<string>>,
): { rows: NameRubyImportRow[], counts: NameRubyImportCounts } {
  const counts: NameRubyImportCounts = { ...emptyNameRubyImportCounts };
  const rows = new Map<string, NameRubyImportRow>();

  // Per LocId the lowest `Formatted` variant is the template string.
  const readings = new Map<number, string>();
  const best = new Map<number, { formatted: number, text: string }>();
  for (const r of cardDatabase.prepare('SELECT LocId, Formatted, Loc FROM Localizations_jaJP').all() as Array<{ LocId: number, Formatted: number, Loc: string | null }>) {
    if (r.Loc == null) continue;
    const cur = best.get(r.LocId);
    if (cur == null || r.Formatted < cur.formatted) best.set(r.LocId, { formatted: r.Formatted, text: r.Loc });
  }
  for (const [locId, v] of best) readings.set(locId, v.text);

  const cards = cardDatabase.prepare('SELECT TitleId, ExpansionCode, CollectorNumber FROM Cards').all() as Array<{ TitleId: number, ExpansionCode: string, CollectorNumber: string }>;

  for (const card of cards) {
    counts.cards++;
    const raw = readings.get(card.TitleId);
    if (raw == null) continue;
    const title = raw.replace(CONTROL_CHARS_RE, '');
    if (!GLOSS_RE.test(title)) continue;
    counts.glossed++;

    const name = stripNameRuby(title);
    const anchorNames = anchors.get(`${card.ExpansionCode.toLowerCase()}:${card.CollectorNumber.trim()}`);
    if (anchorNames == null) { counts.unanchored++; continue; }
    if (!anchorNames.has(name)) { counts.mismatched++; continue; }

    const rubyName = validateNameRuby(name, normalizeRubyParens(title));
    if (rubyName == null) { counts.invalid++; continue; }

    if (!rows.has(name)) {
      rows.set(name, { lang: 'ja', kind: 'name', name, rubyName, source: 'mtga_loc', status: 'draft' });
    }
  }
  counts.anchored = rows.size;
  return { rows: [...rows.values()], counts };
}

/** Runs the import end to end: resolve file → anchors → extract → draft upsert. */
export async function runNameRubyImport(database: NameRubyImportDb, dir: string): Promise<NameRubyImportCounts> {
  const file = resolveCardDatabasePath(dir);
  const anchors = await loadNameRubyAnchors(database);

  const cardDatabase = new Database(file, { readonly: true });
  let extracted: { rows: NameRubyImportRow[], counts: NameRubyImportCounts };
  try {
    extracted = extractNameRubyRows(cardDatabase, anchors);
  } finally {
    cardDatabase.close();
  }

  const values = extracted.rows;
  const CHUNK = 500;
  for (let i = 0; i < values.length; i += CHUNK) {
    await database.insert(NameRuby).values(values.slice(i, i + CHUNK) as never)
      .onConflictDoUpdate({
        target: [NameRuby.lang, NameRuby.kind, NameRuby.name],
        set:    {
          // The reading is rewritten together with its origin: a draft row
          // whose reading this source just replaced would otherwise keep the
          // earlier source's label and misreport where the value came from.
          rubyName:  sql`excluded.ruby_name`,
          source:    sql`excluded.source`,
          deletedAt: sql`null`,
        },
        where: eq(NameRuby.status, 'draft'),
      });
  }
  return extracted.counts;
}
