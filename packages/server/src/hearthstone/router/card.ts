import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver, validator } from 'hono-openapi/zod';

import { and, desc, eq, sql } from 'drizzle-orm';
import z from 'zod';
import _ from 'lodash';

import { db } from '@/drizzle';
import { Card } from '../schema/card';
import { CardEntityView, EntityView } from '../schema/entity';
import { CardRelation } from '../schema/card-relation';

import { locale } from '@model/hearthstone/schema/basic';
import { cardProfile } from '@model/hearthstone/schema/card';
import { cardFullView } from '@model/hearthstone/schema/entity';

export const cardRouter = new Hono()
    .get(
        '/random',
        describeRoute({
            description: 'Get a random card ID',
            tags:        ['Hearthstone', 'Card'],
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
        '/full',
        describeRoute({
            description: 'Get card by ID',
            tags:        ['Hearthstone', 'Card'],
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
        validator('query', z.object({
            cardId:  z.string().describe('Card ID'),
            lang:    locale.default('en'),
            version: z.preprocess(val => val ? Number.parseInt(val as string, 0) : undefined, z.int().positive().optional())
                .describe('Card version'),
        })),
        async c => {
            c.header('Cache-Control', 'public, max-age=3600');

            const { cardId, lang, version } = c.req.valid('query');

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
                return c.notFound();
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

            return c.json({
                ...card,
                versions,
                relatedCards,
            });
        },
    )
    .get(
        '/profile',
        describeRoute({
            description: 'Get card profile by card ID',
            tags:        ['Hearthstone', 'Card'],
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
        validator('query', z.object({ cardId: z.string() })),
        async c => {
            c.header('Cache-Control', 'public, max-age=3600');

            const { cardId } = c.req.valid('query');

            const localization = await db.select({
                lang: EntityView.lang,
                name: EntityView.localization.name,
            }).from(EntityView).where(and(
                eq(EntityView.cardId, cardId),
                eq(EntityView.isLatest, true),
            ));

            if (localization.length === 0) {
                return c.notFound();
            }

            const version = await db.select({ version: CardEntityView.version })
                .from(CardEntityView)
                .where(eq(CardEntityView.cardId, cardId))
                .orderBy(desc(CardEntityView.version))
                .then(rows => rows.map(row => row.version.reverse()));

            return c.json({
                cardId,
                localization,
                version,
            });
        },
    ); ;
