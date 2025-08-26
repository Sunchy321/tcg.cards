import { os } from '@orpc/server';

import _ from 'lodash';
import z from 'zod';

import { db } from '@/drizzle';
import { Card } from '@/lorcana/schema/card';

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

export const cardTrpc = {
    random,
};

export const cardApi = {
    random,
};
