import { z } from 'zod';
import { and, asc, count, eq, ilike, inArray, isNotNull, isNull, notExists, sql, type SQL } from 'drizzle-orm';

import { taskPageSnapshot } from '@tcg-cards/model/task';
import {
  MtgchScryfallCard,
  MtgchZhsCard,
  PrintCommit,
  ScryfallCard,
  type PrintCommitData,
  type PrintCommitFace,
} from '@tcg-cards/db/schema/local/magic';

import { os } from './index';
import { createAndRunTask } from './task';
import { getLocalDb } from '../lib/hearthstone/hsdata-local-db';
import { magicProjectCommitsTaskDefinition } from '../lib/magic/task/magic-project-commits';
import { runCommitsProjection } from '../lib/magic/task/magic-project-commits/projection';
import {
  buildCandidateFaces,
  candidateFaceCount,
  candidateOracleEligible,
  type CandidateFaceRow,
} from '../lib/magic/commit-candidates';
import {
  buildGathererFaces,
  gathererSurfacesAgree,
  type GathererFaceRow,
} from '../lib/magic/gatherer-candidates';
import {
  commitFaceSummary,
  normalizeCommitData,
  normalizeCommitFaces,
  validateCommitSave,
} from '../lib/magic/commits';
import { loadGathererMultiverseIds, type CommitAnchor } from '../lib/magic/task/magic-project/oracle-prints';

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

/** Whitelisted commit payload, as stored on the commit row. */
const commitData = z.strictObject({
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
  multiverseIds: z.array(z.number()).optional(),
});

/** The four-column anchor of a print commit (oracle + print position). */
const commitAnchor = z.strictObject({
  oracleId: z.string().min(1),
  set:      z.string().min(1),
  number:   z.string().min(1),
  lang:     z.string().min(1),
});

// ---------------------------------------------------------------------------
// Completion suggestions: positions no source records, offered by MTGCH (zhs)
// and by the cached Gatherer pages (every locale the official site carries).
// Where both sources offer a zhs translation and the wording differs, the
// candidate stays unresolved until the console picks a side. The scan is
// read-only advice; only the per-set / per-card / per-side adoption writes
// commits.
// ---------------------------------------------------------------------------

/** Source of a completion candidate's translation. */
const candidateSource = z.enum(['mtgch', 'gatherer']);

/** Whether the MTGCH translation row asserts any content (blank/escape-only counts as none). */
const mtgchHasContent = sql`(
  NULLIF(trim(coalesce(${MtgchZhsCard.faceName}, '')), '') IS NOT NULL
  OR NULLIF(trim(coalesce(${MtgchZhsCard.name}, '')), '') IS NOT NULL
  OR NULLIF(trim(coalesce(${MtgchZhsCard.typeLine}, '')), '') IS NOT NULL
  OR NULLIF(trim(coalesce(${MtgchZhsCard.text}, '')), '') IS NOT NULL
)`;

/**
 * Candidate positions of one set (or all sets when `setCode` is null), narrowed
 * to one oracle when `oracleId` is given: MTGCH skeleton rows carrying zhs
 * content, whose (oracle, set, number) has no Scryfall zhs row and no commit yet.
 */
function candidateQuery(database: ReturnType<typeof getLocalDb>, setCode: string | null, oracleId?: string) {
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
  if (oracleId != null) filters.push(eq(MtgchScryfallCard.oracleId, oracleId as never));
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
    oracleId: string; name: string; layout: string; cardFaces: Array<{ name?: string, oracle_text?: string | null, power?: string | null, toughness?: string | null }> | null;
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
    flavorName:      MtgchZhsCard.flavorName,
    flavorText:      MtgchZhsCard.flavorText,
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
    list.push({
      faceIndex:  row.faceIndex,
      faceName:   row.faceName,
      name:       row.name,
      typeLine:   row.typeLine,
      text:       row.text,
      flavorName: row.flavorName,
      flavorText: row.flavorText,
    });
    map.set(key, list);
  }
  return map;
}

