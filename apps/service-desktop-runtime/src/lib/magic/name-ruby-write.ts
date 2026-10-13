import { and, eq, inArray, isNull, or } from 'drizzle-orm';

import type { createDb } from '@tcg-cards/db';
import { CardLocalization, CardPartLocalization } from '@tcg-cards/db/schema/shared/magic/card';
import { Print, PrintPart } from '@tcg-cards/db/schema/shared/magic/print';
import { resolveNameRuby, type NameRubyKind, type NameRubyLookup } from '@tcg-cards/model/magic/name-ruby';

import { upsertBatch } from './upsert';

/** Database client shape used by the write-through (created by the caller). */
export type NameRubyWriteDb = ReturnType<typeof createDb>;

/** Locale union of the surface tables (the enum column rejects a bare string). */
export type NameRubyLocale = (typeof PrintPart)['$inferSelect']['lang'];

/** Face separator inside a joined whole-card name (mirrors the projection). */
const LINE_FACE_SEPARATOR = ' // ';

/** Authority keys per statement; keeps composite-key lookups inside a sane size. */
const CHUNK = 400;

export interface NameRubyWriteCounts {
  prints:       number;
  printParts:   number;
  cardLocs:     number;
  cardPartLocs: number;
}

export const emptyNameRubyWriteCounts: NameRubyWriteCounts = {
  prints: 0, printParts: 0, cardLocs: 0, cardPartLocs: 0,
};

const PRINT_PK = ['cardId', 'version', 'set', 'number', 'lang', 'source'] as const;
const PRINT_PART_PK = [...PRINT_PK, 'partIndex'] as const;
const CARD_LOC_PK = ['cardId', 'version', 'locale', 'source'] as const;
const CARD_PART_LOC_PK = [...CARD_LOC_PK, 'partIndex'] as const;

/** Audit columns are stripped so an upsert never rewrites timestamps from a read row. */
function stripAudit<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const { createdAt: _c, updatedAt: _u, deletedAt: _d, ...rest } = row;
  return rest;
}

/** Resolves one face's annotation; null when the authority has nothing valid. */
function rubyFor(
  lookup: NameRubyLookup,
  lang: NameRubyLocale,
  kind: NameRubyKind,
  name: string,
  set: string,
  number: string,
): string | null {
  return resolveNameRuby(lookup, { lang, kind, name, set, number });
}

/** Resolves a joined multi-face value: every face must resolve, else null. */
function joinedRubyFor(
  lookup: NameRubyLookup,
  lang: NameRubyLocale,
  joined: string,
  set: string,
  number: string,
): string | null {
  const resolved = joined.split(LINE_FACE_SEPARATOR)
    .map(face => rubyFor(lookup, lang, 'name', face, set, number));
  return resolved.every(r => r != null) ? resolved.join(LINE_FACE_SEPARATOR) : null;
}

/**
 * Applies the name-ruby authority to the result tables for the given names.
 *
 * The authority is the single source of the annotation and this is the one
 * resolver that turns it into the stored `ruby_*` columns: it reads each
 * affected row's own name and printing, resolves against the reviewed lookup,
 * and writes the row back when the value differs — so a promotion or an edit
 * reaches the site without a full projection run, and the projection resolves
 * through the same function.
 *
 * Rows are located by key rather than by name pattern: the per-face rows are
 * matched on the changed name, then their printings and cards pull in the
 * joined row above them (a print or card-level name joins its faces and is
 * resolved as a whole, so it can be affected by a change to one face).
 */
export async function applyNameRuby(
  database: NameRubyWriteDb,
  lookup: NameRubyLookup,
  keys: Array<{ lang: NameRubyLocale, kind: NameRubyKind, name: string }>,
): Promise<NameRubyWriteCounts> {
  const counts: NameRubyWriteCounts = { ...emptyNameRubyWriteCounts };
  if (keys.length === 0) return counts;

  const byLang = new Map<NameRubyLocale, Array<{ kind: NameRubyKind, name: string }>>();
  for (const key of keys) {
    const list = byLang.get(key.lang) ?? [];
    list.push({ kind: key.kind, name: key.name });
    byLang.set(key.lang, list);
  }

  for (const [lang, entries] of byLang) {
    const allNames = [...new Set(entries.map(e => e.name))];
    for (let i = 0; i < allNames.length; i += CHUNK) {
      await applyChunk(database, lookup, lang, allNames.slice(i, i + CHUNK), counts);
    }
  }
  return counts;
}

