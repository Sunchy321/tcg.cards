import { z } from 'zod';

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { runWithDb } from '@tcg-cards/db';
import { Card, CardLocalization, CardPart, CardPartLocalization } from '@tcg-cards/db/schema/shared/magic/card';
import { Print, PrintPart } from '@tcg-cards/db/schema/shared/magic/print';
import { CardLocalizationAuthority, CardSlugResolution, ProjectionReview, ScryfallCard } from '@tcg-cards/db/schema/local/magic';

import { createDefinition } from '#task/definition';
import { getLocalDb } from '../../../hearthstone/hsdata-local-db';
import { matchBatch } from '../../match';
import { loadNameRubyLookup, type NameRubyLookup } from '../../name-ruby';
import { assembleUnits, loadReversibleRows, type ProjectDb, type ScryfallRow } from '../../project/assemble';
import { inconsistentMergedSlugs } from '../../project/consistency';
import type { LoadedPrintCommit } from '../../project/print-commits';
import { projectCard, type AssembledCard, type ProjectCardResult } from '../../project/project-card';
import {
  loadPrintCommits,
  projectOraclePrints,
  softDeleteStaleManualPrints,
  softDeleteStaleSourcePrints,
  withResolvedCardId,
  writeSection,
} from './oracle-prints';

/** Stable task type for projecting magic raw caches into the fact tables. */
export const magicProjectTaskType = 'magic_project';

const ORACLE_CHUNK_SIZE = 200;
const CARD_CHUNK_SIZE = 200;

const output = z.object({
  openConflicts:  z.number(),
  cards:          z.number(),
  cardParts:      z.number(),
  cardLocs:       z.number(),
  cardPartLocs:   z.number(),
  prints:         z.number(),
  printParts:     z.number(),
  authorities:    z.number(),
  reviews:        z.number(),
  softDeleted:    z.number(),
  manualRecycled: z.number(),
});

type Counts = z.infer<typeof output>;

const emptyCounts: Counts = {
  openConflicts:  0, cards:          0, cardParts:      0, cardLocs:       0, cardPartLocs:   0,
  prints:         0, printParts:     0, authorities:    0, reviews:        0, softDeleted:    0,
  manualRecycled: 0,
};

interface ProjectCtx {
  /** unit key → resolved cardId for non-conflicting units (refreshed per stage entry). */
  unitToCard:     Map<string, string>;
  /** Sorted distinct oracles contributing units (stage 2, refreshed per entry). */
  oracleList:     string[];
  /** English reversible rows, static per run — the pool prints attribute from. */
  reversibleRows: ScryfallRow[];
  /** Reviewed name-ruby lookup, static per run — fills the ruby_* columns. */
  rubies:         NameRubyLookup;
  /** Print commits by oracle, static per run — synthesized as manual prints. */
  printCommits:   Map<string, LoadedPrintCommit[]>;
  /** Sorted distinct cardIds with their member unit keys (stage 3). */
  cardsByCardId:  Map<string, string[]>;
  cardIdList:     string[];
  openConflicts:  number;
  counts:         Counts;
}

/** One bounded chunked stage's durable checkpoint state. */
interface ChunkState {
  index:       number;
  total:       number;
  /** Progress unit processed so far (source rows for the prints stage). */
  done?:       number;
  counts:      Partial<Counts>;
  /** `cardId|set|number|lang` of the manual prints emitted so far (prints stage). */
  manualKeys?: string[];
  /** `cardId|set|number|lang` of the source prints emitted so far (prints stage). */
  sourceKeys?: string[];
}

/** Source-row count per oracle (all languages; the rows assembleUnits consumes). */
async function sourceRowCounts(database: ProjectDb, oracles: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < oracles.length; i += 10_000) {
    const rows = await database.select({ oracleId: ScryfallCard.oracleId, n: sql<number>`count(*)::int` })
      .from(ScryfallCard)
      .where(inArray(ScryfallCard.oracleId, oracles.slice(i, i + 10_000)))
      .groupBy(ScryfallCard.oracleId);
    for (const r of rows) out.set(String(r.oracleId), Number(r.n));
  }
  return out;
}

