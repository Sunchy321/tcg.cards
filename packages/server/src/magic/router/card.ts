import { t } from '@/trpc';
import { z } from 'zod';

import _ from 'lodash';

import { cardPrintView } from '@model/magic/print';

import { db } from '@/drizzle';
import { Card } from '../schema/card';
import { CardPrintView } from '../schema/print';

import { extendedLocales } from '@static/magic/basic';
import { and, eq } from 'drizzle-orm';

export const cardRouter = t.router({
    random: t.procedure
        .meta({ openapi: { method: 'GET', path: '/magic/random' } })
        .input(z.void())
        .output(z.string())
        .query(async () => {
            const cards = await db.select({ cardId: Card.cardId }).from(Card);

            return cards[_.random(0, cards.length - 1)].cardId;
        }),

    cardPrintView: t.procedure
        .input(
            z.strictObject({
                id:        z.string(),
                lang:      z.enum(extendedLocales).optional(),
                set:       z.string().optional(),
                number:    z.string().optional(),
                partIndex: z.number().optional(),
            }),
        )
        .output(cardPrintView.optional())
        .query(async ({ input }) => {
            const { id, lang, set, number, partIndex } = input;

            const result = await db.select()
                .from(CardPrintView)
                .where(and(
                    eq(CardPrintView.cardId, id),
                    ...lang != null ? [eq(CardPrintView.lang, lang)] : [],
                    ...set != null ? [eq(CardPrintView.set, set)] : [],
                    ...number != null ? [eq(CardPrintView.number, number)] : [],
                    eq(CardPrintView.partIndex, partIndex ?? 0),
                ));

            return result[0];
        }),
});
