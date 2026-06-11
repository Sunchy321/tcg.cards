import { ORPCError, os } from '@orpc/server';

import z from 'zod';
import { omit } from 'lodash-es';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { diff as jsonDiff } from 'jsondiffpatch';

import { db } from '#db/db';
import { CardRelation } from '#schema/shared/hearthstone/card-relation';
import { CardEntityView, EntityView } from '#schema/shared/hearthstone/entity';
import { EntityRelation } from '#schema/shared/hearthstone/entity-relation';

import { locale } from '#model/hearthstone/schema/basic';
import { cardProfile } from '#model/hearthstone/schema/card';
import { cardEntityView, cardFullView } from '#model/hearthstone/schema/entity';

import { getRandomCardId } from '~~/server/utils/random-card';
import { isStandardSet, standardCoreSets } from '~~/server/utils/hearthstone-format';

const dreamCards = ['DREAM_01', 'DREAM_02', 'DREAM_03', 'DREAM_04', 'DREAM_05'];
const vanillaDreamCards = ['VAN_DREAM_01', 'VAN_DREAM_02', 'VAN_DREAM_03', 'VAN_DREAM_04', 'VAN_DREAM_05'];
const corruptedDreamCards = ['EDR_846t1', 'EDR_846t2', 'EDR_846t3', 'EDR_846t4', 'EDR_846t5'];
const marinTreasureCards = ['LOOT_998h', 'LOOT_998j', 'LOOT_998k', 'LOOT_998l'];
const managerMarinTreasureCards = ['VAC_702t', 'VAC_702t2', 'VAC_702t3', 'VAC_702t4'];
const maxVersion = (version: typeof CardEntityView.version) => sql<number>`
  (
    SELECT max(value)
    FROM unnest(${version}) AS version_item(value)
  )
`;

// Selects either the latest projection or the projection that contains an explicit patch version.
function latestOrVersion(
  versionColumn: typeof CardEntityView.version | typeof EntityRelation.version,
  latestColumn: typeof CardEntityView.isLatest | typeof EntityRelation.isLatest,
  version: number | undefined,
) {
  return version == null
    ? eq(latestColumn, true)
    : sql`${version} = any(${versionColumn})`;
}

// Matches legacy relation rows to the concrete version currently shown by the card page.
function legacyRelationVersion(version: number | undefined, currentVersion: number) {
  return sql`${version ?? currentVersion} = any(${CardRelation.version})`;
}

// Finds a localized card projection for the requested card ID and version mode.
async function findCardView(input: {
  cardId:   string;
  lang:     z.infer<typeof locale>;
  version?: number | undefined;
}) {
  const filters = [
    eq(CardEntityView.cardId, input.cardId),
    eq(CardEntityView.lang, input.lang),
    latestOrVersion(CardEntityView.version, CardEntityView.isLatest, input.version),
  ];

  return await db.select().from(CardEntityView)
    .where(and(...filters))
    .orderBy(desc(maxVersion(CardEntityView.version)))
    .limit(1)
    .then(rows => rows[0]);
}

const random = os
  .route({
    method:      'GET',
    description: 'Get random card ID',
    tags:        ['Magic', 'Card'],
  })
  .input(z.any())
  .output(z.string())
  .handler(async () => {
    const cardId = await getRandomCardId();

    if (cardId == null) {
      throw new ORPCError('NOT_FOUND');
    }

    return cardId;
  });

const summary = os
  .route({
    method:      'GET',
    description: 'Get card by ID',
    tags:        ['Hearthstone', 'Card'],
  })
  .input(z.object({
    cardId:  z.string().describe('Card ID'),
    lang:    locale.default('en').describe('Language'),
    version: z.int().min(0).optional().describe('Version'),
  }))
  .output(cardEntityView)
  .handler(async ({ input }) => {
    const card = await findCardView(input);

    if (!card) {
      throw new ORPCError('NOT_FOUND');
    }

    return card;
  });

const summaryByName = os
  .input(z.object({
    name:    z.string(),
    lang:    locale.default('en'),
    version: z.int().min(0).optional(),
  }))
  .output(cardEntityView.array())
  .handler(async ({ input }) => {
    const { name, lang, version } = input;

    const cards = await db.select().from(CardEntityView)
      .where(and(
        eq(CardEntityView.localization.name, name),
        eq(CardEntityView.lang, lang),
        latestOrVersion(CardEntityView.version, CardEntityView.isLatest, version),
      ))
      .orderBy(desc(maxVersion(CardEntityView.version)));

    if (cards.length == 0) {
      throw new ORPCError('NOT_FOUND');
    }

    return cards;
  });

