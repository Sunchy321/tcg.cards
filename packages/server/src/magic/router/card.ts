import { t } from '@/trpc';
import { z } from 'zod';

import { and, asc, desc, eq, getTableColumns, sql } from 'drizzle-orm';
import _ from 'lodash';

import { fullLocale } from '@model/magic/basic';
import { cardProfile } from '@model/magic/card';
import { cardFullView } from '@model/magic/print';

import { db } from '@/drizzle';
import { Print } from '../schema/print';
import { Card, CardLocalization } from '../schema/card';
import { CardPrintView } from '../schema/print';
import { Ruling } from '../schema/ruling';
import { CardRelation } from '../schema/card-relation';

export const cardRouter = t.router({
    random: t.procedure
        .meta({ openapi: { method: 'GET', path: '/magic/random' } })
        .input(z.void())
        .output(z.string())
        .query(async () => {
            const cards = await db.select({ cardId: Card.cardId }).from(Card);

            return cards[_.random(0, cards.length - 1)].cardId;
        }),

    fuzzy: t.procedure
        .input(z.object({
            cardId:    z.string(),
            lang:      fullLocale,
            set:       z.string().optional(),
            number:    z.string().optional(),
            partIndex: z.number().optional(),
        }))
        .output(cardFullView.optional())
        .query(async ({ input }) => {
            const { cardId, lang, set, number, partIndex } = input;

            const fullViews = await db.select()
                .from(CardPrintView)
                .where(and(
                    eq(CardPrintView.cardId, cardId),
                    eq(CardPrintView.partIndex, partIndex ?? 0),
                ))
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

                const langOnly = fullViews.find(view => view.lang === lang);

                if (langOnly != null) {
                    return langOnly;
                }

                return fullViews[0];
            })();

            if (cardPrint == null) {
                return undefined;
            }

            const versions = await db.select({
                set:    Print.set,
                number: Print.number,
                lang:   Print.lang,
                rarity: Print.rarity,
            }).from(Print).where(eq(Print.cardId, cardId));

            const rulings = await db.select({
                ..._.omit(getTableColumns(Ruling), 'id'),
            }).from(Ruling).where(eq(Ruling.cardId, cardId));

            const sourceRelation = await db.select({
                relation: CardRelation.relation,
                cardId:   CardRelation.targetId,
            }).from(CardRelation).where(eq(CardRelation.sourceId, cardId));

            const targetRelation = await db.select({
                relation: sql<string>`'source'`.as('relation'),
                cardId:   CardRelation.sourceId,
            }).from(CardRelation).where(eq(CardRelation.targetId, cardId));

            const relatedCards = [
                ...sourceRelation,
                ...targetRelation,
            ];

            console.log(rulings, relatedCards);

            return {
                ...cardPrint,
                versions,
                rulings,
                relatedCards,
            };
        }),

    profile: t.procedure
        .input(z.object({ cardId: z.string() }))
        .output(cardProfile.optional())
        .query(async ({ input }) => {
            const { cardId } = input;

            const cardLocalizations = await db.select().from(CardLocalization).where(eq(CardLocalization.cardId, cardId));

            if (cardLocalizations.length === 0) {
                return undefined;
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
        }),
});
