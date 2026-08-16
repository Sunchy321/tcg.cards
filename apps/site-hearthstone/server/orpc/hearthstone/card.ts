import { ORPCError, os } from '@orpc/server';

import z from 'zod';
import { omit } from 'lodash-es';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { diff as jsonDiff } from 'jsondiffpatch';

import { db } from '#db/db';
import { CardEntityView, BaseEntityLocalization, LatestEntity } from '#schema/shared/hearthstone/entity';
import { EntityRelation, LatestEntityRelation } from '#schema/shared/hearthstone/entity-relation';
import { Tag } from '#schema/shared/hearthstone/tag';

import { locale } from '#model/hearthstone/schema/basic';
import { cardProfile } from '#model/hearthstone/schema/card';
import { cardEntityView, cardFullView, type HeroPowerAttachment } from '#model/hearthstone/schema/entity';

import { getRandomCardId } from '~~/server/utils/random-card';

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
  version: number | undefined,
) {
  return version == null
    ? undefined
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
  ];
  const versionFilter = latestOrVersion(CardEntityView.version, input.version);
  if (versionFilter != null) {
    filters.push(versionFilter);
  }

  return await db.select().from(CardEntityView)
    .where(and(...filters))
    .orderBy(desc(maxVersion(CardEntityView.version)))
    .limit(1)
    .then(rows => rows[0]);
}

