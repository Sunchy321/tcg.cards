import { ORPCError, os } from '@orpc/server';

import z from 'zod';
import _ from 'lodash';
import { and, desc, eq, sql } from 'drizzle-orm';
import { diff as jsonDiff } from 'jsondiffpatch';

import { db } from '@/drizzle';
import { Card } from '../schema/card';
import { CardEntityView, EntityView } from '../schema/entity';
import { CardRelation } from '../schema/card-relation';

import { locale } from '@model/hearthstone/schema/basic';
import { cardProfile } from '@model/hearthstone/schema/card';
import { cardEntityView, cardFullView } from '@model/hearthstone/schema/entity';

const random = os
    .input(z.void())
    .output(z.string())
    .handler(async () => {
        const cards = await db.select({ cardId: Card.cardId }).from(Card);
        const cardId = cards[_.random(0, cards.length - 1)].cardId;

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
        const { cardId, lang, version } = input;

        const card = await db.select().from(CardEntityView)
            .where(and(
                eq(CardEntityView.cardId, cardId),
                eq(CardEntityView.lang, lang),
                ...version != null ? [sql`${version} = any(${CardEntityView.version})`] : [],
            ))
            .orderBy(desc(CardEntityView.version))
            .limit(1)
            .then(rows => rows[0]);

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
                ...version != null ? [sql`${version} = any(${CardEntityView.version})`] : [],
            ))
            .orderBy(desc(CardEntityView.version));

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

        const card = await db.select().from(CardEntityView)
            .where(and(
                eq(CardEntityView.cardId, cardId),
                eq(CardEntityView.lang, lang),
                ...version != null ? [sql`${version} = any(${CardEntityView.version})`] : [],
            ))
            .orderBy(desc(CardEntityView.version))
            .limit(1)
            .then(rows => rows[0]);

        if (card == null) {
            throw new ORPCError('NOT_FOUND');
        }

        const versions = await db.select({ version: CardEntityView.version })
            .from(CardEntityView)
            .where(and(
                eq(CardEntityView.cardId, cardId),
                eq(CardEntityView.lang, lang),
            ))
            .orderBy(desc(CardEntityView.version))
            .then(rows => rows.map(row => row.version.reverse()));

        const sourceRelation = await db.select({
            relation: CardRelation.relation,
            version:  CardRelation.version,
            cardId:   CardRelation.targetId,
        }).from(CardRelation).where(eq(CardRelation.sourceId, cardId));

        const targetRelation = await db.select({
            relation: sql<string>`'source'`.as('relation'),
            version:  CardRelation.version,
            cardId:   CardRelation.sourceId,
        }).from(CardRelation).where(eq(CardRelation.targetId, cardId));

        const relatedCards = [...sourceRelation, ...targetRelation];

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
            .orderBy(desc(CardEntityView.version))
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

        const fromCard = await db.select().from(CardEntityView)
            .where(and(
                eq(CardEntityView.cardId, cardId),
                eq(CardEntityView.lang, lang),
                sql`${from} = any(${CardEntityView.version})`,
            ))
            .orderBy(desc(CardEntityView.version))
            .limit(1)
            .then(rows => rows[0]);

        const toCard = await db.select(

        ).from(CardEntityView)
            .where(and(
                eq(CardEntityView.cardId, cardId),
                eq(CardEntityView.lang, lang),
                sql`${to} = any(${CardEntityView.version})`,
            ))
            .orderBy(desc(CardEntityView.version))
            .limit(1)
            .then(rows => rows[0]);

        if (fromCard == null || toCard == null) {
            throw new ORPCError('NOT_FOUND');
        }

        const patch = jsonDiff(
            _.omit(fromCard, ['version', 'isLatest']),
            _.omit(toCard, ['version', 'isLatest']),
        );

        return patch;
    });

export const cardTrpc = {
    random,
    summary,
    summaryByName,
    full,
    profile,
};

export const cardApi = {
    '': summary,
    full,
    diff,
};
