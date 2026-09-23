import { z } from 'zod';
import { and, asc, count, eq, ilike, inArray, sql, type SQL } from 'drizzle-orm';

import { PrintCommit, ScryfallCard } from '@tcg-cards/db/schema/local/magic';

import { os } from './index';
import { getLocalDb } from '../lib/hearthstone/hsdata-local-db';
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
};