/** Resolve a card view at a version, falling back to the nearest earlier revision. */
async function findCardViewAtOrBefore(input: {
  cardId:   string;
  lang:     z.infer<typeof locale>;
  version?: number | undefined;
}) {
  const view = await findCardView(input);

  if (view != null || input.version == null) {
    return view ?? null;
  }

  return await db.select().from(CardEntityView)
    .where(and(
      eq(CardEntityView.cardId, input.cardId),
      eq(CardEntityView.lang, input.lang),
      sql`${maxVersion(CardEntityView.version)} < ${input.version}`,
    ))
    .orderBy(desc(maxVersion(CardEntityView.version)))
    .limit(1)
    .then(rows => rows[0] ?? null);
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

    const versionFilter = latestOrVersion(CardEntityView.version, version);
    const cards = await db.select().from(CardEntityView)
      .where(and(
        eq(CardEntityView.localization.name, name),
        eq(CardEntityView.lang, lang),
        ...(versionFilter != null ? [versionFilter] : []),
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

    // Resolve numeric mechanic/referencedTag keys to slugs
    const mechanicKeys = [
      ...Object.keys(card.mechanics ?? {}),
      ...Object.keys(card.referencedTags ?? {}),
    ];
    const numericIds = mechanicKeys
      .filter(k => /^\d+$/.test(k))
      .map(Number);
    const mechanicTags: Record<string, string> = {};
    if (numericIds.length > 0) {
      const tagRows = await db.select({ enumId: Tag.enumId, slug: Tag.slug })
        .from(Tag)
        .where(inArray(Tag.enumId, numericIds));
      for (const row of tagRows) {
        mechanicTags[String(row.enumId)] = row.slug;
      }
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

    const targetRelation = version != null
      ? await db.select({
        relation: sql<string>`'source'`.as('relation'),
        version:  EntityRelation.version,
        cardId:   EntityRelation.sourceId,
      })
        .from(EntityRelation)
        .where(and(
          eq(EntityRelation.targetId, cardId),
          sql`${version} = any(${EntityRelation.version})`,
        ))
      : await db.select({
        relation: sql<string>`'source'`.as('relation'),
        version:  LatestEntityRelation.version,
        cardId:   LatestEntityRelation.sourceId,
      })
        .from(LatestEntityRelation)
        .where(eq(LatestEntityRelation.targetId, cardId));

    const entourageRelation = (card.legacyPayload.entourages as string[] ?? []).map(relatedCardId => ({
      relation: 'entourage',
      version:  card.version,
      cardId:   relatedCardId,
    }));

    const relatedBase = dedupeRelatedCards([
      ...sourceRelation,
      ...targetRelation,
      ...entourageRelation,
    ]);

    const relatedIds = [...new Set(relatedBase.map(rel => rel.cardId))];
    const relatedRows = relatedIds.length === 0
      ? []
      : await db.select().from(CardEntityView)
        .where(and(
          eq(CardEntityView.lang, lang),
          inArray(CardEntityView.cardId, relatedIds),
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

    // Resolve hero power attachment: distinct targets across all revisions (for
    // union version breakpoints) plus the target view current at the page version.
    let heroPower: HeroPowerAttachment | null = null;
    if (card.heroPower != null) {
      const targetRows = await db.selectDistinct({ heroPower: CardEntityView.heroPower })
        .from(CardEntityView)
        .where(and(
          eq(CardEntityView.cardId, cardId),
          eq(CardEntityView.lang, lang),
          sql`${CardEntityView.heroPower} is not null`,
        ));
      const targetIds = targetRows
        .map(row => row.heroPower)
        .filter((id): id is string => id != null);

      const targetVersionRows = targetIds.length > 0
        ? await db.select({ cardId: CardEntityView.cardId, version: CardEntityView.version })
          .from(CardEntityView)
          .where(and(
            eq(CardEntityView.lang, lang),
            inArray(CardEntityView.cardId, targetIds),
          ))
          .orderBy(desc(maxVersion(CardEntityView.version)))
        : [];

      const versionsByTarget = new Map<string, number[][]>();
      for (const row of targetVersionRows) {
        const list = versionsByTarget.get(row.cardId) ?? [];
        list.push(row.version.reverse());
        versionsByTarget.set(row.cardId, list);
      }

      const targets = targetIds.map(targetId => ({
        cardId:   targetId,
        versions: versionsByTarget.get(targetId) ?? [],
      }));

      const current = await findCardViewAtOrBefore({ cardId: card.heroPower, lang, version });

      heroPower = { targets, current };
    }

    return {
      ...card,
      versions,
      mechanicTags,
      relatedCards,
      heroPower,
    };
  });

const profile = os
  .input(z.string())
  .output(cardProfile)
  .handler(async ({ input }) => {
    const cardId = input;

    const localization = await db.select({
      lang: BaseEntityLocalization.lang,
      name: BaseEntityLocalization.name,
    }).from(LatestEntity)
      .innerJoin(BaseEntityLocalization, and(
        eq(LatestEntity.cardId, BaseEntityLocalization.cardId),
        eq(LatestEntity.revisionHash, BaseEntityLocalization.revisionHash),
        sql`${LatestEntity.version} && ${BaseEntityLocalization.version}`,
      ))
      .where(eq(LatestEntity.cardId, cardId));

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
      omit(fromCard, ['version']),
      omit(toCard, ['version']),
    );

    return patch;
  });

const snapshots = os
  .route({
    method:      'GET',
    description: 'Get card entity and render JSON at two versions for diffing',
    tags:        ['Hearthstone', 'Card'],
  })
  .input(z.object({
    cardId: z.string(),
    lang:   locale.default('en'),
    from:   z.preprocess(val => Number.parseInt(val as string, 0), z.int().positive()),
    to:     z.preprocess(val => Number.parseInt(val as string, 0), z.int().positive()),
  }))
  .output(z.object({
    entityBefore: z.unknown().nullable(),
    entityAfter:  z.unknown().nullable(),
    renderBefore: z.unknown().nullable(),
    renderAfter:  z.unknown().nullable(),
  }))
  .handler(async ({ input }) => {
    const { cardId, lang, from, to } = input;

    const fromCard = await findCardView({ cardId, lang, version: from });
    const toCard = await findCardView({ cardId, lang, version: to });

    const [fromLoc] = await db.select({ renderModel: BaseEntityLocalization.renderModel })
      .from(BaseEntityLocalization)
      .where(and(
        eq(BaseEntityLocalization.cardId, cardId),
        eq(BaseEntityLocalization.lang, lang),
        sql`${from} = ANY(${BaseEntityLocalization.version})`,
      ))
      .orderBy(desc(sql`array_length(${BaseEntityLocalization.version}, 1)`))
      .limit(1);

    const [toLoc] = await db.select({ renderModel: BaseEntityLocalization.renderModel })
      .from(BaseEntityLocalization)
      .where(and(
        eq(BaseEntityLocalization.cardId, cardId),
        eq(BaseEntityLocalization.lang, lang),
        sql`${to} = ANY(${BaseEntityLocalization.version})`,
      ))
      .orderBy(desc(sql`array_length(${BaseEntityLocalization.version}, 1)`))
      .limit(1);

    return {
      entityBefore: fromCard ? omit(fromCard, ['version', 'localization']) : null,
      entityAfter:  toCard ? omit(toCard, ['version', 'localization']) : null,
      renderBefore: fromLoc?.renderModel ?? null,
      renderAfter:  toLoc?.renderModel ?? null,
    };
  });

export const cardTrpc = {
  random,
  summary,
  summaryByName,
  full,
  profile,
  diff,
  snapshots,
};

export const cardApi = {
  '': summary,
  random,
  full,
  diff,
  snapshots,
};

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