function addAll(target: Counts, delta: Partial<Counts>) {
  (Object.keys(delta) as (keyof Counts)[]).forEach(k => {
    target[k] += delta[k] ?? 0;
  });
}

const CARD_PK = ['cardId', 'version'] as const;

/** Table writers used by the reconcile stage: soft-delete stale base rows. */
const BASE_TABLES = [
  { table: Card, pk: ['cardId', 'version'] },
  { table: CardPart, pk: ['cardId', 'version', 'partIndex'] },
  { table: CardLocalization, pk: ['cardId', 'version', 'locale', 'source'] },
  { table: CardPartLocalization, pk: ['cardId', 'version', 'locale', 'source', 'partIndex'] },
  { table: Print, pk: ['cardId', 'version', 'set', 'number', 'lang', 'source'] },
  { table: PrintPart, pk: ['cardId', 'version', 'set', 'number', 'lang', 'source', 'partIndex'] },
  { table: CardLocalizationAuthority, pk: ['cardId', 'version', 'locale', 'source'] },
];

/**
 * Reconcile one table: soft-delete base rows (version='') whose cardId is no
 * longer projected.
 */
async function softDeleteStale(database: ProjectDb, table: any, cardIdCol: any, target: Set<string>) {
  const active = await database.select({ cardId: cardIdCol })
    .from(table)
    .where(and(isNull(table.deletedAt), eq(table.version, '')));
  const missing = [...new Set(active.map((r: { cardId: string }) => r.cardId))]
    .filter(id => !target.has(id));
  if (missing.length === 0) return 0;
  await database.update(table)
    .set({ deletedAt: new Date() })
    .where(and(eq(table.version, ''), inArray(cardIdCol, missing)));
  return missing.length;
}

