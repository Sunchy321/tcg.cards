import { ORPCError, os } from '@orpc/server';

import z from 'zod';
import { random as randomInt, omit } from 'lodash-es';
import { and, desc, eq, sql } from 'drizzle-orm';
import { diff as jsonDiff } from 'jsondiffpatch';

import { db } from '#db/db';
import { CardEntityView, EntityView } from '#schema/hearthstone/entity';
import { EntityRelation } from '#schema/hearthstone/entity-relation';

import { locale } from '#model/hearthstone/schema/basic';
import { cardProfile } from '#model/hearthstone/schema/card';
import { cardEntityView, cardFullView } from '#model/hearthstone/schema/entity';

const maxVersion = (version: typeof CardEntityView.version) => sql<number>`
  (
    SELECT max(value)
    FROM unnest(${version}) AS version_item(value)
  )
`;

function byVersion(
  versionColumn: typeof CardEntityView.version | typeof EntityRelation.version,
  version: number | undefined,
) {
  return version == null ? null : sql`${version} = any(${versionColumn})`;
}

function latestOrVersion(
  versionColumn: typeof CardEntityView.version | typeof EntityRelation.version,
  latestColumn: typeof CardEntityView.isLatest | typeof EntityRelation.isLatest,
  version: number | undefined,
) {
  return version == null
    ? eq(latestColumn, true)
    : sql`${version} = any(${versionColumn})`;
}

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
    const cards = await db.select({ cardId: CardEntityView.cardId })
      .from(CardEntityView)
      .where(and(
        eq(CardEntityView.isLatest, true),
        eq(CardEntityView.lang, 'en'),
      ));

    const cardId = cards[randomInt(0, cards.length - 1)]!.cardId;

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
        eq(EntityRelation.sourceRevisionHash, card.revisionHash),
        ...version != null ? [byVersion(EntityRelation.version, version)!] : [],
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

    const relatedCards = [...sourceRelation, ...targetRelation]
      .sort((left, right) =>
        left.relation.localeCompare(right.relation)
        || left.cardId.localeCompare(right.cardId),
      );

    return {
      ...card,
      versions,
      relatedCards,
    };
  })
  .callable();

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