/**
 * Gatherer candidate rows of one set (all sets when `setCode` is null),
 * narrowed to one oracle when `oracleId` is given: every cached foreign
 * locale face joined to the English position by face name, whose (oracle,
 * set, number, lang) has neither a Scryfall row nor a commit yet.
 */
const GATHERER_LANG = sql`CASE
  WHEN g.data->>'languageCode' = 'zh'
    THEN CASE WHEN g.data->'language'->>'englishName' = 'Chinese Traditional' THEN 'zht' ELSE 'zhs' END
  ELSE g.data->>'languageCode'
END`;

function gathererCandidateRows(setCode: string | null, oracleId?: string): SQL {
  const filters: SQL[] = [
    sql`g.data IS NOT NULL`,
    sql`g.data->>'kind' = 'CardData'`,
    sql`g.data->>'languageCode' IS NOT NULL AND g.data->>'languageCode' <> 'en'`,
  ];
  if (setCode != null) filters.push(sql`lower(g.data->>'setCode') = ${setCode.toLowerCase()}`);
  if (oracleId != null) filters.push(sql`sc.oracle_id = ${oracleId}::uuid`);
  return sql`
    SELECT
      c."oracleId", c."set", c."number", c."lang",
      c."oracleName", c."instanceName", c."instanceTypeLine",
      c."instanceText", c."flavorText"
    FROM (
      SELECT
        sc.oracle_id AS "oracleId",
        lower(g.data->>'setCode') AS "set",
        g.data->>'cardNumber' AS "number",
        ${GATHERER_LANG} AS "lang",
        g.data->>'languageCode' AS "languageCode",
        g.data->'language'->>'englishName' AS "languageName",
        g.data->>'oracleName' AS "oracleName",
        g.data->>'instanceName' AS "instanceName",
        g.data->>'instanceTypeLine' AS "instanceTypeLine",
        g.data->>'instanceText' AS "instanceText",
        g.data->>'flavorText' AS "flavorText"
      FROM magic_data.gatherer g
      JOIN magic_data.scryfall_cards sc
        ON sc.lang = 'en' AND sc.deleted_at IS NULL
       AND sc.set = lower(g.data->>'setCode')
       AND sc.collector_number = g.data->>'cardNumber'
       AND (sc.name = g.data->>'oracleName'
            OR split_part(sc.name, ' // ', 1) = g.data->>'oracleName'
            OR split_part(sc.name, ' // ', 2) = g.data->>'oracleName')
      WHERE ${sql.join(filters, sql` AND `)}
    ) c
    WHERE NOT EXISTS (
        SELECT 1 FROM magic_data.scryfall_cards s2
        WHERE s2.deleted_at IS NULL AND s2.lang = c."lang"
          AND s2.oracle_id = c."oracleId"
          AND s2.set = c."set"
          AND s2.collector_number = c."number")
      AND NOT EXISTS (
        SELECT 1 FROM magic_data.print_commits pc
        WHERE pc.oracle_id = c."oracleId"
          AND pc.set = c."set"
          AND pc.number = c."number"
          AND pc.lang = c."lang")`;
}

interface GathererCandidateRow {
  oracleId:         string;
  set:              string;
  number:           string;
  lang:             string;
  languageCode:     string;
  languageName:     string;
  oracleName:       string;
  instanceName:     string;
  instanceTypeLine: string;
  instanceText:     string;
  flavorText:       string;
}

/** Gatherer candidate faces of one set, grouped `oracleId|number|lang`. */
async function gathererFacesByPosition(
  database: ReturnType<typeof getLocalDb>,
  setCode: string,
  oracleId?: string,
): Promise<Map<string, GathererFaceRow[]>> {
  const result = await database.execute(gathererCandidateRows(setCode, oracleId));
  const map = new Map<string, GathererFaceRow[]>();
  for (const row of result as unknown as GathererCandidateRow[]) {
    const key = `${row.oracleId}|${row.number}|${row.lang}`;
    const list = map.get(key) ?? [];
    list.push({
      languageCode:     row.languageCode,
      languageName:     row.languageName,
      oracleName:       row.oracleName,
      instanceName:     row.instanceName,
      instanceTypeLine: row.instanceTypeLine,
      instanceText:     row.instanceText,
      flavorText:       row.flavorText,
    });
    map.set(key, list);
  }
  return map;
}

