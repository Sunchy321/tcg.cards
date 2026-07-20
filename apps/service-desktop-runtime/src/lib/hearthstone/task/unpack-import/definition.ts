import { z } from 'zod';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';

import { getLocalDb } from '../../hsdata-local-db';
import { UnpackCardData, PatchState } from '@tcg-cards/db/schema/local/hearthstone';
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

const orNull = (v: unknown) => (v === '' || v === undefined ? null : v);

function loadCardData(zipName: string, buildNumber: number) {
  const zipPath = resolve(UNPACK_DIR, `${zipName}.zip`);
  const json = execSync(`unzip -p "${zipPath}" "CARD.json"`, {
    encoding:  'utf-8',
    maxBuffer: 512 * 1024 * 1024,
  });
  const data = JSON.parse(json) as { Records: CardRecord[] };

  return data.Records.map(r => ({
    buildNumber,
    cardId:                        r.m_noteMiniGuid,
    dbfId:                         r.m_ID,
    textBuilderType:               r.m_cardTextBuilderType,
    artistName:                    orNull(r.m_artistName),
    signatureArtistName:           orNull(r.m_signatureArtistName),
    creditsCardName:               orNull(r.m_creditsCardName),
    watermarkTextureOverride:      orNull(r.m_watermarkTextureOverride),
    suggestionWeight:              r.m_suggestionWeight ?? 0,
    changeVersion:                 r.m_changeVersion ?? 0,
    gameplayEvent:                 r.m_gameplayEvent,
    craftingEvent:                 r.m_craftingEvent,
    goldenCraftingEvent:           r.m_goldenCraftingEvent,
    signatureCraftingEvent:        r.m_signatureCraftingEvent,
    diamondCraftingEvent:          r.m_diamondCraftingEvent,
    featuredCardsEvent:            r.m_featuredCardsEvent,
    battlegroundsActiveEvent:      r.m_battlegroundsActiveEvent,
    battlegroundsEarlyAccessEvent: r.m_battlegroundsEarlyAccessEvent,
    battlegroundsEveryGameEvent:   r.m_battlegroundsEveryGameEvent,
    name:                          r.m_name ?? null,
    textInHand:                    r.m_textInHand ?? null,
    flavorText:                    r.m_flavorText ?? null,
    howToGetCard:                  r.m_howToGetCard ?? null,
    howToGetGoldCard:              r.m_howToGetGoldCard ?? null,
    howToGetSignatureCard:         r.m_howToGetSignatureCard ?? null,
    howToGetDiamondCard:           r.m_howToGetDiamondCard ?? null,
    targetArrowText:               r.m_targetArrowText ?? null,
    shortName:                     r.m_shortName ?? null,
  }));
}

export const unpackImportTaskDefinition = createDefinition('hearthstone_unpack_import', { version: '2026-07-20:v1' })
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
  }))
  .context({
    init: input => ({
      zipName:     input.zipName,
      dryRun:      input.dryRun ?? false,
      cards:       null as ReturnType<typeof loadCardData> | null,
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

    const cards = loadCardData(ctx.zipName, buildNumber);
    ctx.cards = cards;

    if (ctx.dryRun) {
      return { total: cards.length, blockInput: { index: cards.length } };
    }

    return { total: cards.length, blockInput: { index: 0 } };
  })
  .block(async ({ ctx, blockInput, progress, done }) => {
    const cards = ctx.cards!;
    const { index } = blockInput;
    const BATCH = 500;
    const batch = cards.slice(index, index + BATCH);
    if (batch.length === 0) return done(blockInput);

    const db = getLocalDb();
    await db
      .insert(UnpackCardData)
      .values(batch as any)
      .onConflictDoUpdate({
        target: [UnpackCardData.buildNumber, UnpackCardData.cardId],
        set:    { textBuilderType: sql.raw('EXCLUDED.text_builder_type') },
      });

    const next = Math.min(index + BATCH, cards.length);
    progress({ done: next, total: cards.length });
    if (next >= cards.length) return done({ index: next });
    return { index: next };
  })
  .exit(async ({ ctx }) => {
    const cards = ctx.cards!;
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

    return { buildNumber, cardCount: cards.length };
  })
  .build();
