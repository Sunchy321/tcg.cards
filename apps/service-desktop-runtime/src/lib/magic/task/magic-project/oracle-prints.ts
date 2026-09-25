import { and, eq, inArray, isNull, or } from 'drizzle-orm';

import { Print, PrintCommit, PrintPart } from '@tcg-cards/db/schema/local/magic';

import type { NameRubyLookup } from '../../name-ruby';
import type { ProjectDb, ScryfallRow } from '../../project/assemble';
import { assembleUnits } from '../../project/assemble';
import {
  MANUAL_PRINT_SOURCE,
  manualPrintKey,
  staleManualPrints,
  type LoadedPrintCommit,
} from '../../project/print-commits';
import { projectCard, type AssembledCard } from '../../project/project-card';
import {
  carryOverPrintImages,
  fillPrintImagesFromLedger,
  loadExistingPrintImages,
  loadPrintLedgerEntries,
} from '../../project/fill-print-images';
import { upsertBatch } from '../../upsert';

/** PK of the print fact tables, shared by every print-section upsert. */
export const PRINT_PK = ['cardId', 'version', 'set', 'number', 'lang', 'source'] as const;

/** Row budget of one recycle UPDATE batch. */
const MANUAL_RECYCLE_CHUNK = 200;

/**
 * Per-run statics the per-oracle print projection consumes. Loaded once by the
 * run's entry so chunk blocks stay self-sufficient after a resume.
 */
export interface OraclePrintsContext {
  /** unit key → resolved cardId for non-conflicting units. */
  unitToCard:     Map<string, string>;
  /** English reversible rows — the pool prints attribute from. */
  reversibleRows: ScryfallRow[];
  /** Reviewed name-ruby lookup — fills the ruby_* columns. */
  rubies:         NameRubyLookup;
  /** Print commits by oracle — the manual-print source. */
  printCommits:   Map<string, LoadedPrintCommit[]>;
}

/**
 * Override a unit's natural slug with its match-resolved cardId (resolutions
 * and merge groups may diverge from the natural name slug). Returns null when
 * the unit has no resolved cardId and must not project.
 */
export function withResolvedCardId(assembled: AssembledCard, unitToCard: Map<string, string>): AssembledCard | null {
  const cardId = unitToCard.get(assembled.unit);
  if (cardId == null) return null;
  return cardId === assembled.cardId ? assembled : { ...assembled, cardId };
}

/** Upsert one result section into its fact table; returns affected row count. */
export async function writeSection(database: ProjectDb, table: any, rows: unknown[] | undefined, pk: string[]): Promise<number> {
  if (rows == null || rows.length === 0) return 0;
  const target = pk.map(name => (table as any)[name]);
  const r = await upsertBatch(database, table, rows as never, target, pk);
  return r.inserted + r.updated + r.unchanged;
}

/** Loads the print commits grouped by their anchoring oracle. The table is
 * desktop-local single-user truth: every row projects, there is no gate. */
export async function loadPrintCommits(database: ProjectDb): Promise<Map<string, LoadedPrintCommit[]>> {
  const rows = await database.select().from(PrintCommit);
  const map = new Map<string, LoadedPrintCommit[]>();
  for (const row of rows) {
    const list = map.get(row.oracleId) ?? [];
    list.push({ set: row.set, number: row.number, lang: row.lang, faces: row.faces ?? [], metadata: row.metadata ?? null });
    map.set(row.oracleId, list);
  }
  return map;
}

/**
 * Soft-delete manual print rows (and their parts) outside this run's emitted
 * manual keys — the per-print counterpart of the cardId-granular stale sweep,
 * which cannot see a withdrawn position inside a live card. A scoped run
 * passes `scopeCardIds` so recycling only judges the manual prints of the
 * cards it actually re-projected; a full run omits it and sweeps the table.
 */
export async function softDeleteStaleManualPrints(
  database: ProjectDb,
  emitted: Set<string>,
  scopeCardIds?: Set<string>,
): Promise<number> {
  // An empty scope covers no cards, so nothing in it can be stale — a filter
  // omission here would wrongly sweep the whole table instead.
  if (scopeCardIds != null && scopeCardIds.size === 0) return 0;
  const scopeFilter = scopeCardIds != null ? inArray(Print.cardId, [...scopeCardIds]) : undefined;
  const active = await database.select({
    cardId: Print.cardId,
    set:    Print.set,
    number: Print.number,
    lang:   Print.lang,
  })
    .from(Print)
    .where(and(
      isNull(Print.deletedAt),
      eq(Print.version, ''),
      eq(Print.source, MANUAL_PRINT_SOURCE),
      scopeFilter,
    ));
  const stale = staleManualPrints(active, emitted);
  let deleted = 0;
  for (let i = 0; i < stale.length; i += MANUAL_RECYCLE_CHUNK) {
    const batch = stale.slice(i, i + MANUAL_RECYCLE_CHUNK);
    for (const table of [Print, PrintPart] as any[]) {
      const positions = batch.map(r => and(
        eq(table.cardId, r.cardId),
        eq(table.set, r.set),
        eq(table.number, r.number),
        eq(table.lang, r.lang),
      ));
      await database.update(table)
        .set({ deletedAt: new Date() })
        .where(and(eq(table.version, ''), eq(table.source, MANUAL_PRINT_SOURCE), or(...positions)));
    }
    deleted += batch.length;
  }
  return deleted;
}

/**
 * Writes one oracle's print-level facts: assemble the oracle's units with
 * their manual commits, resolve cardIds, then upsert Print/PrintPart with
 * image carryover and ledger fill. Returns affected row counts and the manual
 * print keys emitted — the recycle's kept set for both the full and scoped
 * runs.
 */
export async function projectOraclePrints(
  database: ProjectDb,
  oracle: string,
  ctx: OraclePrintsContext,
): Promise<{ prints: number, printParts: number, manualKeys: string[] }> {
  const oraclePrints: (typeof Print)['$inferInsert'][] = [];
  const oraclePrintParts: (typeof PrintPart)['$inferInsert'][] = [];
  for (const raw of await assembleUnits(database, oracle, ctx.reversibleRows, ctx.printCommits.get(oracle))) {
    const assembled = withResolvedCardId(raw, ctx.unitToCard);
    if (assembled == null) continue;
    // Prints are written before the card-consistency stage by design: print
    // rows per raw row are written regardless of card-level agreement (§7.4).
    const result = projectCard(assembled, ctx.rubies);
    oraclePrints.push(...result.prints);
    oraclePrintParts.push(...result.printParts);
  }
  // The prints' image fields come from the asset ledger — the ledger is where
  // image facts live, so a fact-table wipe still projects fully. Beneath it, a
  // fact row that already holds image data carries that data across: images
  // imported before the ledger existed have no ledger row, and dropping to the
  // raw source-side status would stamp a scryfall `placeholder` over a real
  // local image. Prints neither layer can speak for keep the scryfall
  // source-side status.
  const carries = await loadExistingPrintImages(database, oraclePrints);
  carryOverPrintImages(carries, oraclePrints);
  const ledger = await loadPrintLedgerEntries(database, oraclePrints);
  fillPrintImagesFromLedger(ledger, oraclePrints);
  const prints = await writeSection(database, Print, oraclePrints, [...PRINT_PK]);
  const printParts = await writeSection(database, PrintPart, oraclePrintParts, [...PRINT_PK, 'partIndex']);
  const manualKeys: string[] = [];
  for (const row of oraclePrints) {
    if (row.source === MANUAL_PRINT_SOURCE) manualKeys.push(manualPrintKey(row));
  }
  return { prints, printParts, manualKeys };
}