/**
 * One merged suggestion: an anchor position whose translation comes from one
 * source — or from both, when the two zhs surfaces disagree and the console
 * must pick. `facesBySource` carries each source's built slots so adoption
 * writes the chosen side without re-querying.
 */
interface ResolvedCandidate {
  oracleId:      string;
  set:           string;
  number:        string;
  lang:          string;
  cardName:      string | null;
  adoptable:     boolean;
  source:        'mtgch' | 'gatherer';
  conflict:      boolean;
  options:       Array<{ source: 'mtgch' | 'gatherer', summary: string }>;
  facesBySource: Partial<Record<'mtgch' | 'gatherer', Array<Partial<PrintCommitFace>>>>;
}

/**
 * Merges both sources' candidates of one set (one oracle's only when
 * `oracleId` is given): MTGCH zhs positions as today, Gatherer locales whose
 * rows the anchor lacks, and the disagreeing zhs positions flagged for a
 * manual source choice. Adoption never auto-writes a conflict.
 */
async function resolveCandidates(
  database: ReturnType<typeof getLocalDb>,
  setCode: string,
  oracleId?: string,
): Promise<ResolvedCandidate[]> {
  const english = await englishPrintsByPosition(database, setCode);
  const mtgchPositions = await candidateQuery(database, setCode, oracleId);
  const mtgch = await mtgchFacesByPosition(database, setCode);
  const gatherer = await gathererFacesByPosition(database, setCode, oracleId);

  const eligibility = (key: string) => {
    const card = english.get(key) ?? null;
    return {
      card,
      adoptable: card != null && candidateOracleEligible({
        layout: card.layout, name: card.name, cardFaces: card.cardFaces,
      }),
      faceCount: card != null
        ? candidateFaceCount({ layout: card.layout, name: card.name, cardFaces: card.cardFaces })
        : 1,
      faceNames: faceNamesOf(card ?? undefined),
    };
  };

  const items: ResolvedCandidate[] = [];
  for (const position of mtgchPositions) {
    const key = `${position.oracleId}|${position.number}`;
    const facts = eligibility(key);
    const faces = buildCandidateFaces(mtgch.get(key) ?? [], facts.faceCount);
    const gathererKey = `${key}|zhs`;
    const gathererRows = gatherer.get(gathererKey);
    gatherer.delete(gathererKey);
    if (gathererRows != null && gathererRows.length > 0) {
      const gathererFaces = buildGathererFaces(gathererRows, facts.faceNames, facts.faceCount);
      if (gathererSurfacesAgree(faces, gathererFaces)) {
        items.push({
          oracleId:      position.oracleId ?? '', set:           position.set, number:        position.number ?? '',
          lang:          'zhs', cardName:      facts.card?.name ?? null, adoptable:     facts.adoptable,
          source:        'mtgch', conflict:      false, options:       [],
          facesBySource: { mtgch: faces },
        });
        continue;
      }
      items.push({
        oracleId:  position.oracleId ?? '', set:       position.set, number:    position.number ?? '',
        lang:      'zhs', cardName:  facts.card?.name ?? null, adoptable: facts.adoptable,
        source:    'mtgch', conflict:  true,
        options:   [
          { source: 'mtgch', summary: commitFaceSummary(faces) },
          { source: 'gatherer', summary: commitFaceSummary(gathererFaces) },
        ],
        facesBySource: { mtgch: faces, gatherer: gathererFaces },
      });
      continue;
    }
    items.push({
      oracleId:      position.oracleId ?? '', set:           position.set, number:        position.number ?? '',
      lang:          'zhs', cardName:      facts.card?.name ?? null, adoptable:     facts.adoptable,
      source:        'mtgch', conflict:      false, options:       [],
      facesBySource: { mtgch: faces },
    });
  }
  for (const [key, rows] of gatherer) {
    const [oracleId, number, lang] = key.split('|');
    if (oracleId == null || number == null || lang == null) continue;
    const facts = eligibility(`${oracleId}|${number}`);
    const faces = buildGathererFaces(rows, facts.faceNames, facts.faceCount);
    items.push({
      oracleId, set:           setCode.toLowerCase(), number, lang,
      cardName:      facts.card?.name ?? null, adoptable:     facts.adoptable,
      source:        'gatherer', conflict:      false, options:       [],
      facesBySource: { gatherer: faces },
    });
  }
  return items.sort((a, b) =>
    a.number.localeCompare(b.number, undefined, { numeric: true }) || a.lang.localeCompare(b.lang));
}

