import { z } from 'zod';
import { and, asc, count, eq, ilike, inArray, isNotNull, isNull, notExists, sql, type SQL } from 'drizzle-orm';

import { MtgchScryfallCard, MtgchZhsCard, PrintCommit, ScryfallCard } from '@tcg-cards/db/schema/local/magic';

import { os } from './index';
import { getLocalDb } from '../lib/hearthstone/hsdata-local-db';
import {
  buildCandidateFaces,
  candidateFaceCount,
  candidateOracleEligible,
  type CandidateFaceRow,
} from '../lib/magic/commit-candidates';
import {
  commitFaceSummary,
  normalizeCommitFaces,
  normalizeCommitMetadata,
  validateCommitSave,
} from '../lib/magic/commits';

/** One printed-surface override as submitted by the console form. */
const commitFace = z.strictObject({
  printedName:     z.string().nullable().optional(),
  printedTypeLine: z.string().nullable().optional(),
  printedText:     z.string().nullable().optional(),
  flavorName:      z.string().nullable().optional(),
  flavorText:      z.string().nullable().optional(),
  artist:          z.string().nullable().optional(),
  watermark:       z.string().nullable().optional(),
});

/** One list row: commit anchor plus display-resolved card name and face summary. */
const commitItem = z.strictObject({
  oracleId:  z.string(),
  set:       z.string(),
  number:    z.string(),
  lang:      z.string(),
  cardName:  z.string().nullable(),
  origin:    z.string(),
  note:      z.string().nullable(),
  summary:   z.string(),
  asserted:  z.number(),
  updatedAt: z.string(),
});

/** English face names of the anchored card, so the form can label per-face sections. */
const cardCandidate = z.strictObject({
  oracleId:  z.string(),
  name:      z.string(),
  set:       z.string(),
  number:    z.string(),
  faceNames: z.array(z.string()),
});

/** Whitelisted print metadata overrides, as stored on the commit row. */
const commitMetadata = z.strictObject({
  rarity:        z.string().optional(),
  releaseDate:   z.string().optional(),
  frame:         z.string().optional(),
  borderColor:   z.string().optional(),
  securityStamp: z.string().optional(),
  finishes:      z.array(z.string()).optional(),
  promoTypes:    z.array(z.string()).optional(),
  artistIds:     z.array(z.string()).optional(),
  isDigital:     z.boolean().optional(),
  isPromo:       z.boolean().optional(),
  inBooster:     z.boolean().optional(),
});

/** The four-column anchor of a print commit (oracle + print position). */
const commitAnchor = z.strictObject({
  oracleId: z.string().min(1),
  set:      z.string().min(1),
  number:   z.string().min(1),
  lang:     z.string().min(1),
});

// ---------------------------------------------------------------------------
// Completion suggestions: MTGCH zhs positions Scryfall has no zhs row for.
// The scan is read-only advice; only the per-set adoption writes commits.
// ---------------------------------------------------------------------------

/** Whether the MTGCH translation row asserts any content (blank/escape-only counts as none). */
const mtgchHasContent = sql`(
  NULLIF(trim(coalesce(${MtgchZhsCard.faceName}, '')), '') IS NOT NULL
  OR NULLIF(trim(coalesce(${MtgchZhsCard.name}, '')), '') IS NOT NULL
  OR NULLIF(trim(coalesce(${MtgchZhsCard.typeLine}, '')), '') IS NOT NULL
  OR NULLIF(trim(coalesce(${MtgchZhsCard.text}, '')), '') IS NOT NULL
)`;

/**
 * Candidate positions of one set (or all sets when `setCode` is null): MTGCH
 * skeleton rows carrying zhs content, whose (oracle, set, number) has no
 * Scryfall zhs row and no commit yet.
 */
