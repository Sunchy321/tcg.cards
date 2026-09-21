#!/usr/bin/env bun

/**
 * Salvage the furigana readings that upstream flattened into Japanese print
 * names (ADR 0013 companion to ticket 02 of the name-rubies effort).
 *
 * Scryfall/Gatherer carry no ruby field, but for a slice of Japanese prints
 * (beginner products and one-off special readings) the printed ruby was glued
 * into `printed_name` itself as `漢字（かな）`. This script recovers those
 * readings into the name-ruby authority as DRAFT rows (source
 * `scryfall_salvage`): the glossed string is normalized, validated against the
 * cleaned name (balanced full-width parentheses, kana-only readings, base runs
 * rebuilding the name), and anchored to a name currently in use. Entries that
 * fail validation or have no anchor are counted and skipped — malformed
 * sources (truncations, mixed-width pairs) must not become rows.
 *
 * When one name carries distinct readings across printings, the most frequent
 * reading becomes the default and every differing printing lands in
 * `exceptions` under its `set:number` — print rows keep printing errors, so
 * the variants stay representable.
 *
 * Only rows whose status is still `draft` are updated on conflict; a row the
 * review already promoted is never demoted by a re-run.
 *
 * Usage:
 *   bun run apps/service-desktop-runtime/scripts/magic/name-ruby/salvage-scryfall.ts
 */

import { and, eq, isNull, sql } from 'drizzle-orm';

import { createDb } from '@tcg-cards/db';
import { NameRuby, ScryfallCard } from '@tcg-cards/db/schema/local/magic';
import { PrintPart } from '@tcg-cards/db/schema/shared/magic/print';
import {
  normalizeRubyParens,
  stripNameRuby,
  validateNameRuby,
} from '@tcg-cards/model/magic/name-ruby';

const url = process.env.DESKTOP_LOCAL_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/local';
const db = createDb(url);

const rows = await db.select({
  set:             ScryfallCard.set,
  number:          ScryfallCard.collectorNumber,
  printedName:     ScryfallCard.printedName,
  releasedAt:      ScryfallCard.releasedAt,
})
  .from(ScryfallCard)
  .where(and(
    eq(ScryfallCard.lang, 'ja'),
    isNull(ScryfallCard.deletedAt),
    sql`${ScryfallCard.printedName} ~ '[（(][ぁ-んァ-ヶーー]*[）)]'`,
  ));

// Names currently in use: the mapping table keys on these. Surfaces that
// still carry un-cleaned glosses are keyed by their cleaned form, so this
// script works before or after the projection repair.
const usedNames = new Set(
  (await db.select({ name: PrintPart.name })
    .from(PrintPart)
    .where(and(eq(PrintPart.lang, 'ja'), isNull(PrintPart.deletedAt))))
    .map(r => stripNameRuby(r.name)),
);

// name → reading → printing anchors (`set:number`)
type Reading = { reading: string, anchors: Set<string> };
const byName = new Map<string, Map<string, Reading>>();
let invalid = 0;
let candidates = 0;
let unanchored = 0;

function processGlossed(raw: string, set: string, number: string) {
  candidates++;
  const name = stripNameRuby(raw);
  const reading = validateNameRuby(name, normalizeRubyParens(raw));
  if (reading == null) { invalid++; return; }
  if (!usedNames.has(name)) { unanchored++; return; }
  let readings = byName.get(name);
  if (readings == null) { readings = new Map(); byName.set(name, readings); }
  const anchor = `${set}:${number}`;
  const entry = readings.get(reading);
  if (entry != null) entry.anchors.add(anchor);
  else readings.set(reading, { reading, anchors: new Set([anchor]) });
}

for (const row of rows) {
  if (row.printedName != null) processGlossed(row.printedName, row.set, row.number);
}

// Multi-face cards carry the glosses inside card_faces entries.
const faceRows = await db.select({
  set:             ScryfallCard.set,
  number:          ScryfallCard.collectorNumber,
  cardFaces:       ScryfallCard.cardFaces,
})
  .from(ScryfallCard)
  .where(and(
    eq(ScryfallCard.lang, 'ja'),
    isNull(ScryfallCard.deletedAt),
    sql`${ScryfallCard.cardFaces}::text ~ '[（(][ぁ-んァ-ヶーー]*[）)]'`,
  ));

for (const row of faceRows) {
  const faces = (row.cardFaces as Array<{ printed_name?: string }> | null) ?? [];
  for (const f of faces) {
    if (f.printed_name != null) processGlossed(f.printed_name, row.set, row.number);
  }
}

const values: (typeof NameRuby)['$inferInsert'][] = [];
for (const [name, readings] of byName) {
  // Most frequent reading becomes the default; differing printings become
  // `set:number` exceptions so the variants stay representable.
  const list = [...readings.values()].sort((a, b) => b.anchors.size - a.anchors.size);
  const def = list[0]!;
  const exceptions: Record<string, string> = {};
  for (const variant of list.slice(1)) {
    for (const anchor of variant.anchors) exceptions[anchor] = variant.reading;
  }
  values.push({
    lang: 'ja',
    kind: 'name',
    name,
    rubyName: def.reading,
    exceptions: Object.keys(exceptions).length > 0 ? exceptions : null,
    source: 'scryfall_salvage',
    status: 'draft',
  });
}

const CHUNK = 500;
for (let i = 0; i < values.length; i += CHUNK) {
  await db.insert(NameRuby).values(values.slice(i, i + CHUNK) as never)
    .onConflictDoUpdate({
      target: [NameRuby.lang, NameRuby.kind, NameRuby.name],
      set:    { rubyName: sql`excluded.ruby_name`, exceptions: sql`excluded.exceptions`, deletedAt: sql`null` },
      where:  eq(NameRuby.status, 'draft'),
    });
}

console.log(`glossed ja surfaces:     ${candidates}`);
console.log(`invalid (skipped):       ${invalid}`);
console.log(`unanchored (skipped):    ${unanchored}`);
console.log(`salvaged draft rows:     ${values.length}`);
console.log(`with set:number exceptions: ${values.filter(v => v.exceptions != null).length}`);
process.exit(0);