/** One set's candidate positions (one oracle's only when `oracleId` is given),
 * with card names, source and language labels, and a per-position
 * adoptability verdict. */
const candidateList = os
  .input(z.strictObject({ set: z.string().min(1), oracleId: z.string().optional() }))
  .output(z.strictObject({
    items: z.array(z.strictObject({
      oracleId: z.string(),
      set:      z.string(),
      number:   z.string(),
      lang:     z.string(),
      cardName: z.string().nullable(),
      source:   candidateSource,
      conflict: z.boolean(),
      options:  z.array(z.strictObject({
        source:  candidateSource,
        summary: z.string(),
        faces:   z.array(commitFace),
      })),
      summary:   z.string(),
      adoptable: z.boolean(),
    })),
    total:      z.number(),
    adoptable:  z.number(),
    ineligible: z.number(),
    conflicts:  z.number(),
  }))
  .handler(async ({ input }) => {
    const items = await resolveCandidates(getLocalDb(), input.set, input.oracleId);
    const view = items.map(item => {
      const faces = item.facesBySource[item.source] ?? [];
      return {
        oracleId: item.oracleId,
        set:      item.set,
        number:   item.number,
        lang:     item.lang,
        cardName: item.cardName,
        source:   item.source,
        conflict: item.conflict,
        options:  item.options.map(o => ({
          source:  o.source,
          summary: commitFaceSummary(item.facesBySource[o.source] ?? []),
          faces:   item.facesBySource[o.source] ?? [],
        })),
        summary:   commitFaceSummary(faces),
        adoptable: item.adoptable,
      };
    });
    return {
      items:      view,
      total:      view.length,
      adoptable:  view.filter(i => i.adoptable && !i.conflict).length,
      ineligible: view.filter(i => !i.adoptable).length,
      conflicts:  view.filter(i => i.conflict).length,
    };
  });

/** Adopts one set's resolved candidates (one oracle's only when `oracleId` is
 * given) into print commits. A position whose two zhs sources disagree is
 * never auto-written — it waits for a per-side choice. */
const adoptCandidates = os
  .input(z.strictObject({ set: z.string().min(1), oracleId: z.string().optional() }))
  .output(z.strictObject({
    adopted:    z.number(),
    ineligible: z.number(),
    conflicts:  z.number(),
    note:       z.string(),
  }))
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const items = await resolveCandidates(db, input.set, input.oracleId);

    const values: (typeof PrintCommit)['$inferInsert'][] = [];
    let ineligible = 0;
    let conflicts = 0;
    const adopted: CommitAnchor[] = [];
    for (const item of items) {
      if (item.conflict) {
        conflicts += 1;
        continue;
      }
      if (!item.adoptable) {
        ineligible += 1;
        continue;
      }
      adopted.push({ oracleId: item.oracleId, set: item.set, number: item.number, lang: item.lang });
      values.push({
        oracleId: item.oracleId as never,
        set:      item.set,
        number:   item.number,
        lang:     item.lang,
        origin:   'auto',
        faces:    item.facesBySource[item.source] ?? [],
        note:     item.source === 'mtgch' ? '数据来源：MTGCH' : '数据来源：Gatherer',
      });
    }
    // Fix each position's face-aligned multiverse IDs at write time; a
    // position the cache cannot fully cover stores none.
    const idsMap = await loadGathererMultiverseIds(db, adopted);
    for (const value of values) {
      const ids = idsMap.get(`${value.oracleId}|${value.set}|${value.number}|${value.lang}`);
      value.data = ids != null ? { multiverseIds: ids } : null;
    }
    if (values.length > 0) {
      await db.insert(PrintCommit).values(values).onConflictDoNothing({
        target: [PrintCommit.oracleId, PrintCommit.set, PrintCommit.number, PrintCommit.lang],
      });
    }
    return {
      adopted: values.length,
      ineligible,
      conflicts,
      note:    '数据来源：MTGCH、Gatherer',
    };
  });