async function applyChunk(
  database: NameRubyWriteDb,
  lookup: NameRubyLookup,
  lang: NameRubyLocale,
  names: string[],
  counts: NameRubyWriteCounts,
): Promise<void> {
  // --- per-face rows: names and flavor names of print_parts, names of
  // card_part_localizations. These carry the changed name directly.
  const partRows = await database.select().from(PrintPart).where(and(
    eq(PrintPart.lang, lang),
    isNull(PrintPart.deletedAt),
    inArray(PrintPart.name, names),
  ));
  const flavorPartRows = await database.select().from(PrintPart).where(and(
    eq(PrintPart.lang, lang),
    isNull(PrintPart.deletedAt),
    inArray(PrintPart.flavorName, names),
  ));
  const allPartRows = dedupe([...partRows, ...flavorPartRows], PRINT_PART_PK);

  const partUpdates: Record<string, unknown>[] = [];
  for (const row of allPartRows) {
    const rubyName = rubyFor(lookup, lang, 'name', row.name, row.set, row.number);
    const rubyFlavorName = row.flavorName != null
      ? rubyFor(lookup, lang, 'flavor_name', row.flavorName, row.set, row.number)
      : null;
    if (rubyName === row.rubyName && rubyFlavorName === row.rubyFlavorName) continue;
    partUpdates.push(stripAudit({ ...row, rubyName, rubyFlavorName }));
  }
  if (partUpdates.length > 0) {
    counts.printParts += await writeRows(database, PrintPart, partUpdates, PRINT_PART_PK);
  }

  const partLocRows = await database.select().from(CardPartLocalization).where(and(
    eq(CardPartLocalization.locale, lang),
    isNull(CardPartLocalization.deletedAt),
    inArray(CardPartLocalization.name, names),
  ));
  const partLocUpdates: Record<string, unknown>[] = [];
  for (const row of partLocRows) {
    // A card-level row is not tied to one printing, so it carries the
    // authority's default reading rather than a print exception.
    const rubyName = rubyFor(lookup, lang, 'name', row.name, '', '');
    if (rubyName === row.rubyName) continue;
    partLocUpdates.push(stripAudit({ ...row, rubyName }));
  }
  if (partLocUpdates.length > 0) {
    counts.cardPartLocs += await writeRows(database, CardPartLocalization, partLocUpdates, CARD_PART_LOC_PK);
  }

  // --- joined rows above them: prints and card_localizations. Reached through
  // the printing / card keys of the per-face rows just read.
  const printings = dedupe(allPartRows.map(r => ({ cardId: r.cardId, version: r.version, set: r.set, number: r.number })), ['cardId', 'version', 'set', 'number']);
  if (printings.length > 0) {
    const printRows = await database.select().from(Print).where(and(
      eq(Print.lang, lang),
      isNull(Print.deletedAt),
      or(...printings.map(p => and(
        eq(Print.cardId, p.cardId), eq(Print.version, p.version),
        eq(Print.set, p.set), eq(Print.number, p.number),
      ))),
    ));
    const printUpdates: Record<string, unknown>[] = [];
    for (const row of printRows) {
      const rubyName = row.name.includes(LINE_FACE_SEPARATOR)
        ? joinedRubyFor(lookup, lang, row.name, row.set, row.number)
        : rubyFor(lookup, lang, 'name', row.name, row.set, row.number);
      if (rubyName === row.rubyName) continue;
      printUpdates.push(stripAudit({ ...row, rubyName }));
    }
    if (printUpdates.length > 0) {
      counts.prints += await writeRows(database, Print, printUpdates, PRINT_PK);
    }
  }

  const cards = dedupe([
    ...allPartRows.map(r => ({ cardId: r.cardId, version: r.version })),
    ...partLocRows.map(r => ({ cardId: r.cardId, version: r.version })),
  ], ['cardId', 'version']);
  if (cards.length > 0) {
    const locRows = await database.select().from(CardLocalization).where(and(
      eq(CardLocalization.locale, lang),
      isNull(CardLocalization.deletedAt),
      or(...cards.map(c => and(eq(CardLocalization.cardId, c.cardId), eq(CardLocalization.version, c.version)))),
    ));
    const locUpdates: Record<string, unknown>[] = [];
    for (const row of locRows) {
      const rubyName = joinedRubyFor(lookup, lang, row.name, '', '');
      if (rubyName === row.rubyName) continue;
      locUpdates.push(stripAudit({ ...row, rubyName }));
    }
    if (locUpdates.length > 0) {
      counts.cardLocs += await writeRows(database, CardLocalization, locUpdates, CARD_LOC_PK);
    }
  }
}

function dedupe<T extends Record<string, unknown>>(rows: T[], pk: readonly string[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = pk.map(k => String(row[k])).join('\u0000');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

async function writeRows(
  database: NameRubyWriteDb,
  table: unknown,
  rows: Record<string, unknown>[],
  pk: readonly string[],
): Promise<number> {
  const t = table as Record<string, unknown>;
  const result = await upsertBatch(database, table, rows as never, pk.map(k => t[k]), [...pk]);
  return result.inserted + result.updated;
}