function candidateQuery(database: ReturnType<typeof getLocalDb>, setCode: string | null) {
  const filters: SQL[] = [
    isNull(MtgchScryfallCard.deletedAt),
    isNull(MtgchZhsCard.deletedAt),
    mtgchHasContent,
    // nullable column: a row without an oracle id cannot anchor a commit
    isNotNull(MtgchScryfallCard.oracleId),
    isNotNull(MtgchScryfallCard.setCode),
    isNotNull(MtgchScryfallCard.collectorNumber),
  ];
  if (setCode != null) filters.push(sql`lower(${MtgchScryfallCard.setCode}) = ${setCode.toLowerCase()}`);
  return database.selectDistinct({
    oracleId: MtgchScryfallCard.oracleId,
    set:      sql<string>`lower(${MtgchScryfallCard.setCode})`.as('set'),
    number:   MtgchScryfallCard.collectorNumber,
  })
    .from(MtgchScryfallCard)
    .innerJoin(MtgchZhsCard, eq(MtgchZhsCard.cardId, MtgchScryfallCard.cardId))
    .where(and(...filters, ...[
      // No Scryfall zhs row at the same position, no commit of any origin yet.
      notExists(database.select({ one: sql`1` }).from(ScryfallCard).where(and(
        eq(ScryfallCard.lang, 'zhs'),
        isNull(ScryfallCard.deletedAt),
        eq(ScryfallCard.oracleId, MtgchScryfallCard.oracleId),
        eq(ScryfallCard.set, sql`lower(${MtgchScryfallCard.setCode})`),
        eq(ScryfallCard.collectorNumber, MtgchScryfallCard.collectorNumber),
      ))),
      notExists(database.select({ one: sql`1` }).from(PrintCommit).where(and(
        eq(PrintCommit.lang, 'zhs'),
        eq(PrintCommit.oracleId, MtgchScryfallCard.oracleId),
        eq(PrintCommit.set, sql`lower(${MtgchScryfallCard.setCode})`),
        eq(PrintCommit.number, MtgchScryfallCard.collectorNumber),
      ))),
    ]));
}

/** English prints of one set, keyed `oracleId|number` — the clone baselines. */
async function englishPrintsByPosition(database: ReturnType<typeof getLocalDb>, setCode: string) {
  const rows = await database.select({
    oracleId:        ScryfallCard.oracleId,
    name:            ScryfallCard.name,
    set:             ScryfallCard.set,
    collectorNumber: ScryfallCard.collectorNumber,
    layout:          ScryfallCard.layout,
    cardFaces:       ScryfallCard.cardFaces,
  }).from(ScryfallCard)
    .where(and(eq(ScryfallCard.lang, 'en'), isNull(ScryfallCard.deletedAt), eq(ScryfallCard.set, setCode.toLowerCase())));
  const map = new Map<string, {
    oracleId: string, name: string, layout: string, cardFaces: Array<{ name?: string, oracle_text?: string | null, power?: string | null, toughness?: string | null }> | null,
  }>();
  for (const row of rows) {
    map.set(`${String(row.oracleId)}|${row.collectorNumber}`, {
      oracleId:  String(row.oracleId),
      name:      row.name,
      layout:    row.layout,
      cardFaces: row.cardFaces as never,
    });
  }
  return map;
}

/** MTGCH face rows of one set, grouped `oracleId|number`. */
async function mtgchFacesByPosition(database: ReturnType<typeof getLocalDb>, setCode: string) {
  const rows = await database.select({
    oracleId:        MtgchScryfallCard.oracleId,
    collectorNumber: MtgchScryfallCard.collectorNumber,
    faceIndex:       MtgchScryfallCard.faceIndex,
    faceName:        MtgchZhsCard.faceName,
    name:            MtgchZhsCard.name,
    typeLine:        MtgchZhsCard.typeLine,
    text:            MtgchZhsCard.text,
  }).from(MtgchScryfallCard)
    .innerJoin(MtgchZhsCard, eq(MtgchZhsCard.cardId, MtgchScryfallCard.cardId))
    .where(and(
      isNull(MtgchScryfallCard.deletedAt),
      isNull(MtgchZhsCard.deletedAt),
      sql`lower(${MtgchScryfallCard.setCode}) = ${setCode.toLowerCase()}`,
    ));
  const map = new Map<string, CandidateFaceRow[]>();
  for (const row of rows) {
    const key = `${String(row.oracleId)}|${row.collectorNumber}`;
    const list = map.get(key) ?? [];
    list.push({ faceIndex: row.faceIndex, faceName: row.faceName, name: row.name, typeLine: row.typeLine, text: row.text });
    map.set(key, list);
  }
  return map;
}