/** Adopts one candidate position with an explicitly chosen source — the
 * resolution path for a position whose two zhs surfaces disagree. */
const adoptOne = os
  .input(z.strictObject({
    oracleId: z.string().min(1),
    set:      z.string().min(1),
    number:   z.string().min(1),
    lang:     z.string().min(1),
    source:   candidateSource,
  }))
  .output(z.strictObject({ saved: z.boolean(), note: z.string() }))
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const card = await db.select({
      oracleId:  ScryfallCard.oracleId,
      name:      ScryfallCard.name,
      layout:    ScryfallCard.layout,
      cardFaces: ScryfallCard.cardFaces,
    }).from(ScryfallCard).where(and(
      eq(ScryfallCard.lang, 'en'),
      isNull(ScryfallCard.deletedAt),
      eq(ScryfallCard.oracleId, input.oracleId as never),
      eq(ScryfallCard.set, input.set.toLowerCase()),
      eq(ScryfallCard.collectorNumber, input.number),
    )).then(rows => rows[0]);
    if (card == null) throw new Error('该位置没有英文印刷，无法补全。');
    if (!candidateOracleEligible({ layout: card.layout, name: card.name, cardFaces: card.cardFaces as never })) {
      throw new Error('该卡牌无法自动补全（如可逆卡、拆分双面牌）。');
    }
    const faceCount = candidateFaceCount({ layout: card.layout, name: card.name, cardFaces: card.cardFaces as never });
    const faceNames = faceNamesOf({ name: card.name, cardFaces: card.cardFaces });

    let faces: Array<Partial<PrintCommitFace>>;
    let note: string;
    if (input.source === 'mtgch') {
      if (input.lang !== 'zhs') throw new Error('MTGCH 只提供简体中文译文。');
      const mtgch = await mtgchFacesByPosition(db, input.set);
      const rows = mtgch.get(`${input.oracleId}|${input.number}`);
      if (rows == null || rows.length === 0) throw new Error('MTGCH 没有该位置的译文。');
      faces = buildCandidateFaces(rows, faceCount);
      note = '数据来源：MTGCH';
    } else {
      const gatherer = await gathererFacesByPosition(db, input.set, input.oracleId);
      const rows = gatherer.get(`${input.oracleId}|${input.number}|${input.lang}`);
      if (rows == null || rows.length === 0) throw new Error('Gatherer 缓存里没有该位置的语言版本，请先运行 Gatherer 抓取。');
      faces = buildGathererFaces(rows, faceNames, faceCount);
      note = '数据来源：Gatherer';
    }

    // Whatever source provided the translation, the multiverse ids are
    // Gatherer's — fixed into the commit row at write time when the cache
    // covers every face.
    const anchor: CommitAnchor = { oracleId: input.oracleId, set: input.set, number: input.number, lang: input.lang };
    const ids = (await loadGathererMultiverseIds(db, [anchor])).get(`${anchor.oracleId}|${anchor.set}|${anchor.number}|${anchor.lang}`) ?? null;
    const data: PrintCommitData | null = ids != null ? { multiverseIds: ids } : null;

    await db.insert(PrintCommit).values({
      oracleId: input.oracleId as never,
      set:      input.set,
      number:   input.number,
      lang:     input.lang,
      origin:   'auto',
      faces,
      data,
      note,
    }).onConflictDoUpdate({
      target: [PrintCommit.oracleId, PrintCommit.set, PrintCommit.number, PrintCommit.lang],
      // A re-adoption refreshes the fixed ids only when the cache still
      // resolves them; a coverage gap must not wipe the stored ones.
      set:    { faces, note, ...(ids != null ? { data } : {}) },
    });
    return { saved: true, note };
  });