const definition = createDefinition(magicProjectTaskType, {
  version:     '2026-09-23:v2',
  effectModel: 'reconcilable',
})
  .scope(z.object({}), {
    type:    'magic_project',
    resolve: () => ({ key: 'global', snapshot: {} }),
  })
  .input(z.object({}))
  .output(output)
  .context({ init: values => values })
  .stage('match', { label: '匹配', progressMode: 'simple' })
  .handler(async ({ ctx }) => {
    const magic = ctx as unknown as ProjectCtx;
    magic.counts = { ...emptyCounts };
    magic.openConflicts = 0;
    await runWithDb(getLocalDb(), async () => {
      const database = getLocalDb();
      const matched = await matchBatch(database);

      // Persist open slug conflicts into the shared review queue (kind
      // slug_conflict). Pending rows are recomputed each run; resolved rows
      // are left untouched.
      await database.delete(ProjectionReview)
        .where(and(eq(ProjectionReview.kind, 'slug_conflict'), eq(ProjectionReview.status, 'pending')));
      const openRows: (typeof ProjectionReview)['$inferInsert'][] = [];
      for (const [slug, keys] of matched.conflicts) {
        openRows.push({ kind: 'slug_conflict', subject: { slug }, payload: { members: keys, reason: 'conflict' }, status: 'pending' });
      }
      for (const [slug, keys] of matched.blocked) {
        openRows.push({ kind: 'slug_conflict', subject: { slug }, payload: { members: keys, reason: 'blocked' }, status: 'pending' });
      }
      if (openRows.length > 0) {
        await database.insert(ProjectionReview).values(openRows as never);
      }
      magic.openConflicts = matched.conflicts.size + matched.blocked.size;
    });
    magic.counts.openConflicts = magic.openConflicts;
    return magic.counts;
  })
  .stage('prints', { label: '印刷投影', progressMode: 'bounded', resumeMode: 'durable' })
  .entry(async ({ ctx, checkpoint }) => {
    const magic = ctx as unknown as ProjectCtx;
    await runWithDb(getLocalDb(), async () => {
      // Match is deterministic and cheap enough to recompute per stage entry —
      // ctx from earlier stages is gone after a resume, so entry must be
      // self-sufficient.
      const database = getLocalDb();
      const matched = await matchBatch(database);
      magic.unitToCard = matched.cardIdByUnit;
      magic.oracleList = [...new Set([...matched.cardIdByUnit.keys()].map(k => (k.includes(':') ? k.slice(0, k.indexOf(':')) : k)))].sort();
      magic.reversibleRows = await loadReversibleRows(database);
      magic.rubies = await loadNameRubyLookup(database);
      magic.printCommits = await loadPrintCommits(database);
    });
    magic.counts ??= { ...emptyCounts };
    const restored = checkpoint?.blockInput as ChunkState | undefined;
    if (restored) return { total: restored.total, blockInput: restored };
    // Progress counts SOURCE rows, not emitted print rows — the raw-row →
    // print expansion is not 1:1 (split DFTs double up; reversible rows
    // contribute prints to the card they reference).
    const rowCounts = await sourceRowCounts(getLocalDb(), magic.oracleList);
    const total = [...rowCounts.values()].reduce((a, b) => a + b, 0);
    return { total, blockInput: { index: 0, done: 0, total, counts: {}, sourceKeys: [] } };
  })
  .block(async ({ ctx, blockInput, progress, checkpoint, done }) => {
    const magic = ctx as unknown as ProjectCtx;
    const chunk = magic.oracleList.slice(blockInput.index, blockInput.index + ORACLE_CHUNK_SIZE);
    const rowCounts = await runWithDb(getLocalDb(), () => sourceRowCounts(getLocalDb(), chunk));

    const counts = { prints: 0, printParts: 0 };
    const manualKeys: string[] = [];
    const sourceKeys: string[] = [];
    let doneRows = blockInput.done ?? 0;
    await runWithDb(getLocalDb(), async () => {
      const database = getLocalDb();
      for (const oracle of chunk) {
        const wrote = await projectOraclePrints(database, oracle, magic);
        counts.prints += wrote.prints;
        counts.printParts += wrote.printParts;
        // The recycles' kept sets travel through the checkpoint so a resumed
        // run recycles exactly what it itself emitted.
        manualKeys.push(...wrote.manualKeys);
        sourceKeys.push(...wrote.sourceKeys);
        doneRows += rowCounts.get(oracle) ?? 0;
        // Submit progress after every oracle so the processed-row counter
        // scrolls continuously instead of jumping at block boundaries.
        progress({ done: doneRows, total: blockInput.total });
      }
    });

    const next: ChunkState = {
      index:      blockInput.index + chunk.length,
      done:       doneRows,
      total:      blockInput.total,
      counts:     { prints: (blockInput.counts.prints ?? 0) + counts.prints, printParts: (blockInput.counts.printParts ?? 0) + counts.printParts },
      manualKeys: [...(blockInput.manualKeys ?? []), ...manualKeys],
      sourceKeys: [...(blockInput.sourceKeys ?? []), ...sourceKeys],
    };
    await checkpoint(next);
    progress({ done: doneRows, total: blockInput.total });
    return next.index >= magic.oracleList.length ? done(next) : next;
  })
  .exit(({ ctx, blockInput }) => {
    const magic = ctx as unknown as ProjectCtx;
    addAll(magic.counts, blockInput.counts);
    return runWithDb(getLocalDb(), async () => {
      // Recycle against exactly what this run emitted — symmetric with
      // synthesis even where the commit path skipped a branch. Ownership
      // follows the projected oracles: rows of an oracle outside oracleList
      // are never this run's to judge.
      const emitted = new Set(blockInput.manualKeys ?? []);
      magic.counts.manualRecycled = await softDeleteStaleManualPrints(getLocalDb(), emitted, new Set(magic.oracleList));
      // Stale source prints ride the same rule: rows the sources no longer
      // produce (renamed collector numbers, shrunken units) within the
      // oracles this run projected.
      magic.counts.softDeleted = await softDeleteStaleSourcePrints(getLocalDb(), blockInput.sourceKeys ?? [], new Set(magic.oracleList));
      return magic.counts;
    });
  })
  .stage('cards', { label: '卡片投影', progressMode: 'bounded', resumeMode: 'durable' })
  .entry(async ({ ctx, checkpoint }) => {
    const magic = ctx as unknown as ProjectCtx;
    await runWithDb(getLocalDb(), async () => {
      const database = getLocalDb();
      const matched = await matchBatch(database);
      magic.unitToCard = matched.cardIdByUnit;
      magic.reversibleRows = await loadReversibleRows(database);
      magic.rubies = await loadNameRubyLookup(database);
      const byCard = new Map<string, string[]>();
      for (const [unit, cardId] of matched.cardIdByUnit) {
        const list = byCard.get(cardId) ?? [];
        list.push(unit);
        byCard.set(cardId, list);
      }
      magic.cardsByCardId = byCard;
      magic.cardIdList = [...byCard.keys()].sort();
      // Pending inconsistency and overwrite rows are recomputed each run;
      // resolved rows are left untouched. The overwrite rows are an audit trail
      // of where a community translation replaced the print surface, so they are
      // rewritten rather than appended — appending would pile up a fresh copy of
      // the same change on every run.
      await database.delete(ProjectionReview)
        .where(and(
          inArray(ProjectionReview.kind, ['card_inconsistency', 'card_field_overwrite']),
          eq(ProjectionReview.status, 'pending'),
        ));
    });
    magic.counts ??= { ...emptyCounts };
    const restored = checkpoint?.blockInput as ChunkState | undefined;
    if (restored) return { total: restored.total, blockInput: restored };
    const total = magic.cardIdList.length;
    return { total, blockInput: { index: 0, total, counts: {} } };
  })
  .block(async ({ ctx, blockInput, progress, checkpoint, done }) => {
    const magic = ctx as unknown as ProjectCtx;
    const chunk = magic.cardIdList.slice(blockInput.index, blockInput.index + CARD_CHUNK_SIZE);

    const counts = { cards: 0, cardParts: 0, cardLocs: 0, cardPartLocs: 0, authorities: 0, reviews: 0 };
    await runWithDb(getLocalDb(), async () => {
      const database = getLocalDb();

      // Assemble every member oracle of the chunk once; cardId comes from the
      // match resolution, not the natural slug.
      const assembledByUnit = new Map<string, AssembledCard>();
      const memberOracles = new Set(chunk.flatMap(cardId => (magic.cardsByCardId.get(cardId) ?? []).map(u => u.split(':')[0]!)));
      for (const oracle of memberOracles) {
        for (const raw of await assembleUnits(database, oracle, magic.reversibleRows)) {
          const assembled = withResolvedCardId(raw, magic.unitToCard);
          if (assembled != null) assembledByUnit.set(assembled.unit, assembled);
        }
      }

      // Cards merged from several units need a consistency check; cards with
      // one assembled member (incl. hard merge groups) are consistent by
      // construction.
      const multiCards = chunk
        .map(cardId => ({ cardId, members: (magic.cardsByCardId.get(cardId) ?? []).map(u => assembledByUnit.get(u)).filter(a => a != null) }))
        .filter(c => c.members.length > 1);
      const detailsBySlug = new Map<string, string[]>();
      if (multiCards.length > 0) {
        const groups = new Map(multiCards.map(c => [c.cardId, (magic.cardsByCardId.get(c.cardId) ?? []).filter(u => assembledByUnit.has(u))]));
        for (const d of await inconsistentMergedSlugs(database, groups)) {
          detailsBySlug.set(d.slug, d.details);
        }
        // Canonical content source per merged slug, if the resolution named one.
        const resolutions = await database.select({ slug: CardSlugResolution.slug, canonicalUnit: CardSlugResolution.canonicalUnit })
          .from(CardSlugResolution)
          .where(inArray(CardSlugResolution.slug, [...groups.keys()]));
        for (const c of multiCards) {
          const canonicalUnit = resolutions.find(r => r.slug === c.cardId)?.canonicalUnit ?? null;
          if (canonicalUnit != null) {
            const canonical = assembledByUnit.get(canonicalUnit);
            if (canonical != null) {
              c.members = [canonical, ...c.members.filter(m => m.unit !== canonicalUnit)];
            }
          }
        }
      }

      const inconsistencyRows: (typeof ProjectionReview)['$inferInsert'][] = [];
      for (const cardId of chunk) {
        const units = magic.cardsByCardId.get(cardId) ?? [];
        const members = units.map(u => assembledByUnit.get(u)).filter(a => a != null);
        if (members.length === 0) continue;

        const details = detailsBySlug.get(cardId);
        if (details != null) {
          // Inconsistent merged card: hold for review and skip this card's
          // card-level rows; its prints were already written by the prints
          // stage (§7.4).
          inconsistencyRows.push({
            kind: 'card_inconsistency', subject: { cardId }, payload: { members: units, details }, status: 'pending',
          });
          continue;
        }

        const result: ProjectCardResult = projectCard(members[0]!, magic.rubies);
        // The card row records every contributing oracle id, not just the
        // canonical member whose faces supplied the content — merged cards
        // (slug resolutions, BFM) must stay discoverable from all members.
        if (result.cards[0] != null) {
          result.cards[0]!.scryfallOracleId = [...new Set(units.map(u => u.split(':')[0]!))].sort();
        }
        counts.cards += await writeSection(database, Card, result.cards, [...CARD_PK]);
        counts.cardParts += await writeSection(database, CardPart, result.cardParts, [...CARD_PK, 'partIndex']);
        counts.cardLocs += await writeSection(database, CardLocalization, result.cardLocalizations, [...CARD_PK, 'locale', 'source']);
        counts.cardPartLocs += await writeSection(database, CardPartLocalization, result.cardPartLocalizations, [...CARD_PK, 'locale', 'source', 'partIndex']);
        // The authority rows are written before the display rows derived from
        // them, so a resume never leaves a display row whose authority is absent.
        counts.authorities += await writeSection(database, CardLocalizationAuthority, result.authorities, [...CARD_PK, 'locale', 'source']);
        // A-class review reminders are appended (no unique conflict target yet).
        if (result.reviews.length > 0) {
          await database.insert(ProjectionReview).values(result.reviews as never);
          counts.reviews += result.reviews.length;
        }
      }
      if (inconsistencyRows.length > 0) {
        await database.insert(ProjectionReview).values(inconsistencyRows as never);
        counts.reviews += inconsistencyRows.length;
      }
    });

    const next: ChunkState = {
      index:  blockInput.index + chunk.length,
      total:  blockInput.total,
      counts: {
        cards:        (blockInput.counts.cards ?? 0) + counts.cards,
        cardParts:    (blockInput.counts.cardParts ?? 0) + counts.cardParts,
        cardLocs:     (blockInput.counts.cardLocs ?? 0) + counts.cardLocs,
        cardPartLocs: (blockInput.counts.cardPartLocs ?? 0) + counts.cardPartLocs,
        authorities:  (blockInput.counts.authorities ?? 0) + counts.authorities,
        reviews:      (blockInput.counts.reviews ?? 0) + counts.reviews,
      },
    };
    await checkpoint(next);
    progress({ done: Math.min(next.index, next.total), total: next.total });
    return next.index >= magic.cardIdList.length ? done(next) : next;
  })
  .exit(({ ctx, blockInput }) => {
    const magic = ctx as unknown as ProjectCtx;
    addAll(magic.counts, blockInput.counts);
    return runWithDb(getLocalDb(), async () => {
      // The full run is the only judge of global staleness: base rows whose
      // cardId the match no longer projects — vanished units, withdrawn
      // merges — are soft-deleted across every base table. Scoped runs never
      // touch this: their slice cannot tell what is stale elsewhere.
      const target = new Set(magic.cardIdList);
      for (const { table } of BASE_TABLES) {
        magic.counts.softDeleted += await softDeleteStale(getLocalDb(), table, table.cardId, target);
      }
      return magic.counts;
    });
  })
  .build();

export const magicProjectTaskDefinition = definition;
