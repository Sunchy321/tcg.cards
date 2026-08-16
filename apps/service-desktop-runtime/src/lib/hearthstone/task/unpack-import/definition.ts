import { z } from 'zod';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { and, eq, inArray, sql } from 'drizzle-orm';
import canonicalize from 'canonicalize';

import { getLocalDb, type LocalDb } from '../../hsdata-local-db';
import { ExtractedCard, ExtractedCardTag, PatchState } from '@tcg-cards/db/schema/local/hearthstone';
import { createDefinition } from '#task/definition';

const WORKSPACE = resolve(import.meta.dir, '..', '..', '..', '..', '..', '..', '..', '..');
const UNPACK_DIR = resolve(WORKSPACE, 'data', 'hearthstone', 'unpack');

const EVENT_FIELDS = [
  'm_gameplayEvent',
  'm_craftingEvent',
  'm_goldenCraftingEvent',
  'm_signatureCraftingEvent',
  'm_diamondCraftingEvent',
  'm_featuredCardsEvent',
  'm_battlegroundsActiveEvent',
  'm_battlegroundsEarlyAccessEvent',
  'm_battlegroundsEveryGameEvent',
] as const;

interface EventMap {
  m_Keys:   string[];
  m_Values: number[];
}

function loadEventMap(zipPath: string): Map<number, string> {
  const json = execSync(`unzip -p "${zipPath}" "EventMap.json"`, {
    encoding:  'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  });
  const em = JSON.parse(json) as EventMap;
  const map = new Map<number, string>();
  for (let i = 0; i < em.m_Keys.length; i++) {
    map.set(em.m_Values[i], em.m_Keys[i]);
  }
  return map;
}

interface CardRecord {
  m_ID:                             number;
  m_noteMiniGuid:                   string;
  m_cardTextBuilderType:            number;
  m_artistName?:                    string;
  m_signatureArtistName?:           string;
  m_creditsCardName?:               string;
  m_watermarkTextureOverride?:      string;
  m_suggestionWeight?:              number;
  m_changeVersion?:                 number;
  m_name?:                          { m_locValues: string[], m_locId: number };
  m_textInHand?:                    { m_locValues: string[], m_locId: number };
  m_flavorText?:                    { m_locValues: string[], m_locId: number };
  m_howToGetCard?:                  { m_locValues: string[], m_locId: number };
  m_howToGetGoldCard?:              { m_locValues: string[], m_locId: number };
  m_howToGetSignatureCard?:         { m_locValues: string[], m_locId: number };
  m_howToGetDiamondCard?:           { m_locValues: string[], m_locId: number };
  m_targetArrowText?:               { m_locValues: string[], m_locId: number };
  m_shortName?:                     { m_locValues: string[], m_locId: number };
  m_gameplayEvent?:                 number;
  m_craftingEvent?:                 number;
  m_goldenCraftingEvent?:           number;
  m_signatureCraftingEvent?:        number;
  m_diamondCraftingEvent?:          number;
  m_featuredCardsEvent?:            number;
  m_battlegroundsActiveEvent?:      number;
  m_battlegroundsEarlyAccessEvent?: number;
  m_battlegroundsEveryGameEvent?:   number;
}

interface CardTagRecord {
  m_ID:                number;
  m_cardId:            number;
  m_tagId:             number;
  m_tagValue:          number;
  m_isReferenceTag:    number;
  m_isPowerKeywordTag: number;
}

const orNull = <T>(v: T) => (v === '' || v === undefined ? null : v);

function hashPayload(value: unknown): string {
  return Bun.SHA256.hash(canonicalize(value)!, 'hex') as string;
}

function computeSnapshotHash(card: unknown, tags: CardTagRecord[]): string {
  return hashPayload({ card, tags });
}

interface CardRow {
  cardId:                        string;
  dbfId:                         number;
  snapshotHash:                  string;
  textBuilderType:               number;
  artistName:                    string | null;
  signatureArtistName:           string | null;
  creditsCardName:               string | null;
  watermarkTextureOverride:      string | null;
  suggestionWeight:              number;
  changeVersion:                 number;
  gameplayEvent:                 string | null;
  craftingEvent:                 string | null;
  goldenCraftingEvent:           string | null;
  signatureCraftingEvent:        string | null;
  diamondCraftingEvent:          string | null;
  featuredCardsEvent:            string | null;
  battlegroundsActiveEvent:      string | null;
  battlegroundsEarlyAccessEvent: string | null;
  battlegroundsEveryGameEvent:   string | null;
  name:                          { m_locValues: string[], m_locId: number } | null;
  textInHand:                    { m_locValues: string[], m_locId: number } | null;
  flavorText:                    { m_locValues: string[], m_locId: number } | null;
  howToGetCard:                  { m_locValues: string[], m_locId: number } | null;
  howToGetGoldCard:              { m_locValues: string[], m_locId: number } | null;
  howToGetSignatureCard:         { m_locValues: string[], m_locId: number } | null;
  howToGetDiamondCard:           { m_locValues: string[], m_locId: number } | null;
  targetArrowText:               { m_locValues: string[], m_locId: number } | null;
  shortName:                     { m_locValues: string[], m_locId: number } | null;
}

// Normalized CARD_TAG row inserted into extracted_card_tags.
interface TagInput {
  dbfId:             number;
  tagId:             number;
  tagValue:          number;
  isReferenceTag:    boolean;
  isPowerKeywordTag: boolean;
}

function resolveEvent(eventId: number | undefined, eventMap: Map<number, string>): string | null {
  if (eventId == null) return null;
  return eventMap.get(eventId) ?? String(eventId);
}

function loadCardData(zipName: string, buildNumber: number) {
  const zipPath = resolve(UNPACK_DIR, `${zipName}.zip`);
  const cardJson = execSync(`unzip -p "${zipPath}" "CARD.json"`, {
    encoding:  'utf-8',
    maxBuffer: 512 * 1024 * 1024,
  });
  const cardData = JSON.parse(cardJson) as { Records: CardRecord[] };

  const tagJson = execSync(`unzip -p "${zipPath}" "CARD_TAG.json"`, {
    encoding:  'utf-8',
    maxBuffer: 512 * 1024 * 1024,
  });
  const tagData = JSON.parse(tagJson) as { Records: CardTagRecord[] };

  const eventMap = loadEventMap(zipPath);

  // Group tags by dbfId
  const tagsByDbfId = new Map<number, CardTagRecord[]>();
  for (const t of tagData.Records) {
    const list = tagsByDbfId.get(t.m_cardId) ?? [];
    list.push(t);
    tagsByDbfId.set(t.m_cardId, list);
  }

  // Build card rows with snapshot hashes
  const cards: CardRow[] = [];
  const tags: TagInput[] = [];

  for (const r of cardData.Records) {
    const cardTags = tagsByDbfId.get(r.m_ID) ?? [];

    // Resolve event IDs to names for hash computation and storage
    const resolved: Partial<CardRecord> = {};
    for (const field of EVENT_FIELDS) {
      const eventId = r[field] as number | undefined;
      (resolved as any)[field] = resolveEvent(eventId, eventMap) as any;
    }
    const normalizedCard = { ...r, ...resolved };
    const snapshotHash = computeSnapshotHash(normalizedCard, cardTags);

    cards.push({
      cardId:                        r.m_noteMiniGuid,
      dbfId:                         r.m_ID,
      snapshotHash,
      textBuilderType:               r.m_cardTextBuilderType,
      artistName:                    orNull(r.m_artistName),
      signatureArtistName:           orNull(r.m_signatureArtistName),
      creditsCardName:               orNull(r.m_creditsCardName),
      watermarkTextureOverride:      orNull(r.m_watermarkTextureOverride),
      suggestionWeight:              r.m_suggestionWeight ?? 0,
      changeVersion:                 r.m_changeVersion ?? 0,
      gameplayEvent:                 resolveEvent(r.m_gameplayEvent, eventMap),
      craftingEvent:                 resolveEvent(r.m_craftingEvent, eventMap),
      goldenCraftingEvent:           resolveEvent(r.m_goldenCraftingEvent, eventMap),
      signatureCraftingEvent:        resolveEvent(r.m_signatureCraftingEvent, eventMap),
      diamondCraftingEvent:          resolveEvent(r.m_diamondCraftingEvent, eventMap),
      featuredCardsEvent:            resolveEvent(r.m_featuredCardsEvent, eventMap),
      battlegroundsActiveEvent:      resolveEvent(r.m_battlegroundsActiveEvent, eventMap),
      battlegroundsEarlyAccessEvent: resolveEvent(r.m_battlegroundsEarlyAccessEvent, eventMap),
      battlegroundsEveryGameEvent:   resolveEvent(r.m_battlegroundsEveryGameEvent, eventMap),
      name:                          r.m_name ?? null,
      textInHand:                    r.m_textInHand ?? null,
      flavorText:                    r.m_flavorText ?? null,
      howToGetCard:                  r.m_howToGetCard ?? null,
      howToGetGoldCard:              r.m_howToGetGoldCard ?? null,
      howToGetSignatureCard:         r.m_howToGetSignatureCard ?? null,
      howToGetDiamondCard:           r.m_howToGetDiamondCard ?? null,
      targetArrowText:               r.m_targetArrowText ?? null,
      shortName:                     r.m_shortName ?? null,
    });
  }

  // Collect all tags for insertion
  for (const r of tagData.Records) {
    tags.push({
      dbfId:             r.m_cardId,
      tagId:             r.m_tagId,
      tagValue:          r.m_tagValue,
      isReferenceTag:    r.m_isReferenceTag === 1,
      isPowerKeywordTag: r.m_isPowerKeywordTag === 1,
    });
  }

  return { cards, tags, buildNumber };
}

type BlockInput = { phase: 'card', index: number } | { phase: 'tags', index: number };

// Stable key joining a cardId with its snapshotHash.
function snapshotKey(cardId: string, snapshotHash: string): string {
  return `${cardId}\u0000${snapshotHash}`;
}

// True when two tag row sets are identical (unique per tagId).
function tagSetsEqual(
  actual: Array<{ tagId: number, tagValue: number, isReferenceTag: boolean, isPowerKeywordTag: boolean }>,
  expected: Array<{ tagId: number, tagValue: number, isReferenceTag: boolean, isPowerKeywordTag: boolean }>,
): boolean {
  if (actual.length !== expected.length) return false;
  const key = (tag: { tagId: number, tagValue: number, isReferenceTag: boolean, isPowerKeywordTag: boolean }) =>
    `${tag.tagId}\u0000${tag.tagValue}\u0000${tag.isReferenceTag}\u0000${tag.isPowerKeywordTag}`;
  const actualKeys = new Set(actual.map(key));
  return expected.every(tag => actualKeys.has(key(tag)));
}

// Resolves the snapshot that contains this build for every card and dedupes the
// expected CARD_TAG rows per dbfId, so the tags phase attaches tags to the correct
// snapshot even when a cardId has multiple snapshots across versions.
async function buildTagContext(
  db: LocalDb,
  buildNumber: number,
  cards: CardRow[],
  tags: TagInput[],
): Promise<{
  targetSnapshots:     Array<{ snapshotId: string, dbfId: number }>;
  expectedTagsByDbfId: Map<number, TagInput[]>;
}> {
  const rows = await db.select({
    id:           ExtractedCard.id,
    cardId:       ExtractedCard.cardId,
    snapshotHash: ExtractedCard.snapshotHash,
  })
    .from(ExtractedCard)
    .where(sql<boolean>`${buildNumber} = any(${ExtractedCard.buildNumbers})`);
  const snapshotIdByKey = new Map(rows.map(row => [snapshotKey(row.cardId, row.snapshotHash), row.id]));

  const targetSnapshots: Array<{ snapshotId: string, dbfId: number }> = [];
  for (const card of cards) {
    const snapshotId = snapshotIdByKey.get(snapshotKey(card.cardId, card.snapshotHash));
    if (snapshotId) targetSnapshots.push({ snapshotId, dbfId: card.dbfId });
  }

  const expectedByDbfId = new Map<number, Map<number, TagInput>>();
  for (const tag of tags) {
    const byTagId = expectedByDbfId.get(tag.dbfId) ?? new Map<number, TagInput>();
    byTagId.set(tag.tagId, tag);
    expectedByDbfId.set(tag.dbfId, byTagId);
  }
  const expectedTagsByDbfId = new Map<number, TagInput[]>();
  for (const [dbfId, byTagId] of expectedByDbfId) {
    expectedTagsByDbfId.set(dbfId, [...byTagId.values()]);
  }

  return { targetSnapshots, expectedTagsByDbfId };
}

export const unpackImportTaskDefinition = createDefinition('hearthstone_unpack_import', { version: '2026-07-21:v2' })
  .scope(
    z.object({ zipName: z.string() }),
    {
      type:    'hearthstone_unpack_import' as const,
      resolve: scope => ({
        key:      `global`,
        snapshot: scope,
      }),
    },
  )
  .input(z.object({
    zipName: z.string(),
    dryRun:  z.boolean().optional(),
  }))
  .output(z.object({
    buildNumber: z.number(),
    cardCount:   z.number(),
    tagCount:    z.number(),
  }))
  .context({
    init: input => ({
      zipName:             input.zipName,
      dryRun:              input.dryRun ?? false,
      data:                null as ReturnType<typeof loadCardData> | null,
      targetSnapshots:     null as Array<{ snapshotId: string, dbfId: number }> | null,
      expectedTagsByDbfId: null as Map<number, TagInput[]> | null,
      buildNumber:         0,
    }),
  })

  .stage('importing', { label: '导入拆包数据', progressMode: 'bounded' })
  .entry(async ({ ctx }) => {
    const buildNumber = Number(ctx.zipName);
    if (!Number.isSafeInteger(buildNumber) || buildNumber <= 0) {
      throw new Error(`Invalid build number: ${ctx.zipName}`);
    }
    ctx.buildNumber = buildNumber;

    const data = loadCardData(ctx.zipName, buildNumber);
    ctx.data = data;

    const total = data.cards.length + data.tags.length;

    if (ctx.dryRun) {
      return { total, blockInput: { phase: 'tags', index: data.tags.length } as BlockInput };
    }

    return { total, blockInput: { phase: 'card', index: 0 } as BlockInput };
  })
  .block(async ({ ctx, blockInput, progress, done }) => {
    const db = getLocalDb();
    const BATCH = 500;
    const bi = blockInput as BlockInput;

    if (bi.phase === 'card') {
      const { cards, tags: allTags, buildNumber } = ctx.data!;
      const batch = cards.slice(bi.index, bi.index + BATCH);
      if (batch.length === 0) {
        // Resolve the snapshots that contain this build and their expected tags.
        const tagContext = await buildTagContext(db, buildNumber, cards, allTags);
        ctx.targetSnapshots = tagContext.targetSnapshots;
        ctx.expectedTagsByDbfId = tagContext.expectedTagsByDbfId;
        return { phase: 'tags', index: 0 } as BlockInput;
      }

      // Snapshots already projected for an older build and about to gain this build
      // must be re-projected in fast-forward mode (version_only) instead of skipped.
      await db.update(ExtractedCard)
        .set({ projectionState: 'version_only' })
        .where(and(
          inArray(ExtractedCard.cardId, batch.map(c => c.cardId)),
          eq(ExtractedCard.projectionState, 'projected'),
          sql`not (${buildNumber} = any(${ExtractedCard.buildNumbers}))`,
        ));

      // Upsert each card: if (cardId, snapshotHash) exists, append sourceTag; otherwise insert new
      for (const card of batch) {
        await db.insert(ExtractedCard)
          .values({
            ...card,
            buildNumbers:    [buildNumber],
            projectionState: 'not_projected',
          })
          .onConflictDoUpdate({
            target:   [ExtractedCard.cardId, ExtractedCard.snapshotHash],
            set:      { buildNumbers: sql`array_append(${ExtractedCard.buildNumbers}, ${buildNumber})` },
            setWhere: sql`not (${buildNumber} = any(${ExtractedCard.buildNumbers}))`,
          });
      }

      const done_ = bi.index + batch.length;
      progress({
        done:     done_,
        total:    cards.length + allTags.length,
        segments: [
          { name: 'CARD', done: done_, total: cards.length },
          { name: 'CARD_TAG', done: 0, total: allTags.length },
        ],
      });

      if (done_ >= cards.length) {
        // Resolve the snapshots that contain this build and their expected tags.
        const tagContext = await buildTagContext(db, buildNumber, cards, allTags);
        ctx.targetSnapshots = tagContext.targetSnapshots;
        ctx.expectedTagsByDbfId = tagContext.expectedTagsByDbfId;
        return { phase: 'tags', index: 0 } as BlockInput;
      }
      return { phase: 'card', index: done_ } as BlockInput;
    }

    // tags phase: verify each snapshot that contains this build against the raw
    // CARD_TAG rows, rewriting a snapshot's tags only when they differ so reused
    // rows that are already correct are left untouched.
    const { cards } = ctx.data!;
    const snapshots = ctx.targetSnapshots ?? [];
    const expectedTagsByDbfId = ctx.expectedTagsByDbfId ?? new Map<number, TagInput[]>();
    const tagBatch = snapshots.slice(bi.index, bi.index + BATCH);
    if (tagBatch.length === 0) return done(bi);

    const batchSnapshotIds = tagBatch.map(s => s.snapshotId);
    const actualTagRows = await db.select()
      .from(ExtractedCardTag)
      .where(inArray(ExtractedCardTag.snapshotId, batchSnapshotIds));
    const actualBySnapshot = new Map<string, typeof actualTagRows>();
    for (const row of actualTagRows) {
      const list = actualBySnapshot.get(row.snapshotId) ?? [];
      list.push(row);
      actualBySnapshot.set(row.snapshotId, list);
    }

    const toDelete = new Set<string>();
    const toInsert: Array<TagInput & { snapshotId: string }> = [];

    for (const snap of tagBatch) {
      const expected = expectedTagsByDbfId.get(snap.dbfId) ?? [];
      const actual = actualBySnapshot.get(snap.snapshotId) ?? [];
      if (tagSetsEqual(actual, expected)) continue;

      toDelete.add(snap.snapshotId);
      for (const tag of expected) {
        toInsert.push({ ...tag, snapshotId: snap.snapshotId });
      }
    }

    if (toDelete.size > 0) {
      await db.delete(ExtractedCardTag)
        .where(inArray(ExtractedCardTag.snapshotId, [...toDelete]));
      await db.insert(ExtractedCardTag).values(toInsert as any);
      // Repaired snapshots must be re-projected so the corrected tags take effect.
      await db.update(ExtractedCard)
        .set({ projectionState: 'not_projected' })
        .where(inArray(ExtractedCard.id, [...toDelete]));
    }

    const tagDone = bi.index + tagBatch.length;
    const snapshotTotal = snapshots.length;
    progress({
      done:     cards.length + tagDone,
      total:    cards.length + snapshotTotal,
      segments: [
        { name: 'CARD', done: cards.length, total: cards.length },
        { name: 'CARD_TAG', done: tagDone, total: snapshotTotal },
      ],
    });

    if (tagDone >= snapshotTotal) return done({ phase: 'tags', index: tagDone } as BlockInput);
    return { phase: 'tags', index: tagDone } as BlockInput;
  })
  .exit(async ({ ctx }) => {
    const data = ctx.data!;
    const buildNumber = ctx.buildNumber;

    if (!ctx.dryRun) {
      const db = getLocalDb();
      await db
        .insert(PatchState)
        .values({ buildNumber, unpackStatus: 'completed', unpackedAt: new Date() })
        .onConflictDoUpdate({
          target: PatchState.buildNumber,
          set:    { unpackStatus: 'completed', unpackError: null, unpackedAt: new Date() },
        });
    }

    return { buildNumber, cardCount: data.cards.length, tagCount: data.tags.length };
  })
  .build();