/** Per-set suggestion counts (advisory; exotic layouts may overestimate slightly). */
const candidateSets = os
  .output(z.strictObject({ sets: z.array(z.strictObject({ code: z.string(), candidates: z.number() })) }))
  .handler(async () => {
    const db = getLocalDb();
    const rows = await candidateQuery(db, null);
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.set, (counts.get(row.set) ?? 0) + 1);
    return {
      sets: [...counts.entries()]
        .map(([code, candidates]) => ({ code, candidates }))
        .sort((a, b) => b.candidates - a.candidates),
    };
  });

/** One set's candidate positions with card names and a per-position adoptability verdict. */
const candidateList = os
  .input(z.strictObject({ set: z.string().min(1) }))
  .output(z.strictObject({
    items: z.array(z.strictObject({
      oracleId:  z.string(),
      set:       z.string(),
      number:    z.string(),
      cardName:  z.string().nullable(),
      summary:   z.string(),
      adoptable: z.boolean(),
    })),
    total:       z.number(),
    adoptable:   z.number(),
    ineligible:  z.number(),
  }))
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const positions = await candidateQuery(db, input.set);
    const english = await englishPrintsByPosition(db, input.set);
    const mtgch = await mtgchFacesByPosition(db, input.set);

    const items = positions.map(position => {
      const key = `${position.oracleId}|${position.number}`;
      const card = english.get(key) ?? null;
      const adoptable = card != null && candidateOracleEligible({
        layout: card.layout, name: card.name, cardFaces: card.cardFaces,
      });
      const faces = buildCandidateFaces(mtgch.get(key) ?? [], card != null ? candidateFaceCount({
        layout: card.layout, name: card.name, cardFaces: card.cardFaces,
      }) : 1);
      return {
        oracleId:  position.oracleId ?? '',
        set:       position.set,
        number:    position.number ?? '',
        cardName:  card?.name ?? null,
        summary:   commitFaceSummary(faces as never),
        adoptable,
      };
    }).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));

    return {
      items,
      total: items.length,
      adoptable: items.filter(i => i.adoptable).length,
      ineligible: items.filter(i => !i.adoptable).length,
    };
  });

/** Adopts one set's candidates into print commits (origin auto, MTGCH faces). */
const adoptCandidates = os
  .input(z.strictObject({ set: z.string().min(1) }))
  .output(z.strictObject({
    adopted:     z.number(),
    ineligible:  z.number(),
    note:        z.string(),
  }))
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const positions = await candidateQuery(db, input.set);
    const english = await englishPrintsByPosition(db, input.set);
    const mtgch = await mtgchFacesByPosition(db, input.set);

    const values: (typeof PrintCommit)['$inferInsert'][] = [];
    let ineligible = 0;
    for (const position of positions) {
      const key = `${position.oracleId}|${position.number}`;
      const card = english.get(key) ?? null;
      if (card == null || !candidateOracleEligible({ layout: card.layout, name: card.name, cardFaces: card.cardFaces })) {
        ineligible += 1;
        continue;
      }
      const faces = buildCandidateFaces(mtgch.get(key) ?? [], candidateFaceCount({
        layout: card.layout, name: card.name, cardFaces: card.cardFaces,
      }));
      values.push({
        oracleId: position.oracleId as never,
        set:      position.set,
        number:   position.number ?? '',
        lang:     'zhs',
        origin:   'auto',
        faces,
        metadata: null,
        note:     '数据来源：MTGCH',
      });
    }
    if (values.length > 0) {
      await db.insert(PrintCommit).values(values).onConflictDoNothing({
        target: [PrintCommit.oracleId, PrintCommit.set, PrintCommit.number, PrintCommit.lang],
      });
    }
    return {
      adopted: values.length,
      ineligible,
      note: '数据来源：MTGCH',
    };
  });

