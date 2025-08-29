import { ORPCError, os } from '@orpc/server';

import _ from 'lodash';
import z from 'zod';

import { and, eq } from 'drizzle-orm';

import { locale } from '@model/yugioh/schema/basic';
import { cardProfile, cardView } from '@model/yugioh/schema/card';

import { db } from '@/drizzle';
import { Card, CardLocalization, CardView } from '../schema/card';
import { Print } from '../schema/print';

const random = os
    .route({
        method:      'GET',
        description: 'Get random card ID',
        tags:        ['Yugioh', 'Card'],
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
        tags:        ['Yugioh', 'Card'],
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

const summaryByName = os
    .input(z.object({
        name: z.string(),
        lang: locale.default('en'),
    }))
    .output(cardView.array())
    .handler(async ({ input }) => {
        const { name, lang } = input;

        const cards = await db.select().from(CardView)
            .where(and(
                eq(CardView.localization.name, name),
                eq(CardView.lang, lang),
            ));

        if (cards.length == 0) {
            throw new ORPCError('NOT_FOUND');
        }

        return cards;
    });

const profile = os
    .input(z.string())
    .output(cardProfile)
    .handler(async ({ input }) => {
        const cardId = input;

        const card = await db.select().from(Card)
            .where(eq(Card.cardId, cardId))
            .limit(1)
            .then(rows => rows[0]);

        if (card == null) {
            throw new ORPCError('NOT_FOUND');
        }

        const cardLocalizations = await db.select({
            lang: CardLocalization.lang,
            name: CardLocalization.name,
        }).from(CardLocalization).where(eq(CardLocalization.cardId, cardId));

        const versions = await db.select({
            lang:   Print.lang,
            set:    Print.set,
            number: Print.number,
            rarity: Print.rarity,
        }).from(Print).where(eq(Print.cardId, cardId));

        return {
            cardId,
            localization: cardLocalizations,
            passcode:     card.passcode,
            versions,
        };
    });

export const cardTrpc = {
    random,
    summary,
    summaryByName,
    profile,
};

export const cardApi = {
    '': summary,
    random,
};