const full = os
  .route({
    method:      'GET',
    description: 'Get complete card by ID',
    tags:        ['Hearthstone', 'Card'],
  })
  .input(z.object({
    cardId:  z.string().describe('Card ID'),
    lang:    locale.default('en').describe('Language'),
    version: z.int().positive().optional(),
  }))
  .output(cardFullView)
  .handler(async ({ input }) => {
    const { cardId, lang, version } = input;
    const card = await findCardView(input);

    if (card == null) {
      throw new ORPCError('NOT_FOUND');
    }

    const currentVersion = Math.max(...card.version);

    const versions = await db.select({ version: CardEntityView.version })
      .from(CardEntityView)
      .where(and(
        eq(CardEntityView.cardId, cardId),
        eq(CardEntityView.lang, lang),
      ))
      .orderBy(desc(maxVersion(CardEntityView.version)))
      .then(rows => rows.map(row => row.version.reverse()));

    const sourceRelation = await db.select({
      relation: EntityRelation.relation,
      version:  EntityRelation.version,
      cardId:   EntityRelation.targetId,
    })
      .from(EntityRelation)
      .where(and(
        eq(EntityRelation.sourceId, cardId),
        latestOrVersion(EntityRelation.version, EntityRelation.isLatest, version),
      ));

    const targetRelation = await db.select({
      relation: sql<string>`'source'`.as('relation'),
      version:  EntityRelation.version,
      cardId:   EntityRelation.sourceId,
    })
      .from(EntityRelation)
      .where(and(
        eq(EntityRelation.targetId, cardId),
        latestOrVersion(EntityRelation.version, EntityRelation.isLatest, version),
      ));

    const legacySourceRelation = await db.select({
      relation: CardRelation.relation,
      version:  CardRelation.version,
      cardId:   CardRelation.targetId,
    })
      .from(CardRelation)
      .where(and(
        eq(CardRelation.sourceId, cardId),
        legacyRelationVersion(version, currentVersion),
      ));

    const legacyTargetRelation = await db.select({
      relation: sql<string>`'source'`.as('relation'),
      version:  CardRelation.version,
      cardId:   CardRelation.sourceId,
    })
      .from(CardRelation)
      .where(and(
        eq(CardRelation.targetId, cardId),
        legacyRelationVersion(version, currentVersion),
      ));

    const relatedBase = dedupeRelatedCards([
      ...sourceRelation,
      ...targetRelation,
      ...legacySourceRelation,
      ...legacyTargetRelation,
      ...inferDreamRelatedCards(card.cardId, card.version),
      ...inferMarinRelatedCards(card.cardId, card.version),
    ]);

    const relatedIds = [...new Set(relatedBase.map(rel => rel.cardId))];
    const relatedRows = relatedIds.length === 0
      ? []
      : await db.select().from(CardEntityView)
        .where(and(
          eq(CardEntityView.lang, lang),
          inArray(CardEntityView.cardId, relatedIds),
          latestOrVersion(CardEntityView.version, CardEntityView.isLatest, version),
        ))
        .orderBy(desc(CardEntityView.version));

    const relatedDetail = new Map<string, typeof relatedRows[number]>();
    for (const row of relatedRows) {
      if (!relatedDetail.has(row.cardId)) {
        relatedDetail.set(row.cardId, row);
      }
    }

    const relatedCards = relatedBase.map(rel => {
      const detail = relatedDetail.get(rel.cardId);
      return {
        ...rel,
        name:        detail?.localization.name ?? null,
        displayText: detail?.localization.displayText ?? null,
        type:        detail?.type ?? null,
      };
    });
    const standardSetAvailable = card.collectible && !card.inBobsTavern && isStandardSet(card.set);
    const standardCoreAvailable = await hasStandardCorePrinting(card);

    return {
      ...card,
      versions,
      relatedCards,
      standardSetAvailable,
      standardCoreAvailable,
    };
  });