/** English scryfall row of one oracle (representative print). */
async function englishCard(database: ReturnType<typeof getLocalDb>, oracleId: string) {
  return database.select({
    oracleId:  ScryfallCard.oracleId,
    name:      ScryfallCard.name,
    set:       ScryfallCard.set,
    collectorNumber: ScryfallCard.collectorNumber,
    cardFaces: ScryfallCard.cardFaces,
  }).from(ScryfallCard)
    .where(and(eq(ScryfallCard.lang, 'en'), eq(ScryfallCard.oracleId, oracleId as never)))
    .then(rows => rows[0]);
}

/** English face names of a scryfall row, for per-face form labels. */
function faceNamesOf(row: { name: string, cardFaces: unknown } | undefined): string[] {
  const faces = (row?.cardFaces as Array<{ name?: string }> | null) ?? [];
  if (faces.length === 0) return row != null ? [row.name] : [];
  return faces.map(f => f.name ?? '');
}

/** Lists print commits with their resolved card names; filters by set or card-name search. */
const list = os
  .input(z.strictObject({
    set:      z.string().optional(),
    search:   z.string().optional(),
    page:     z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(200).default(50),
  }))
  .output(z.strictObject({
    items: z.array(commitItem),
    total: z.number(),
    sets:  z.array(z.strictObject({ code: z.string(), commits: z.number() })),
  }))
  .handler(async ({ input }) => {
    const db = getLocalDb();

    const filters: SQL[] = [];
    if (input.set != null && input.set !== '') filters.push(eq(PrintCommit.set, input.set));
    if (input.search != null && input.search.trim() !== '') {
      const term = `%${input.search.trim()}%`;
      const oracles = await db.select({ oracleId: ScryfallCard.oracleId }).from(ScryfallCard)
        .where(and(eq(ScryfallCard.lang, 'en'), ilike(ScryfallCard.name, term)))
        .limit(500);
      const ids = [...new Set(oracles.map(r => String(r.oracleId)))];
      // An unmatched search yields an impossible oracle id, not a missing filter.
      filters.push(inArray(PrintCommit.oracleId, ids.length > 0 ? ids as never : ['00000000-0000-0000-0000-000000000000'] as never));
    }
    const where = filters.length > 0 ? and(...filters) : undefined;

    const rows = await db.select().from(PrintCommit).where(where)
      .orderBy(asc(PrintCommit.set), asc(PrintCommit.number), asc(PrintCommit.lang))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);
    const [totalRow] = await db.select({ n: count() }).from(PrintCommit).where(where);
    const setRows = await db.select({ code: PrintCommit.set, commits: count() }).from(PrintCommit)
      .groupBy(PrintCommit.set).orderBy(asc(PrintCommit.set));

    // Card names for the page's rows, resolved from the English source rows.
    const oracleIds = [...new Set(rows.map(r => r.oracleId))];
    const names = new Map<string, string>();
    if (oracleIds.length > 0) {
      const cards = await db.select({ oracleId: ScryfallCard.oracleId, name: ScryfallCard.name })
        .from(ScryfallCard)
        .where(and(eq(ScryfallCard.lang, 'en'), inArray(ScryfallCard.oracleId, oracleIds as never)));
      for (const card of cards) {
        const key = String(card.oracleId);
        if (!names.has(key)) names.set(key, card.name);
      }
    }

    return {
      items: rows.map(row => ({
        oracleId:  row.oracleId,
        set:       row.set,
        number:    row.number,
        lang:      row.lang,
        cardName:  names.get(row.oracleId) ?? null,
        origin:    row.origin,
        note:      row.note,
        summary:   commitFaceSummary(row.faces),
        asserted:  (row.faces ?? []).filter(f => Object.keys(f).length > 0).length,
        updatedAt: row.updatedAt.toISOString(),
      })),
      total: Number(totalRow?.n ?? 0),
      sets:  setRows.map(r => ({ code: r.code, commits: Number(r.commits) })),
    };
  });

