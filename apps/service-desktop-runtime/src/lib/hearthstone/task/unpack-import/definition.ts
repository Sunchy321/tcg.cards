import { z } from 'zod';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import canonicalize from 'canonicalize';

import { getLocalDb } from '../../hsdata-local-db';
import { ExtractedCard, ExtractedCardTag, PatchState } from '@tcg-cards/db/schema/local/hearthstone';
import { createDefinition } from '#task/definition';

const WORKSPACE = resolve(import.meta.dir, '..', '..', '..', '..', '..', '..', '..', '..');
const UNPACK_DIR = resolve(WORKSPACE, 'data', 'hearthstone', 'unpack');

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

function computeSnapshotHash(card: CardRecord, tags: CardTagRecord[]): string {
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
  gameplayEvent:                 number | null;
  craftingEvent:                 number | null;
  goldenCraftingEvent:           number | null;
  signatureCraftingEvent:        number | null;
  diamondCraftingEvent:          number | null;
  featuredCardsEvent:            number | null;
  battlegroundsActiveEvent:      number | null;
  battlegroundsEarlyAccessEvent: number | null;
  battlegroundsEveryGameEvent:   number | null;
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

  // Group tags by dbfId
  const tagsByDbfId = new Map<number, CardTagRecord[]>();
  for (const t of tagData.Records) {
    const list = tagsByDbfId.get(t.m_cardId) ?? [];
    list.push(t);
    tagsByDbfId.set(t.m_cardId, list);
  }

  // Build card rows with snapshot hashes
  const cards: CardRow[] = [];
  const tags: Array<{ dbfId: number, tagId: number, tagValue: number, isReferenceTag: boolean, isPowerKeywordTag: boolean }> = [];

  for (const r of cardData.Records) {
    const cardTags = tagsByDbfId.get(r.m_ID) ?? [];
    const snapshotHash = computeSnapshotHash(r, cardTags);

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
      gameplayEvent:                 r.m_gameplayEvent ?? null,
      craftingEvent:                 r.m_craftingEvent ?? null,
      goldenCraftingEvent:           r.m_goldenCraftingEvent ?? null,
      signatureCraftingEvent:        r.m_signatureCraftingEvent ?? null,
      diamondCraftingEvent:          r.m_diamondCraftingEvent ?? null,
      featuredCardsEvent:            r.m_featuredCardsEvent ?? null,
      battlegroundsActiveEvent:      r.m_battlegroundsActiveEvent ?? null,
      battlegroundsEarlyAccessEvent: r.m_battlegroundsEarlyAccessEvent ?? null,
      battlegroundsEveryGameEvent:   r.m_battlegroundsEveryGameEvent ?? null,
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
      zipName:     input.zipName,
      dryRun:      input.dryRun ?? false,
      data:        null as ReturnType<typeof loadCardData> | null,
      cardIds:     null as Map<string, string> | null,
      buildNumber: 0,
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
        // Load existing snapshot IDs for tag insertion
        const idRows = await db.select({ id: ExtractedCard.id, cardId: ExtractedCard.cardId })
          .from(ExtractedCard);
        ctx.cardIds = new Map(idRows.map(r => [r.cardId, r.id]));
        return { phase: 'tags', index: 0 } as BlockInput;
      }

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
        const idRows = await db.select({ id: ExtractedCard.id, cardId: ExtractedCard.cardId })
          .from(ExtractedCard);
        ctx.cardIds = new Map(idRows.map(r => [r.cardId, r.id]));
        return { phase: 'tags', index: 0 } as BlockInput;
      }
      return { phase: 'card', index: done_ } as BlockInput;
    }

    // tags phase
    const { cards, tags: allTags, buildNumber: _buildNumber } = ctx.data!;
    const cardIds = ctx.cardIds!;
    const tagBatch = allTags.slice(bi.index, bi.index + BATCH);
    if (tagBatch.length === 0) return done(bi);

    // Build tag rows with snapshot IDs
    const tagRows = tagBatch.map(t => {
      // dbfId -> cardId -> snapshotId
      const card = cards.find(c => c.dbfId === t.dbfId);
      const snapshotId = card ? cardIds.get(card.cardId) : null;
      return {
        ...t,
        snapshotId,
      };
    }).filter(t => t.snapshotId != null);

    if (tagRows.length > 0) {
      await db.insert(ExtractedCardTag)
        .values(tagRows as any)
        .onConflictDoUpdate({
          target: [ExtractedCardTag.snapshotId, ExtractedCardTag.tagId],
          set:    {
            tagValue:          sql.raw('EXCLUDED.tag_value'),
            isReferenceTag:    sql.raw('EXCLUDED.is_reference_tag'),
            isPowerKeywordTag: sql.raw('EXCLUDED.is_power_keyword_tag'),
          },
        });
    }

    const tagDone = bi.index + tagBatch.length;
    progress({
      done:     cards.length + tagDone,
      total:    cards.length + allTags.length,
      segments: [
        { name: 'CARD', done: cards.length, total: cards.length },
        { name: 'CARD_TAG', done: tagDone, total: allTags.length },
      ],
    });

    if (tagDone >= allTags.length) return done({ phase: 'tags', index: tagDone } as BlockInput);
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
