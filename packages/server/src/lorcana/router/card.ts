import { ORPCError, os } from '@orpc/server';

import _ from 'lodash';
import z from 'zod';

import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { locale } from '@model/lorcana/schema/basic';
import { cardProfile, cardView } from '@model/lorcana/schema/card';
import { cardFullView } from '@model/lorcana/schema/print';

import { db } from '@/drizzle';
import { Card, CardLocalization, CardView } from '../schema/card';
import { CardPrintView, Print } from '../schema/print';
import { CardRelation } from '../schema/card-relation';

const random = os
    .route({
        method:      'GET',
        description: 'Get random card ID',
        tags:        ['Lorcana', 'Card'],
    })
    .input(z.any())
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
        tags:        ['Lorcana', 'Card'],
    })
    .input(z.object({
        cardId: z.string().describe('Card ID'),
        lang:   locale.default('en').describe('Language of the card'),
    }))
    .output(cardView)
    .handler(async ({ input }) => {
        const { cardId, lang } = input;

        const view = await db.select()
            .from(CardView)
            .where(and(
                eq(CardView.cardId, cardId),
                eq(CardView.lang, lang),
            ))
            .then(rows => rows[0]);

        if (view == null) {
            throw new ORPCError('NOT_FOUND');
        }

        return view;
    });

const fuzzy = os
    .route({
        method: 'GET',
    })
    .input(z.object({
        cardId: z.string(),
        lang:   locale,
        set:    z.string().optional(),
        number: z.string().optional(),
    }))
    .output(cardFullView)
    .handler(async ({ input }) => {
        const { cardId, lang, set, number } = input;

        const fullViews = await db.select()
            .from(CardPrintView)
            .where(eq(CardPrintView.cardId, cardId))
            .orderBy(desc(CardPrintView.print.releaseDate), asc(CardPrintView.lang));

        const cardPrint = (() => {
            if (set != null && number != null) {
                const exact = fullViews.find(view => view.lang === lang && view.set === set && view.number === number);

                if (exact != null) {
                    return exact;
                }

                const setNumber = fullViews.find(view => view.set === set && view.number === number);

                if (setNumber != null) {
                    return setNumber;
                }
            }

            if (set != null) {
                const langSet = fullViews.find(view => view.lang === lang && view.set === set);

                if (langSet != null) {
                    return langSet;
                }

                const setOnly = fullViews.find(view => view.set === set);

                if (setOnly != null) {
                    return setOnly;
                }
            };

            if (number != null) {
                const langNumber = fullViews.find(view => view.lang === lang && view.number === number);

                if (langNumber != null) {
                    return langNumber;
                }

                const numberOnly = fullViews.find(view => view.number === number);

                if (numberOnly != null) {
                    return numberOnly;
                }
            }

            const langOnly = fullViews.find(view => view.lang === lang);

            if (langOnly != null) {
                return langOnly;
            }

            return fullViews[0];
        })();

        if (cardPrint == null) {
            throw new ORPCError('NOT_FOUND');
        }

        const versions = await db.select({
            set:    Print.set,
            number: Print.number,
            lang:   Print.lang,
            rarity: Print.rarity,
        }).from(Print).where(eq(Print.cardId, cardId)).orderBy(desc(Print.releaseDate));

        const sourceRelation = await db.select({
            relation: CardRelation.relation,
            cardId:   CardRelation.targetId,
        }).from(CardRelation).where(eq(CardRelation.sourceId, cardId));

        const targetRelation = await db.select({
            relation: sql<string>`'source'`.as('relation'),
            cardId:   CardRelation.sourceId,
        }).from(CardRelation).where(eq(CardRelation.targetId, cardId));

        const relatedCards = [...sourceRelation, ...targetRelation];

        return {
            ...cardPrint,
            versions,
            relatedCards,
        };
    });

const profile = os
    .input(z.string())
    .output(cardProfile)
    .handler(async ({ input }) => {
        const cardId = input;

        const cardLocalizations = await db.select({
            lang: CardLocalization.lang,
            name: CardLocalization.name,
        }).from(CardLocalization).where(eq(CardLocalization.cardId, cardId));

        if (cardLocalizations.length === 0) {
            throw new ORPCError('NOT_FOUND');
        }

        const versions = await db.select({
            lang:        Print.lang,
            set:         Print.set,
            number:      Print.number,
            rarity:      Print.rarity,
            layout:      Print.layout,
            releaseDate: Print.releaseDate,
        }).from(Print).where(eq(Print.cardId, cardId));

        return {
            cardId,
            localization: cardLocalizations,
            versions,
        };
    });

export const cardTrpc = {
    random,
    summary,
    fuzzy,
    profile,
};

export const cardApi = {
    '': summary,
    random,
};