const profile = os
  .input(z.string())
  .output(cardProfile)
  .handler(async ({ input }) => {
    const cardId = input;

    const localization = await db.select({
      lang: EntityView.lang,
      name: EntityView.localization.name,
    }).from(EntityView).where(and(
      eq(EntityView.cardId, cardId),
      eq(EntityView.isLatest, true),
    ));

    if (localization.length === 0) {
      throw new ORPCError('NOT_FOUND');
    }

    const version = await db.select({ version: CardEntityView.version })
      .from(CardEntityView)
      .where(eq(CardEntityView.cardId, cardId))
      .orderBy(desc(maxVersion(CardEntityView.version)))
      .then(rows => rows.map(row => row.version.reverse()));

    return {
      cardId,
      localization,
      version,
    };
  });

const diff = os
  .route({
    method:      'GET',
    description: 'Get card by ID',
    tags:        ['Hearthstone', 'Card'],
  })
  .input(z.object({
    cardId: z.string().describe('Card ID'),
    lang:   locale.default('en').describe('Language'),
    from:   z.preprocess(val => Number.parseInt(val as string, 0), z.int().positive())
      .describe('From version'),
    to: z.preprocess(val => Number.parseInt(val as string, 0), z.int().positive())
      .describe('To version'),
  }))
  .output(z.any())
  .handler(async ({ input }) => {
    const { cardId, lang, from, to } = input;

    const fromCard = await findCardView({ cardId, lang, version: from });
    const toCard = await findCardView({ cardId, lang, version: to });

    if (fromCard == null || toCard == null) {
      throw new ORPCError('NOT_FOUND');
    }

    const patch = jsonDiff(
      omit(fromCard, ['version', 'isLatest']),
      omit(toCard, ['version', 'isLatest']),
    );

    return patch;
  });

export const cardTrpc = {
  random,
  summary,
  summaryByName,
  full,
  profile,
  diff,
};

export const cardApi = {
  '': summary,
  random,
  full,
  diff,
};

// Removes duplicate relation rows emitted by overlapping legacy and version-aware sources.
function dedupeRelatedCards(cards: Array<{ relation: string, version: number[], cardId: string }>) {
  const seen = new Set<string>();
  const result: Array<{ relation: string, version: number[], cardId: string }> = [];

  for (const card of cards) {
    const key = `${card.relation}:${card.cardId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(card);
  }

  return result;
}

// Infers Dream-card generators that hsdata does not expose as explicit relation tags.
function inferDreamRelatedCards(cardId: string, version: number[]) {
  const targets = dreamRelatedTargets(cardId);

  return targets.map(targetId => ({
    relation: 'entourage',
    version,
    cardId:   targetId,
  }));
}

// Infers Marin treasure links that hsdata does not expose as explicit relation tags.
function inferMarinRelatedCards(cardId: string, version: number[]) {
  const targets = marinRelatedTargets(cardId);

  return targets.map(targetId => ({
    relation: 'entourage',
    version,
    cardId:   targetId,
  }));
}

// Lists known Dream-card token families generated by classic Ysera variants and Shaladrassil.
function dreamRelatedTargets(cardId: string): string[] {
  if (cardId === 'VAN_EX1_572') {
    return vanillaDreamCards;
  }

  if (cardId === 'EDR_846') {
    return [...dreamCards, ...corruptedDreamCards];
  }

  if (['CORE_VAN_EX1_572', 'CS3_033', 'EX1_572', 'LEG_CS3_033'].includes(cardId)) {
    return dreamCards;
  }

  return [];
}

// Lists known treasure cards created by the collectible Marin cards.
function marinRelatedTargets(cardId: string): string[] {
  if (cardId === 'LOOT_357') {
    return ['LOOT_357l', ...marinTreasureCards];
  }

  if (cardId === 'VAC_702') {
    return managerMarinTreasureCards;
  }

  return [];
}

// Detects cards whose current Standard legality comes from a same-name Core printing.
async function hasStandardCorePrinting(card: typeof CardEntityView.$inferSelect) {
  if (!card.collectible) return false;

  const rows = await db.select({ cardId: CardEntityView.cardId })
    .from(CardEntityView)
    .where(and(
      eq(CardEntityView.lang, card.lang),
      eq(CardEntityView.localization.name, card.localization.name),
      eq(CardEntityView.collectible, true),
      eq(CardEntityView.isLatest, true),
      inArray(CardEntityView.set, standardCoreSets),
    ))
    .limit(1);

  return rows.length > 0;
}