/** English scryfall row of one oracle (representative print). */
async function englishCard(database: ReturnType<typeof getLocalDb>, oracleId: string) {
  return database.select({
    oracleId:        ScryfallCard.oracleId,
    name:            ScryfallCard.name,
    set:             ScryfallCard.set,
    collectorNumber: ScryfallCard.collectorNumber,
    cardFaces:       ScryfallCard.cardFaces,
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
    data:      commitData.nullable(),
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
      data:      row.data ?? null,
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
 * projection clones it, so a commit without one would silently never project.
 * The form-edited payload keys are replaced wholesale; the fixed multiverse
 * ids are re-resolved from the Gatherer cache, falling back to the stored
 * ones when the cache cannot cover the position. */
const save = os
  .input(z.strictObject({
    oracleId: z.string().min(1),
    set:      z.string().min(1),
    number:   z.string().min(1),
    lang:     z.string().min(1),
    faces:    z.array(commitFace),
    data:     commitData.nullable(),
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
    const data = normalizeCommitData(input.data);
    const note = input.note?.trim() || null;

    const anchor: CommitAnchor = { oracleId: input.oracleId, set: input.set, number: input.number, lang: input.lang };
    const existing = await db.select({ data: PrintCommit.data }).from(PrintCommit).where(and(
      eq(PrintCommit.oracleId, input.oracleId as never),
      eq(PrintCommit.set, input.set),
      eq(PrintCommit.number, input.number),
      eq(PrintCommit.lang, input.lang),
    )).then(rows => rows[0]);
    const ids = (await loadGathererMultiverseIds(db, [anchor])).get(`${anchor.oracleId}|${anchor.set}|${anchor.number}|${anchor.lang}`)
      ?? existing?.data?.multiverseIds
      ?? null;
    const storedData: PrintCommitData | null = ids != null && ids.length > 0
      ? { ...(data ?? {}), multiverseIds: ids }
      : data;

    await db.insert(PrintCommit).values({
      oracleId: input.oracleId as never,
      set:      input.set,
      number:   input.number,
      lang:     input.lang,
      faces,
      data:     storedData,
      note,
    }).onConflictDoUpdate({
      target: [PrintCommit.oracleId, PrintCommit.set, PrintCommit.number, PrintCommit.lang],
      set:    { faces, data: storedData, note },
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

/** Projects one commit's card synchronously (merge siblings included,
 * withdrawn manual positions of the card recycled). A single-card scope is
 * cheaper than a task run, so the counts return inline. */
const projectOne = os
  .input(commitAnchor)
  .output(z.strictObject({
    oracles:        z.number(),
    unresolved:     z.number(),
    prints:         z.number(),
    printParts:     z.number(),
    manualRecycled: z.number(),
    sourceRecycled: z.number(),
  }))
  .handler(async ({ input }) => {
    return runCommitsProjection(getLocalDb(), [input.oracleId]);
  });

/** Starts a scoped projection run covering every commit in the list — one
 * set's commits when `set` is given. */
const projectAll = os
  .input(z.strictObject({ set: z.string().optional() }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const setScope = input.set != null && input.set !== '' ? input.set : null;
    const rows = await db.selectDistinct({ oracleId: PrintCommit.oracleId }).from(PrintCommit)
      .where(setScope != null ? eq(PrintCommit.set, setScope) : undefined);
    const oracleIds = rows.map(r => String(r.oracleId));
    if (oracleIds.length === 0) {
      throw new Error(setScope != null ? `系列 ${setScope} 没有可投影的补全记录。` : '当前没有可投影的补全记录。');
    }
    return createAndRunTask(magicProjectCommitsTaskDefinition.taskType, {
      taskType:          magicProjectCommitsTaskDefinition.taskType,
      definitionVersion: magicProjectCommitsTaskDefinition.definitionVersion,
      scope:             { type: magicProjectCommitsTaskDefinition.scopeType, key: 'global', snapshot: {} },
      params:            { oracleIds },
    });
  });

export const magicCommitsRouter = {
  list,
  get,
  cardSearch,
  save,
  remove,
  projectOne,
  projectAll,
  candidates: { list: candidateList, adopt: adoptCandidates, adoptOne },
};