/** Full row for the edit dialog, plus the card's face names for section labels. */
const get = os
  .input(commitAnchor)
  .output(z.strictObject({
    faces:     z.array(commitFace),
    metadata:  commitMetadata.nullable(),
    note:      z.string().nullable(),
    origin:    z.string(),
    faceNames: z.array(z.string()),
  }))
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const row = await db.select().from(PrintCommit).where(and(
      eq(PrintCommit.oracleId, input.oracleId as never),
      eq(PrintCommit.set, input.set),
      eq(PrintCommit.number, input.number),
      eq(PrintCommit.lang, input.lang),
    )).then(rows => rows[0]);
    if (row == null) throw new Error('未找到该补全提交');

    const card = await englishCard(db, input.oracleId);
    return {
      faces:     row.faces ?? [],
      metadata:  row.metadata ?? null,
      note:      row.note,
      origin:    row.origin,
      faceNames: faceNamesOf(card),
    };
  });

/** Card search for the entry form: English name matches, one candidate per card. */
const cardSearch = os
  .input(z.strictObject({ search: z.string().min(1) }))
  .output(z.array(cardCandidate))
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const term = `%${input.search.trim()}%`;
    const rows = await db.select({
      oracleId:        ScryfallCard.oracleId,
      name:            ScryfallCard.name,
      set:             ScryfallCard.set,
      collectorNumber: ScryfallCard.collectorNumber,
      cardFaces:       ScryfallCard.cardFaces,
    }).from(ScryfallCard)
      .where(and(eq(ScryfallCard.lang, 'en'), ilike(ScryfallCard.name, term)))
      .orderBy(asc(ScryfallCard.name), asc(ScryfallCard.set), asc(ScryfallCard.collectorNumber))
      .limit(200);

    const out: z.infer<typeof cardCandidate>[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const key = String(row.oracleId);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        oracleId:  key,
        name:      row.name,
        set:       row.set,
        number:    row.collectorNumber,
        faceNames: faceNamesOf(row),
      });
      if (out.length >= 20) break;
    }
    return out;
  });

/** Upserts one commit. The anchor's English position must exist — the
 * projection clones it, so a commit without one would silently never project. */
const save = os
  .input(z.strictObject({
    oracleId: z.string().min(1),
    set:      z.string().min(1),
    number:   z.string().min(1),
    lang:     z.string().min(1),
    faces:    z.array(commitFace),
    metadata: commitMetadata.nullable(),
    note:     z.string().nullable(),
  }))
  .output(z.strictObject({ saved: z.boolean() }))
  .handler(async ({ input }) => {
    const db = getLocalDb();

    const card = await englishCard(db, input.oracleId);
    const position = card == null
      ? null
      : await db.select({ n: sql<number>`count(*)::int` }).from(ScryfallCard)
        .where(and(
          eq(ScryfallCard.lang, 'en'),
          eq(ScryfallCard.oracleId, input.oracleId as never),
          eq(ScryfallCard.set, input.set),
          eq(ScryfallCard.collectorNumber, input.number),
        )).then(rows => Number(rows[0]?.n ?? 0));

    const error = validateCommitSave(input, { cardExists: card != null, positionExists: (position ?? 0) > 0 });
    if (error != null) throw new Error(error);

    const faces = normalizeCommitFaces(input.faces);
    const metadata = normalizeCommitMetadata(input.metadata as never);
    const note = input.note?.trim() || null;

    await db.insert(PrintCommit).values({
      oracleId: input.oracleId as never,
      set:      input.set,
      number:   input.number,
      lang:     input.lang,
      faces,
      metadata,
      note,
    }).onConflictDoUpdate({
      target: [PrintCommit.oracleId, PrintCommit.set, PrintCommit.number, PrintCommit.lang],
      set:    { faces, metadata, note },
    });
    return { saved: true };
  });

/** Removes a commit — withdrawal. The next projection soft-deletes its fact rows. */
const remove = os
  .input(commitAnchor)
  .output(z.strictObject({ removed: z.boolean() }))
  .handler(async ({ input }) => {
    const db = getLocalDb();
    await db.delete(PrintCommit).where(and(
      eq(PrintCommit.oracleId, input.oracleId as never),
      eq(PrintCommit.set, input.set),
      eq(PrintCommit.number, input.number),
      eq(PrintCommit.lang, input.lang),
    ));
    return { removed: true };
  });

export const magicCommitsRouter = {
  list,
  get,
  cardSearch,
  save,
  remove,
  candidates:    { sets: candidateSets, list: candidateList, adopt: adoptCandidates },
};
