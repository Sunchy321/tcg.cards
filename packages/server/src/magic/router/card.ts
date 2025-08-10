import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver, validator as zValidator } from 'hono-openapi/zod';

import z from 'zod';

import { and, asc, desc, eq, getTableColumns, sql } from 'drizzle-orm';
import _ from 'lodash';

import { fullLocale } from '@model/magic/schema/basic';
import { cardProfile, cardView } from '@model/magic/schema/card';
import { cardFullView } from '@model/magic/schema/print';

import { db } from '@/drizzle';
import { Print } from '../schema/print';
import { Card, CardLocalization, CardView } from '../schema/card';
import { CardPrintView } from '../schema/print';
import { Ruling } from '../schema/ruling';
import { CardRelation } from '../schema/card-relation';

export const cardRouter = new Hono()
    .get(
        '/random',
        describeRoute({
            description: 'Get a random card ID',
            tags:        ['Magic', 'Card'],
            responses:   {
                200: {
                    description: 'Random card ID',
                    content:     {
                        'application/json': {
                            schema: resolver(z.string()),
                        },
                    },
                },
            },
            validateResponse: true,
        }),
        async c => {
            const cards = await db.select({ cardId: Card.cardId }).from(Card);
            const cardId = cards[_.random(0, cards.length - 1)].cardId;

            return c.json(cardId);
        },
    )
    .get(
        '/fuzzy',
        describeRoute({
            description: 'Get a card by fuzzy match',
            tags:        ['Magic', 'Card'],
            responses:   {
                200: {
                    description: 'Card full view',
                    content:     {
                        'application/json': {
                            schema: resolver(cardFullView),
                        },
                    },
                },
            },
            validateResponse: true,
        }),
        zValidator('query', z.object({
            cardId:    z.string(),
            lang:      fullLocale,
            set:       z.string().optional(),
            number:    z.string().optional(),
            partIndex: z.string().transform(v => Number.parseInt(v, 10) || 0).pipe(z.int()).optional(),
        })),
        async c => {
            const { cardId, lang, set, number, partIndex } = c.req.valid('query');

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
                return c.notFound();
            }

            const versions = await db.select({
                set:    Print.set,
                number: Print.number,
                lang:   Print.lang,
                rarity: Print.rarity,
            }).from(Print).where(eq(Print.cardId, cardId)).orderBy(desc(Print.releaseDate));

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

            const relatedCards = [...sourceRelation, ...targetRelation];

            return c.json({
                ...cardPrint,
                versions,
                rulings,
                relatedCards,
            });
        },
    )
    .get(
        '/profile',
        describeRoute({
            description: 'Get card profile by card ID',
            tags:        ['Magic', 'Card'],
            responses:   {
                200: {
                    description: 'Card profile',
                    content:     {
                        'application/json': {
                            schema: resolver(cardProfile),
                        },
                    },
                },
            },
            validateResponse: true,
        }),
        zValidator('query', z.object({ cardId: z.string() })),
        async c => {
            const { cardId } = c.req.valid('query');

            const cardLocalizations = await db.select({
                lang: CardLocalization.lang,
                name: CardLocalization.name,
            }).from(CardLocalization).where(eq(CardLocalization.cardId, cardId));

            if (cardLocalizations.length === 0) {
                return c.notFound();
            }

            const versions = await db.select({
                lang:          Print.lang,
                set:           Print.set,
                number:        Print.number,
                rarity:        Print.rarity,
                layout:        Print.layout,
                fullImageType: Print.fullImageType,
                releaseDate:   Print.releaseDate,
            }).from(Print).where(eq(Print.cardId, cardId));

            return c.json({
                cardId,
                localization: cardLocalizations,
                versions,
            });
        },
    );

export const cardApi = new Hono()
    .get(
        '/',
        describeRoute({
            description: 'Get card by ID',
            tags:        ['Magic', 'Card'],
            responses:   {
                200: {
                    description: 'Card full view',
                    content:     {
                        'application/json': {
                            schema: resolver(cardView),
                        },
                    },
                },
            },
            validateResponse: true,
        }),
        zValidator('query', z.object({
            id:        z.string(),
            lang:      fullLocale.default('en'),
            partIndex: z.string().default('0').transform(v => Number.parseInt(v, 10) || 0).pipe(z.int()),
        })),
        async c => {
            const { id: cardId, lang, partIndex } = c.req.valid('query');

            const views = await db.select()
                .from(CardView)
                .where(and(
                    eq(CardView.cardId, cardId),
                    eq(CardView.lang, lang),
                    eq(CardView.partIndex, partIndex),
                ));

            if (views.length === 0) {
                return c.notFound();
            }

            return c.json(views[0]);
        },
    );
