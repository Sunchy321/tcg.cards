import { ORPCError, os } from '@orpc/server';

import _ from 'lodash';
import z from 'zod';

import { eq } from 'drizzle-orm';

import { cardProfile } from '@model/yugioh/schema/card';

import { db } from '@/drizzle';
import { Card, CardLocalization } from '../schema/card';
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
    profile,
};

export const cardApi = {
    random,
};
